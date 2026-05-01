package dhtcrawler

import "time"

type crawlerSchedule struct {
	enabled   bool
	weekdays  map[int]struct{}
	startHour int
	endHour   int
}

func newCrawlerSchedule(cfg Config) crawlerSchedule {
	weekdays := make(map[int]struct{}, len(cfg.ScheduleWeekdays))
	for _, weekday := range cfg.ScheduleWeekdays {
		if weekday >= 1 && weekday <= 7 {
			weekdays[weekday] = struct{}{}
		}
	}
	return crawlerSchedule{
		enabled:   cfg.ScheduleEnabled,
		weekdays:  weekdays,
		startHour: cfg.ScheduleStartHour,
		endHour:   cfg.ScheduleEndHour,
	}
}

func (s crawlerSchedule) activeAt(now time.Time) bool {
	if !s.enabled {
		return true
	}
	if !s.valid() {
		return false
	}
	if _, ok := s.weekdays[isoWeekday(now)]; !ok {
		return false
	}
	hour := now.Hour()
	return hour >= s.startHour && hour < s.endHour
}

func (s crawlerSchedule) nextStart(now time.Time) time.Time {
	if !s.enabled || s.activeAt(now) {
		return now
	}
	if !s.valid() {
		return now.Add(time.Hour)
	}
	base := localDayStart(now)
	for dayOffset := 0; dayOffset <= 7; dayOffset++ {
		day := base.AddDate(0, 0, dayOffset)
		if _, ok := s.weekdays[isoWeekday(day)]; !ok {
			continue
		}
		candidate := day.Add(time.Duration(s.startHour) * time.Hour)
		if candidate.After(now) {
			return candidate
		}
	}
	return now.Add(time.Hour)
}

func (s crawlerSchedule) nextEnd(now time.Time) time.Time {
	if !s.enabled || !s.activeAt(now) {
		return now
	}
	end := localDayStart(now).Add(time.Duration(s.endHour) * time.Hour)
	if end.After(now) {
		return end
	}
	return now.Add(time.Hour)
}

func (s crawlerSchedule) valid() bool {
	return len(s.weekdays) > 0 && s.startHour >= 0 && s.startHour < s.endHour && s.endHour <= 24
}

func isoWeekday(t time.Time) int {
	weekday := int(t.Weekday())
	if weekday == 0 {
		return 7
	}
	return weekday
}

func localDayStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}
