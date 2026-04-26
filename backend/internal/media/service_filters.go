package media

import (
	"math"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

func normalizeListFilter(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" || value == categoryAll {
		return ""
	}
	return value
}

func normalizeSort(value string) string {
	normalized := normalizeListFilter(value)
	switch normalized {
	case sortLatest, sortPopular, sortDownload, sortRating, sortUpdated:
		return normalized
	default:
		return sortLatest
	}
}

func normalizeScoreBound(value *float64) (float64, bool) {
	if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) {
		return 0, false
	}
	return math.Min(10, math.Max(0, *value)), true
}

func applyQualityFilter(db *gorm.DB, quality string) *gorm.DB {
	switch quality {
	case "3d":
		return db.Where(
			`EXISTS (
				SELECT 1
				FROM jsonb_array_elements_text(coalesce(me.quality_tags, '[]'::jsonb)) AS quality_tag(value)
				WHERE upper(quality_tag.value) IN ('V3D', 'V3DSBS', 'V3DOU')
			)`,
		)
	case "dolby_vision":
		return db.Where(
			"me.attributes::text ILIKE ? OR me.title ILIKE ? OR me.name_original ILIKE ?",
			"%dolby vision%",
			"%dolby vision%",
			"%dolby vision%",
		)
	case "4k":
		return db.Where(
			`EXISTS (
				SELECT 1
				FROM jsonb_array_elements_text(coalesce(me.quality_tags, '[]'::jsonb)) AS quality_tag(value)
				WHERE upper(quality_tag.value) IN ('V2160P', 'V4320P')
			)`,
		)
	case "1080p", "720p", "480p", "360p":
		target := "V" + strings.ToUpper(quality)
		return db.Where(
			`EXISTS (
				SELECT 1
				FROM jsonb_array_elements_text(coalesce(me.quality_tags, '[]'::jsonb)) AS quality_tag(value)
				WHERE upper(quality_tag.value) = ?
			)`,
			target,
		)
	default:
		return db
	}
}

func applyYearFilter(db *gorm.DB, year string) *gorm.DB {
	currentYear := time.Now().UTC().Year()

	switch year {
	case "upcoming":
		return db.Where("(me.release_date > CURRENT_DATE OR me.release_year > ?)", currentYear)
	case "older":
		return db.Where("me.release_year < ?", 1950)
	}

	if strings.HasSuffix(year, "s") && len(year) == 5 {
		if start, err := strconv.Atoi(year[:4]); err == nil {
			return db.Where("me.release_year BETWEEN ? AND ?", start, start+9)
		}
	}

	if value, err := strconv.Atoi(year); err == nil {
		return db.Where("me.release_year = ?", value)
	}

	return db
}

func applyGenreFilter(db *gorm.DB, genre string) *gorm.DB {
	patterns := genreFilterPatterns(genre)
	if len(patterns) == 0 {
		return db
	}

	return db.Where(
		`EXISTS (
			SELECT 1
			FROM jsonb_array_elements_text(coalesce(me.genres, '[]'::jsonb)) AS genre_item(value)
			WHERE lower(genre_item.value) IN ?
		)`,
		patterns,
	)
}

func applyLanguageFilter(db *gorm.DB, language string) *gorm.DB {
	patterns := languageFilterPatterns(language)
	if len(patterns) == 0 {
		return db
	}

	return db.Where(
		`EXISTS (
			SELECT 1
			FROM jsonb_array_elements_text(coalesce(me.languages, '[]'::jsonb)) AS language_item(value)
			WHERE lower(language_item.value) IN ?
		) OR lower(CAST(me.original_language AS text)) IN ?`,
		patterns,
		patterns,
	)
}

func applyMetadataFilter(db *gorm.DB, patterns []string) *gorm.DB {
	clauses := make([]string, 0, len(patterns)*2)
	args := make([]any, 0, len(patterns)*2)

	for _, pattern := range patterns {
		normalized := strings.TrimSpace(strings.ToLower(pattern))
		if normalized == "" {
			continue
		}
		like := "%" + normalized + "%"
		clauses = append(clauses, "lower(CAST(me.collections AS text)) LIKE ?")
		args = append(args, like)
		clauses = append(clauses, "lower(CAST(me.attributes AS text)) LIKE ?")
		args = append(args, like)
	}

	if len(clauses) == 0 {
		return db
	}

	return db.Where("("+strings.Join(clauses, " OR ")+")", args...)
}

func genreFilterPatterns(genre string) []string {
	switch genre {
	case "comedy":
		return []string{"comedy"}
	case "animation":
		return []string{"animation", "anime", "动画", "动漫"}
	case "action":
		return []string{"action", "action & adventure"}
	case "romance":
		return []string{"romance"}
	case "horror":
		return []string{"horror"}
	case "war":
		return []string{"war", "war & politics"}
	case "thriller":
		return []string{"thriller"}
	case "crime":
		return []string{"crime"}
	case "science_fiction":
		return []string{"science fiction", "sci-fi", "sci fi"}
	case "mystery":
		return []string{"mystery"}
	case "fantasy":
		return []string{"fantasy"}
	case "drama":
		return []string{"drama"}
	case "adventure":
		return []string{"adventure", "action & adventure"}
	case "family":
		return []string{"family"}
	case "kids":
		return []string{"kids", "family"}
	case "history":
		return []string{"history"}
	case "biography":
		return []string{"biography", "documentary"}
	case "sport":
		return []string{"sport"}
	case "music":
		return []string{"music", "musical"}
	case "western":
		return []string{"western"}
	case "documentary":
		return []string{"documentary"}
	default:
		return []string{strings.ReplaceAll(genre, "_", " ")}
	}
}

