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

func firstNonEmptyTrimmed(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func applyOptionalBoolUpdate(inputValue *bool, key string, updates map[string]*string, assign func(bool)) {
	if inputValue == nil {
		return
	}
	value := strconv.FormatBool(*inputValue)
	updates[key] = &value
	assign(*inputValue)
}

func applyOptionalIntUpdate(
	inputValue *int,
	min int,
	max int,
	key string,
	label string,
	updates map[string]*string,
	assign func(int),
) error {
	if inputValue == nil {
		return nil
	}
	if *inputValue < min || *inputValue > max {
		return fmt.Errorf("%w: %s", ErrInvalidInput, label)
	}
	value := strconv.Itoa(*inputValue)
	updates[key] = &value
	assign(*inputValue)
	return nil
}

func applyOptionalUintUpdate(
	inputValue *uint,
	min uint,
	max uint,
	key string,
	label string,
	updates map[string]*string,
	assign func(uint),
) error {
	if inputValue == nil {
		return nil
	}
	if *inputValue < min || *inputValue > max {
		return fmt.Errorf("%w: %s", ErrInvalidInput, label)
	}
	value := strconv.FormatUint(uint64(*inputValue), 10)
	updates[key] = &value
	assign(*inputValue)
	return nil
}

func applyOptionalFloatUpdate(
	inputValue *float64,
	key string,
	label string,
	updates map[string]*string,
	valid func(float64) bool,
	assign func(float64),
) error {
	if inputValue == nil {
		return nil
	}
	if !valid(*inputValue) {
		return fmt.Errorf("%w: %s", ErrInvalidInput, label)
	}
	value := strconv.FormatFloat(*inputValue, 'f', 4, 64)
	updates[key] = &value
	assign(*inputValue)
	return nil
}

func applyOptionalTrimmedStringUpdate(
	inputValue *string,
	key string,
	defaultValue string,
	updates map[string]*string,
	assign func(string),
) {
	if inputValue == nil {
		return
	}
	normalized := strings.TrimSpace(*inputValue)
	if normalized == "" {
		updates[key] = nil
		assign(defaultValue)
		return
	}
	updates[key] = &normalized
	assign(normalized)
}

func parseTrimmedBool(raw string) (bool, bool) {
	parsed, err := strconv.ParseBool(strings.TrimSpace(raw))
	return parsed, err == nil
}

func parseTrimmedIntInRange(raw string, min int, max int) (int, bool) {
	parsed, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || parsed < min || parsed > max {
		return 0, false
	}
	return parsed, true
}

func parseTrimmedFloatInRange(raw string, min float64, max float64) (float64, bool) {
	parsed, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || parsed < min || parsed > max {
		return 0, false
	}
	return parsed, true
}

func applyParsedBool(values map[string]string, key string, setter func(bool)) {
	raw, ok := values[key]
	if !ok {
		return
	}
	if parsed, ok := parseTrimmedBool(raw); ok {
		setter(parsed)
	}
}

func applyParsedIntInRange(values map[string]string, key string, min int, max int, setter func(int)) {
	raw, ok := values[key]
	if !ok {
		return
	}
	if parsed, ok := parseTrimmedIntInRange(raw, min, max); ok {
		setter(parsed)
	}
}

func applyParsedFloatInRange(values map[string]string, key string, min float64, max float64, setter func(float64)) {
	raw, ok := values[key]
	if !ok {
		return
	}
	if parsed, ok := parseTrimmedFloatInRange(raw, min, max); ok {
		setter(parsed)
	}
}

func applyTrimmedString(values map[string]string, key string, setter func(string)) {
	raw, ok := values[key]
	if !ok {
		return
	}
	setter(strings.TrimSpace(raw))
}

func applyNonEmptyTrimmedString(values map[string]string, key string, setter func(string)) {
	applyTrimmedString(values, key, func(value string) {
		if value != "" {
			setter(value)
		}
	})
}

func normalizeTransmissionTimeoutSeconds(timeoutSeconds int, defaultTimeoutSeconds int) int {
	if timeoutSeconds <= 0 {
		timeoutSeconds = defaultTimeoutSeconds
	}
	return timeoutSeconds
}

func validTransmissionTimeoutSeconds(timeoutSeconds int) bool {
	return timeoutSeconds >= 2 && timeoutSeconds <= 60
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
