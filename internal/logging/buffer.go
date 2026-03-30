package logging

import (
	"strings"
	"sync"
	"time"
)

const defaultBufferLines = 5000

type LogBuffer struct {
	mu        sync.RWMutex
	lines     []string
	maxLines  int
	updatedAt time.Time
}

func NewLogBuffer(maxLines int) *LogBuffer {
	if maxLines <= 0 {
		maxLines = defaultBufferLines
	}

	return &LogBuffer{
		lines:    make([]string, 0, maxLines),
		maxLines: maxLines,
	}
}

func (b *LogBuffer) Write(p []byte) (int, error) {
	b.appendLines(string(p))
	return len(p), nil
}

func (b *LogBuffer) Sync() error {
	return nil
}

func (b *LogBuffer) Snapshot(limit int) ([]string, *time.Time) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if limit <= 0 || limit > len(b.lines) {
		limit = len(b.lines)
	}

	lines := append([]string(nil), b.lines[len(b.lines)-limit:]...)

	if b.updatedAt.IsZero() {
		return lines, nil
	}

	updatedAt := b.updatedAt
	return lines, &updatedAt
}

func (b *LogBuffer) SnapshotPage(page int, pageSize int) ([]string, int, *time.Time) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 100
	}

	total := len(b.lines)
	if total == 0 {
		return []string{}, 0, nil
	}

	offset := (page - 1) * pageSize
	end := total - offset
	if end < 0 {
		end = 0
	}
	start := end - pageSize
	if start < 0 {
		start = 0
	}
	if start > end {
		start = end
	}

	lines := append([]string(nil), b.lines[start:end]...)

	if b.updatedAt.IsZero() {
		return lines, total, nil
	}

	updatedAt := b.updatedAt
	return lines, total, &updatedAt
}

func (b *LogBuffer) appendLines(raw string) {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.TrimRight(raw, "\n")
	if raw == "" {
		return
	}

	lines := strings.Split(raw, "\n")

	b.mu.Lock()
	defer b.mu.Unlock()

	for _, line := range lines {
		if line == "" {
			continue
		}

		if len(b.lines) == b.maxLines {
			copy(b.lines, b.lines[1:])
			b.lines = b.lines[:b.maxLines-1]
		}

		b.lines = append(b.lines, line)
	}

	b.updatedAt = time.Now()
}
