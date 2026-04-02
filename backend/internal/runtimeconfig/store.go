package runtimeconfig

import (
	"context"
	"strings"

	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gorm"
)

func ReadValues(ctx context.Context, db *gorm.DB, keys []string) (map[string]string, error) {
	if len(keys) == 0 {
		return map[string]string{}, nil
	}

	var items []model.KeyValue
	if err := db.WithContext(ctx).
		Table(model.TableNameKeyValue).
		Where("key IN ?", keys).
		Find(&items).Error; err != nil {
		return nil, err
	}

	result := make(map[string]string, len(items))
	for _, item := range items {
		key := strings.TrimSpace(item.Key)
		if key == "" {
			continue
		}
		result[key] = item.Value
	}

	return result, nil
}
