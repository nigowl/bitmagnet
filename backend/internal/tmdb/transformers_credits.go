package tmdb

import "strings"

func joinMovieCastNames(cast []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Order        int    `json:"order"`
}, limit int) string {
	return joinCastNames(cast, limit)
}

func joinMovieCrewNames(crew []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Department   string `json:"department"`
	Job          string `json:"job"`
}, jobs ...string) string {
	return joinCrewNames(crew, jobs...)
}

func joinMovieWriters(crew []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Department   string `json:"department"`
	Job          string `json:"job"`
}) string {
	return joinCrewNamesByJob(crew, map[string]struct{}{
		"writer":     {},
		"screenplay": {},
		"story":      {},
		"teleplay":   {},
	})
}

func joinTvCastNames(cast []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Order        int    `json:"order"`
}, limit int) string {
	return joinCastNames(cast, limit)
}

func joinTvCrewNames(crew []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Department   string `json:"department"`
	Job          string `json:"job"`
}, jobs ...string) string {
	return joinCrewNames(crew, jobs...)
}

func joinTvWriters(crew []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Department   string `json:"department"`
	Job          string `json:"job"`
}) string {
	return joinCrewNamesByJob(crew, map[string]struct{}{
		"writer":             {},
		"screenplay":         {},
		"story":              {},
		"teleplay":           {},
		"series composition": {},
		"creator":            {},
	})
}

func joinCastNames(cast []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Order        int    `json:"order"`
}, limit int) string {
	names := make([]string, 0, len(cast))
	for i, item := range cast {
		if limit > 0 && i >= limit {
			break
		}
		name := firstNonEmpty(item.Name, item.OriginalName)
		if name != "" {
			names = append(names, name)
		}
	}
	return strings.Join(names, " / ")
}

func joinCrewNames(crew []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Department   string `json:"department"`
	Job          string `json:"job"`
}, jobs ...string) string {
	jobSet := make(map[string]struct{}, len(jobs))
	for _, job := range jobs {
		jobSet[strings.ToLower(job)] = struct{}{}
	}

	return joinCrewNamesByJob(crew, jobSet)
}

func joinCrewNamesByJob(crew []struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	OriginalName string `json:"original_name"`
	Department   string `json:"department"`
	Job          string `json:"job"`
}, jobSet map[string]struct{}) string {
	names := make([]string, 0)
	seen := make(map[string]struct{})
	for _, item := range crew {
		job := strings.ToLower(strings.TrimSpace(item.Job))
		if len(jobSet) > 0 {
			if _, ok := jobSet[job]; !ok {
				continue
			}
		}
		name := firstNonEmpty(item.Name, item.OriginalName)
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		names = append(names, name)
	}

	return strings.Join(names, " / ")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if normalized := strings.TrimSpace(value); normalized != "" {
			return normalized
		}
	}
	return ""
}
