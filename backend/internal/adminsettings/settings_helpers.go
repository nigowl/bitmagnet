package adminsettings

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

func validateDHTSchedule(settings DHTPerformanceSettings) error {
	if !settings.ScheduleEnabled {
		return nil
	}
	if len(settings.ScheduleWeekdays) == 0 {
		return fmt.Errorf("%w: performance.dht.scheduleWeekdays", ErrInvalidInput)
	}
	if settings.ScheduleStartHour < 0 || settings.ScheduleStartHour > 23 {
		return fmt.Errorf("%w: performance.dht.scheduleStartHour", ErrInvalidInput)
	}
	if settings.ScheduleEndHour < 1 || settings.ScheduleEndHour > 24 || settings.ScheduleStartHour >= settings.ScheduleEndHour {
		return fmt.Errorf("%w: performance.dht.scheduleEndHour", ErrInvalidInput)
	}
	if _, err := normalizeDHTScheduleWeekdays(settings.ScheduleWeekdays); err != nil {
		return fmt.Errorf("%w: performance.dht.scheduleWeekdays", ErrInvalidInput)
	}
	return nil
}

func normalizeDHTScheduleWeekdays(input []int) ([]int, error) {
	seen := make(map[int]struct{}, len(input))
	result := make([]int, 0, len(input))
	for _, weekday := range input {
		if weekday < 1 || weekday > 7 {
			return nil, ErrInvalidInput
		}
		if _, exists := seen[weekday]; exists {
			continue
		}
		seen[weekday] = struct{}{}
		result = append(result, weekday)
	}
	if len(result) == 0 {
		return nil, ErrInvalidInput
	}
	return result, nil
}

func applyWeekdays(values map[string]string, key string, setter func(v []int)) {
	raw, ok := values[key]
	if !ok {
		return
	}
	parts := strings.Split(raw, ",")
	weekdays := make([]int, 0, len(parts))
	for _, part := range parts {
		value, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil {
			return
		}
		weekdays = append(weekdays, value)
	}
	normalized, err := normalizeDHTScheduleWeekdays(weekdays)
	if err != nil {
		return
	}
	setter(normalized)
}

func joinInts(values []int) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, strconv.Itoa(value))
	}
	return strings.Join(parts, ",")
}

func hasUpdateWithPrefix(updates map[string]*string, prefix string) bool {
	for key := range updates {
		if strings.HasPrefix(key, prefix) {
			return true
		}
	}
	return false
}

func hasUpdateWithAnyPrefix(updates map[string]*string, prefixes ...string) bool {
	for _, prefix := range prefixes {
		if hasUpdateWithPrefix(updates, prefix) {
			return true
		}
	}
	return false
}

func normalizeVideoFormatExtensions(raw []string) []string {
	if len(raw) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(raw))
	normalized := make([]string, 0, len(raw))
	for _, part := range raw {
		item := strings.ToLower(strings.TrimSpace(part))
		item = strings.TrimPrefix(item, "*")
		if item == "" {
			continue
		}
		if !strings.HasPrefix(item, ".") {
			item = "." + item
		}
		valid := true
		for _, ch := range item {
			if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '.' || ch == '_' || ch == '-' {
				continue
			}
			valid = false
			break
		}
		if !valid || len(item) < 2 || len(item) > 16 {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		normalized = append(normalized, item)
	}
	if len(normalized) == 0 {
		return nil
	}
	sort.Strings(normalized)
	return normalized
}
