package blocking

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"maps"
	"slices"
	"sync"
	"time"

	"github.com/nigowl/bitmagnet/internal/bloom"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/protocol"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Manager interface {
	Filter(ctx context.Context, hashes []protocol.ID) ([]protocol.ID, error)
	Block(ctx context.Context, hashes []protocol.ID, flush bool) error
	Flush(ctx context.Context) error
}

type manager struct {
	mutex         sync.Mutex
	db            *gorm.DB
	buffer        map[protocol.ID]struct{}
	filter        *bloom.StableBloomFilter
	maxBufferSize int
	lastFlushedAt time.Time
	maxFlushWait  time.Duration
}

func (m *manager) Filter(ctx context.Context, hashes []protocol.ID) ([]protocol.ID, error) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if m.filter == nil || m.shouldFlush() {
		if flushErr := m.flush(ctx); flushErr != nil {
			return nil, flushErr
		}
	}

	filtered := make([]protocol.ID, 0, len(hashes))

	for _, hash := range hashes {
		if _, ok := m.buffer[hash]; ok {
			continue
		}

		if m.filter.Test(hash[:]) {
			continue
		}

		filtered = append(filtered, hash)
	}

	return filtered, nil
}

func (m *manager) Block(ctx context.Context, hashes []protocol.ID, flush bool) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	for _, hash := range hashes {
		m.buffer[hash] = struct{}{}
	}

	if flush || m.shouldFlush() {
		if flushErr := m.flush(ctx); flushErr != nil {
			return flushErr
		}
	}

	return nil
}

func (m *manager) Flush(ctx context.Context) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if len(m.buffer) == 0 {
		return nil
	}

	return m.flush(ctx)
}

const blockedTorrentsBloomFilterKey = "blocked_torrents"

func (m *manager) flush(ctx context.Context) error {
	hashes := slices.Collect(maps.Keys(m.buffer))

	bf := bloom.NewDefaultStableBloomFilter()
	now := time.Now()

	if err := m.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if len(hashes) > 0 {
			if err := tx.Where("info_hash IN ?", hashes).Delete(&model.Torrent{}).Error; err != nil {
				return fmt.Errorf("failed to delete from torrents table: %w", err)
			}
		}

		record, found, err := m.findBloomFilter(ctx, tx)
		if err != nil {
			return err
		}

		if record.Oid.Valid {
			data, readErr := m.readLargeObject(ctx, tx, record.Oid.Int32)
			if readErr != nil {
				return readErr
			}
			if _, readErr = bf.ReadFrom(bytes.NewReader(data)); readErr != nil {
				return fmt.Errorf("failed to read current bloom filter: %w", readErr)
			}
		}

		for _, hash := range hashes {
			bf.Add(hash[:])
		}

		if !record.Oid.Valid {
			oid, createErr := m.createLargeObject(ctx, tx)
			if createErr != nil {
				return createErr
			}
			record.Oid.Int32 = oid
			record.Oid.Valid = true
		}

		var encoded bytes.Buffer
		if _, writeErr := bf.WriteTo(&encoded); writeErr != nil {
			return fmt.Errorf("failed to serialize bloom filter: %w", writeErr)
		}

		if writeErr := m.writeLargeObject(ctx, tx, record.Oid.Int32, encoded.Bytes()); writeErr != nil {
			return writeErr
		}

		record.UpdatedAt = now
		if !found {
			record.Key = blockedTorrentsBloomFilterKey
			record.CreatedAt = now
			if err := tx.Create(&record).Error; err != nil {
				return fmt.Errorf("failed to save new bloom filter record: %w", err)
			}
			return nil
		}

		if err := tx.Save(&record).Error; err != nil {
			return fmt.Errorf("failed to update bloom filter record: %w", err)
		}

		return nil
	}); err != nil {
		return err
	}

	m.buffer = make(map[protocol.ID]struct{})
	m.filter = bf
	m.lastFlushedAt = now

	return nil
}

func (m *manager) findBloomFilter(
	ctx context.Context,
	tx *gorm.DB,
) (record model.BloomFilter, found bool, err error) {
	err = tx.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("key = ?", blockedTorrentsBloomFilterKey).
		First(&record).
		Error
	if err == nil {
		return record, true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.BloomFilter{}, false, nil
	}

	return model.BloomFilter{}, false, fmt.Errorf("failed to get bloom filter object ID: %w", err)
}

func (m *manager) createLargeObject(ctx context.Context, tx *gorm.DB) (int32, error) {
	var oid int32
	if err := tx.WithContext(ctx).Raw("SELECT lo_create(0)").Row().Scan(&oid); err != nil {
		return 0, fmt.Errorf("failed to create large object: %w", err)
	}
	return oid, nil
}

func (m *manager) readLargeObject(ctx context.Context, tx *gorm.DB, oid int32) ([]byte, error) {
	var data []byte
	if err := tx.WithContext(ctx).Raw("SELECT lo_get(?)", oid).Row().Scan(&data); err != nil {
		return nil, fmt.Errorf("failed to read large object: %w", err)
	}
	return data, nil
}

func (m *manager) writeLargeObject(ctx context.Context, tx *gorm.DB, oid int32, data []byte) error {
	if err := tx.WithContext(ctx).Exec("SELECT lo_put(?, 0, ?)", oid, data).Error; err != nil {
		return fmt.Errorf("failed to write large object: %w", err)
	}
	return nil
}

func (m *manager) shouldFlush() bool {
	return len(m.buffer) >= m.maxBufferSize || time.Since(m.lastFlushedAt) >= m.maxFlushWait
}
