package media

import (
	"context"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gorm"
)

func enrichStructuredMetadata(ctx context.Context, db *gorm.DB, mediaIDs []string) error {
	if len(mediaIDs) == 0 {
		return nil
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	var entries []model.MediaEntry
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("id IN ?", mediaIDs).
		Find(&entries).Error; err != nil {
		return err
	}

	now := time.Now()
	for i := range entries {
		if err := ctx.Err(); err != nil {
			return err
		}
		enriched := deriveStructuredMetadata(entries[i])
		enriched.UpdatedAt = now
		if err := db.WithContext(ctx).
			Table(model.TableNameMediaEntry).
			Where("id = ?", enriched.ID).
			Select(structuredMetadataColumns).
			Updates(&enriched).Error; err != nil {
			return err
		}
	}

	return nil
}

func deriveStructuredMetadata(entry model.MediaEntry) model.MediaEntry {
	result := entry

	if entry.NameOriginal.Valid && strings.TrimSpace(entry.NameOriginal.String) != "" {
		result.NameOriginal = model.NewNullString(strings.TrimSpace(entry.NameOriginal.String))
	} else if title := strings.TrimSpace(entry.Title); title != "" {
		result.NameOriginal = model.NewNullString(title)
	} else {
		result.NameOriginal = model.NullString{}
	}

	nameEnCandidates := []string{
		entry.NameEn.String,
		findFirstAttributeValue(entry.Attributes, "", "title_en", "english_title", "en_title"),
		findFirstAttributeValue(entry.Attributes, model.SourceDouban, "sub_title", "english_title"),
	}
	if isLikelyEnglish(entry.Title) {
		nameEnCandidates = append(nameEnCandidates, entry.Title)
	}
	if entry.NameOriginal.Valid && isLikelyEnglish(entry.NameOriginal.String) {
		nameEnCandidates = append(nameEnCandidates, entry.NameOriginal.String)
	}
	result.NameEn = pickFirstNonEmpty(nameEnCandidates...)

	nameZhCandidates := []string{
		entry.NameZh.String,
		findFirstAttributeValue(entry.Attributes, "", "title_zh", "chinese_title", "zh_title"),
		findFirstAttributeValue(entry.Attributes, model.SourceDouban, "title", "name"),
	}
	if containsHan(entry.Title) {
		nameZhCandidates = append(nameZhCandidates, entry.Title)
	}
	if entry.NameOriginal.Valid && containsHan(entry.NameOriginal.String) {
		nameZhCandidates = append(nameZhCandidates, entry.NameOriginal.String)
	}
	result.NameZh = pickFirstNonEmpty(nameZhCandidates...)
	result.NameOriginal, result.NameEn, result.NameZh = rebalanceLocalizedText(result.NameOriginal, result.NameEn, result.NameZh)

	overviewOriginalCandidates := []string{
		entry.OverviewOriginal.String,
		findFirstAttributeValue(entry.Attributes, "", "overview", "summary", "description", "intro"),
	}
	result.OverviewOriginal = pickFirstNonEmpty(overviewOriginalCandidates...)

	overviewEnCandidates := []string{
		entry.OverviewEn.String,
		findFirstAttributeValue(entry.Attributes, "", "overview_en", "summary_en", "description_en", "english_overview", "english_summary"),
	}
	if isLikelyEnglish(entry.OverviewOriginal.String) {
		overviewEnCandidates = append(overviewEnCandidates, entry.OverviewOriginal.String)
	}
	result.OverviewEn = pickFirstNonEmpty(overviewEnCandidates...)

	overviewZhCandidates := []string{
		entry.OverviewZh.String,
		findFirstAttributeValue(entry.Attributes, "", "overview_zh", "summary_zh", "description_zh", "chinese_overview", "chinese_summary", "intro"),
		findFirstAttributeValue(entry.Attributes, model.SourceDouban, "summary", "intro", "description"),
	}
	if containsHan(entry.OverviewOriginal.String) {
		overviewZhCandidates = append(overviewZhCandidates, entry.OverviewOriginal.String)
	}
	result.OverviewZh = pickFirstNonEmpty(overviewZhCandidates...)
	result.OverviewOriginal, result.OverviewEn, result.OverviewZh = rebalanceLocalizedText(result.OverviewOriginal, result.OverviewEn, result.OverviewZh)

	result.Tagline = pickFirstNonEmpty(
		findFirstAttributeValue(entry.Attributes, "", "tagline"),
	)
	result.StatusText = pickFirstNonEmpty(
		findFirstAttributeValue(entry.Attributes, "", "status", "release_status"),
	)
	result.HomepageURL = pickFirstNonEmpty(
		findFirstAttributeValue(entry.Attributes, "", "homepage", "homepage_url", "official_site"),
	)

	imdbID := findFirstAttributeValue(entry.Attributes, model.SourceImdb, "id")
	if imdbID == "" && entry.ContentSource == model.SourceImdb {
		imdbID = entry.ContentID
	}
	imdbID = normalizeIMDbID(imdbID)
	if imdbID != "" {
		result.IMDbID = model.NewNullString(imdbID)
	} else {
		result.IMDbID = model.NullString{}
	}

	doubanID := findFirstAttributeValue(entry.Attributes, model.SourceDouban, "id", "douban_id", "subject_id", "subjectid")
	if doubanID == "" && entry.ContentSource == model.SourceDouban {
		doubanID = entry.ContentID
	}
	doubanID = extractDigits(doubanID)
	if doubanID != "" {
		result.DoubanID = model.NewNullString(doubanID)
	} else {
		result.DoubanID = model.NullString{}
	}

	result.ProductionCountries = collectProductionCountries(entry)
	result.SpokenLanguages = collectSpokenLanguages(entry)
	result.PremiereDates = collectPremiereDates(entry)
	result.SeasonCount = collectSeasonCount(entry)
	result.EpisodeCount = collectEpisodeCount(entry)
	result.NetworkNames = collectNetworks(entry)
	result.StudioNames = collectStudios(entry)
	result.AwardNames = collectAwards(entry)
	result.CreatorNames = collectCreators(entry)
	result.TitleAliases = collectTitleAliases(result)
	result.Certification = pickFirstNonEmpty(
		findFirstAttributeValue(entry.Attributes, "", "certification", "rated", "mpaa", "age_rating"),
	)
	result.CastMembers = collectPeople(entry.Attributes, "cast", "actors", "actor", "starring", "stars")
	result.DirectorNames = collectPeople(entry.Attributes, "director", "directors")
	result.WriterNames = collectPeople(entry.Attributes, "writer", "writers", "screenplay", "story", "teleplay", "series_composition")

	if len(result.WriterNames) == 0 {
		result.WriterNames = collectPeople(entry.Attributes, "creators", "creator")
	}

	return result
}