func languageFilterPatterns(language string) []string {
	switch language {
	case "english":
		return []string{"english", "en"}
	case "chinese":
		return []string{"chinese", "zh", "cmn"}
	case "japanese":
		return []string{"japanese", "ja"}
	case "korean":
		return []string{"korean", "ko"}
	case "french":
		return []string{"french", "fr"}
	case "german":
		return []string{"german", "de"}
	case "spanish":
		return []string{"spanish", "es"}
	case "italian":
		return []string{"italian", "it"}
	case "russian":
		return []string{"russian", "ru"}
	case "portuguese":
		return []string{"portuguese", "pt"}
	case "hindi":
		return []string{"hindi", "hi"}
	default:
		return []string{strings.ReplaceAll(language, "_", " ")}
	}
}

func countryFilterPatterns(country string) []string {
	switch country {
	case "united_states":
		return []string{"united states", "usa", "u.s."}
	case "china":
		return []string{"china", "mainland china", "people's republic of china"}
	case "japan":
		return []string{"japan"}
	case "south_korea":
		return []string{"south korea", "korea"}
	case "united_kingdom":
		return []string{"united kingdom", "uk", "great britain", "britain"}
	case "france":
		return []string{"france"}
	case "germany":
		return []string{"germany"}
	case "india":
		return []string{"india"}
	case "thailand":
		return []string{"thailand"}
	case "hong_kong":
		return []string{"hong kong", "hong kong sar china"}
	case "taiwan":
		return []string{"taiwan"}
	case "spain":
		return []string{"spain"}
	default:
		return []string{strings.ReplaceAll(country, "_", " ")}
	}
}

func networkFilterPatterns(network string) []string {
	switch network {
	case "netflix":
		return []string{"netflix"}
	case "disney_plus":
		return []string{"disney+", "disney plus"}
	case "hbo":
		return []string{"hbo", "max"}
	case "apple_tv_plus":
		return []string{"apple tv+", "apple tv plus"}
	case "prime_video":
		return []string{"prime video", "amazon prime video"}
	case "hulu":
		return []string{"hulu"}
	case "bbc":
		return []string{"bbc"}
	case "nhk":
		return []string{"nhk"}
	case "tencent_video":
		return []string{"tencent video", "wetv"}
	case "iqiyi":
		return []string{"iqiyi", "i qiyi"}
	case "youku":
		return []string{"youku"}
	default:
		return []string{strings.ReplaceAll(network, "_", " ")}
	}
}

func studioFilterPatterns(studio string) []string {
	switch studio {
	case "marvel_studios":
		return []string{"marvel studios", "marvel"}
	case "disney":
		return []string{"disney", "walt disney"}
	case "warner_bros":
		return []string{"warner bros", "warner brothers"}
	case "a24":
		return []string{"a24"}
	case "pixar":
		return []string{"pixar"}
	case "dreamworks":
		return []string{"dreamworks"}
	case "studio_ghibli":
		return []string{"studio ghibli", "ghibli"}
	case "toei_animation":
		return []string{"toei animation", "toei"}
	case "mappa":
		return []string{"mappa"}
	case "netflix":
		return []string{"netflix"}
	case "hbo":
		return []string{"hbo"}
	default:
		return []string{strings.ReplaceAll(studio, "_", " ")}
	}
}

func awardsFilterPatterns(award string) []string {
	switch award {
	case "oscar":
		return []string{"academy award", "oscars", "oscar"}
	case "emmy":
		return []string{"emmy"}
	case "golden_globe":
		return []string{"golden globe"}
	case "cannes":
		return []string{"cannes", "palme d'or"}
	case "berlin":
		return []string{"berlin", "berlinale"}
	case "venice":
		return []string{"venice"}
	case "bafta":
		return []string{"bafta", "british academy"}
	case "sundance":
		return []string{"sundance"}
	default:
		return []string{strings.ReplaceAll(award, "_", " ")}
	}
}

func applySort(db *gorm.DB, sort string, popularOrderExpr string) *gorm.DB {
	if strings.TrimSpace(popularOrderExpr) == "" {
		popularOrderExpr = "COALESCE(me.heat_score_recent, 0)"
	}

	switch sort {
	case sortPopular:
		return db.Order(popularOrderExpr + " DESC").
			Order("COALESCE(me.heat_score_total, 0) DESC").
			Order("COALESCE(me.popularity, 0) DESC").
			Order("COALESCE(me.vote_count, 0) DESC").
			Order("COALESCE(me.max_seeders, 0) DESC")
	case sortDownload:
		return db.Order("COALESCE(me.max_seeders, 0) DESC").
			Order("me.torrent_count DESC").
			Order("COALESCE(me.latest_published_at, me.updated_at) DESC")
	case sortRating:
		return db.Order("COALESCE(me.vote_average, 0) DESC").
			Order("COALESCE(me.vote_count, 0) DESC").
			Order("COALESCE(me.popularity, 0) DESC")
	case sortUpdated:
		return db.Order("me.updated_at DESC").
			Order("COALESCE(me.latest_published_at, me.updated_at) DESC")
	default:
		return db.Order("COALESCE(me.release_date::timestamp, me.latest_published_at, me.updated_at) DESC").
			Order("COALESCE(me.max_seeders, 0) DESC").
			Order("me.updated_at DESC")
	}
}
