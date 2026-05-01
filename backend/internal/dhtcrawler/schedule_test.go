package dhtcrawler

import (
	"testing"
	"time"
)

func TestCrawlerScheduleActiveAt(t *testing.T) {
	location := time.FixedZone("test", 8*60*60)
	schedule := newCrawlerSchedule(Config{
		ScheduleEnabled:   true,
		ScheduleWeekdays:  []int{1, 2, 3, 4, 5},
		ScheduleStartHour: 2,
		ScheduleEndHour:   6,
	})

	cases := []struct {
		name string
		now  time.Time
		want bool
	}{
		{
			name: "weekday inside window",
			now:  time.Date(2026, 5, 4, 2, 0, 0, 0, location),
			want: true,
		},
		{
			name: "weekday at exclusive end",
			now:  time.Date(2026, 5, 4, 6, 0, 0, 0, location),
			want: false,
		},
		{
			name: "weekend inside hour",
			now:  time.Date(2026, 5, 3, 3, 0, 0, 0, location),
			want: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := schedule.activeAt(tc.now); got != tc.want {
				t.Fatalf("activeAt() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestCrawlerScheduleNextStart(t *testing.T) {
	location := time.FixedZone("test", 8*60*60)
	schedule := newCrawlerSchedule(Config{
		ScheduleEnabled:   true,
		ScheduleWeekdays:  []int{1, 2, 3, 4, 5},
		ScheduleStartHour: 2,
		ScheduleEndHour:   6,
	})

	now := time.Date(2026, 5, 1, 7, 0, 0, 0, location)
	want := time.Date(2026, 5, 4, 2, 0, 0, 0, location)
	if got := schedule.nextStart(now); !got.Equal(want) {
		t.Fatalf("nextStart() = %s, want %s", got, want)
	}
}
