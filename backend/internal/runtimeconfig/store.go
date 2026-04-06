package runtimeconfig

import (
	"context"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func ReadValues(ctx context.Context, db *gorm.DB, keys []string) (map[string]string, error) {
	normalizedKeys := normalizeRequestedKeys(keys)
	if len(normalizedKeys) == 0 {
		return map[string]string{}, nil
	}

	mode := ActiveMode()
	lookupKeys := make([]string, 0, len(normalizedKeys)*2)
	seenLookup := make(map[string]struct{}, len(normalizedKeys)*2)
	for _, key := range normalizedKeys {
		primaryKey := scopedKeyForMode(mode, key)
		if primaryKey == "" {
			continue
		}
		if _, exists := seenLookup[primaryKey]; !exists {
			seenLookup[primaryKey] = struct{}{}
			lookupKeys = append(lookupKeys, primaryKey)
		}
		if mode == ModeDevelopment {
			fallbackKey := normalizeRuntimeKey(key)
			if fallbackKey != "" {
				if _, exists := seenLookup[fallbackKey]; !exists {
					seenLookup[fallbackKey] = struct{}{}
					lookupKeys = append(lookupKeys, fallbackKey)
				}
			}
		}
	}
	if len(lookupKeys) == 0 {
		return map[string]string{}, nil
	}

	var items []model.KeyValue
	if err := db.WithContext(ctx).
		Table(model.TableNameKeyValue).
		Where("key IN ?", lookupKeys).
		Find(&items).Error; err != nil {
		return nil, err
	}

	rawValues := make(map[string]string, len(items))
	for _, item := range items {
		key := strings.TrimSpace(item.Key)
		if key == "" {
			continue
		}
		rawValues[key] = item.Value
	}

	result := make(map[string]string, len(normalizedKeys))
	for _, baseKey := range normalizedKeys {
		primaryKey := scopedKeyForMode(mode, baseKey)
		if primaryKey == "" {
			continue
		}
		if value, exists := rawValues[primaryKey]; exists {
			result[baseKey] = value
			continue
		}
		if mode == ModeDevelopment {
			fallbackKey := normalizeRuntimeKey(baseKey)
			if fallbackValue, exists := rawValues[fallbackKey]; exists {
				result[baseKey] = fallbackValue
			}
		}
	}

	return result, nil
}

func WriteValues(ctx context.Context, db *gorm.DB, updates map[string]*string) error {
	if len(updates) == 0 {
		return nil
	}

	mode := ActiveMode()
	now := time.Now()
	for key, valuePtr := range updates {
		baseKey := normalizeRuntimeKey(key)
		if baseKey == "" {
			continue
		}
		scopedKey := scopedKeyForMode(mode, baseKey)
		if scopedKey == "" {
			continue
		}

		if valuePtr == nil {
			if err := db.WithContext(ctx).
				Table(model.TableNameKeyValue).
				Where("key = ?", scopedKey).
				Delete(&model.KeyValue{}).Error; err != nil {
				return err
			}
			continue
		}

		item := model.KeyValue{
			Key:       scopedKey,
			Value:     *valuePtr,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := db.WithContext(ctx).
			Table(model.TableNameKeyValue).
			Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "key"}},
				DoUpdates: clause.Assignments(map[string]any{
					"value":      item.Value,
					"updated_at": now,
				}),
			}).
			Create(&item).Error; err != nil {
			return err
		}
	}

	return nil
}

func normalizeRequestedKeys(keys []string) []string {
	if len(keys) == 0 {
		return []string{}
	}

	normalized := make([]string, 0, len(keys))
	seen := make(map[string]struct{}, len(keys))
	for _, rawKey := range keys {
		key := normalizeRuntimeKey(rawKey)
		if key == "" {
			continue
		}
		if _, base, ok := parseScopedKey(key); ok {
			key = base
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, key)
	}
	return normalized
}
