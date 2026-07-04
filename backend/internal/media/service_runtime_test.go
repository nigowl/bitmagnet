package media

import "testing"

func TestParseRuntimeIntAndClampHomeHotDays(t *testing.T) {
	value, ok := parseRuntimeInt(" 99999 ")
	if !ok {
		t.Fatal("parseRuntimeInt rejected a valid integer")
	}
	if got := clampHomeHotDays(value); got != maxHomeHotDays {
		t.Fatalf("clampHomeHotDays(%d) = %d, want %d", value, got, maxHomeHotDays)
	}
}
