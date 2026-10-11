package media

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gorm"
)

const (
	topicKindCurated   = "curated"
	topicKindFranchise = "franchise"
	topicKindCustom    = "custom"

	topicPreviewLimit = 4
	topicItemLimit    = 100
)

type topicSeed struct {
	ID          string
	Kind        string
	Module      string
	Name        string
	Description string
	SortOrder   int
	Where       string
	Order       string
	Args        []any
	Limit       int
	MediaIDs    []string
}

type franchiseTopicRow struct {
	Source        string
	ID            string
	Name          string
	LocalizedName string
	ItemCount     int
}

func (s *service) ListTopics(ctx context.Context, input TopicListInput) (TopicListResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return TopicListResult{}, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 24
	}
	if limit > 100 {
		limit = 100
	}

	page := input.Page
	if page <= 0 {
		page = 1
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB().Session(&gorm.Session{NewDB: true}).
		Table(model.TableNameMediaTopic).
		Where("enabled = ?", true)
	if kind := strings.TrimSpace(strings.ToLower(input.Kind)); kind != "" {
		db = db.Where("kind = ?", kind)
	}
	if search := strings.TrimSpace(input.Search); search != "" {
		db = db.Where("name ILIKE ?", "%"+search+"%")
	}

	var totalCount int64
	if err := db.Session(&gorm.Session{}).Count(&totalCount).Error; err != nil {
		return TopicListResult{}, err
	}

	var topics []model.MediaTopic
	if err := db.Order("sort_order ASC, name ASC").
		Offset((page - 1) * limit).
		Limit(limit).
		Find(&topics).Error; err != nil {
		return TopicListResult{}, err
	}

	previewsByTopic, err := loadTopicPreviewMap(ctx, dbForTopics(q), topics, input.ViewerID)
	if err != nil {
		return TopicListResult{}, err
	}
	items := make([]TopicItem, 0, len(topics))
	for _, topic := range topics {
		items = append(items, topicItemFromModel(topic, previewsByTopic[topic.ID]))
	}

	return TopicListResult{
		TotalCount: totalCount,
		Items:      items,
	}, nil
}

func (s *service) TopicDetail(ctx context.Context, id string, input ListInput) (TopicDetailResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return TopicDetailResult{}, err
	}

	topicID := strings.TrimSpace(id)
	if topicID == "" {
		return TopicDetailResult{}, ErrNotFound
	}

	db := dbForTopics(q)
	var topic model.MediaTopic
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaTopic).
		Where("id = ?", topicID).
		Where("enabled = ?", true).
		Take(&topic).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return TopicDetailResult{}, ErrNotFound
		}
		return TopicDetailResult{}, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 40
	}
	if limit > 120 {
		limit = 120
	}
	page := input.Page
	if page <= 0 {
		page = 1
	}

	items, totalCount, totalTorrentCount, err := loadTopicMedia(ctx, db, topicID, limit, page, input.ViewerID)
	if err != nil {
		return TopicDetailResult{}, err
	}

	return TopicDetailResult{
		Topic:             topicItemFromModel(topic, nil),
		TotalCount:        totalCount,
		TotalTorrentCount: totalTorrentCount,
		Items:             items,
	}, nil
}

func (s *service) RebuildTopics(ctx context.Context) (TopicRebuildResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return TopicRebuildResult{}, err
	}

	db := dbForTopics(q)
	seeds := []topicSeed{
		{
			ID:          "curated:high-rated-movies",
			Kind:        topicKindCurated,
			Module:      "high-rated",
			Name:        "Top Rated Movies",
			Description: "Movies with a rating of 8 or higher.",
			SortOrder:   10,
			Where:       "me.torrent_count > 0 AND me.content_type = ? AND me.vote_average >= ?",
			Order:       "me.vote_average DESC NULLS LAST, me.vote_count DESC NULLS LAST, me.release_year DESC NULLS LAST, me.id",
			Args:        []any{model.ContentTypeMovie, 8},
			Limit:       topicItemLimit,
		},
		{
			ID:          "curated:popular-movies",
			Kind:        topicKindCurated,
			Module:      "popular",
			Name:        "Popular Movies",
			Description: "Popular movie resources in the local library.",
			SortOrder:   20,
			Where:       "me.torrent_count > 0 AND me.content_type = ?",
			Order:       "COALESCE(me.heat_score_recent, 0) DESC, me.torrent_count DESC, me.vote_average DESC NULLS LAST, me.id",
			Args:        []any{model.ContentTypeMovie},
			Limit:       topicItemLimit,
		},
		{
			ID:          "curated:popular-series",
			Kind:        topicKindCurated,
			Module:      "popular",
			Name:        "Popular Series",
			Description: "Popular TV series in the local library.",
			SortOrder:   30,
			Where:       "me.torrent_count > 0 AND me.content_type = ?",
			Order:       "COALESCE(me.heat_score_recent, 0) DESC, me.torrent_count DESC, me.vote_average DESC NULLS LAST, me.id",
			Args:        []any{model.ContentTypeTvShow},
			Limit:       topicItemLimit,
		},
		{
			ID:          "curated:award-winning",
			Kind:        topicKindCurated,
			Module:      "award-winning",
			Name:        "Award-Winning Movies",
			Description: "Movies with award metadata.",
			SortOrder:   50,
			Where:       "me.torrent_count > 0 AND me.content_type = ? AND jsonb_array_length(COALESCE(me.award_names, '[]'::jsonb)) > 0",
			Order:       "me.vote_average DESC NULLS LAST, me.vote_count DESC NULLS LAST, me.release_year DESC NULLS LAST, me.id",
			Args:        []any{model.ContentTypeMovie},
			Limit:       topicItemLimit,
		},
	}

	for index := range seeds {
		seeds[index].MediaIDs, err = loadTopicMediaIDs(db, seeds[index].Where, seeds[index].Order, seeds[index].Limit, seeds[index].Args...)
		if err != nil {
			return TopicRebuildResult{}, err
		}
	}

	franchises, err := loadFranchiseTopicRows(ctx, db)
	if err != nil {
		return TopicRebuildResult{}, err
	}
	for index, franchise := range franchises {
		mediaIDs, loadErr := loadFranchiseMediaIDs(db, franchise)
		if loadErr != nil {
			return TopicRebuildResult{}, loadErr
		}
		seeds = append(seeds, topicSeed{
			ID:          franchiseTopicID(franchise.Source, franchise.ID),
			Kind:        topicKindFranchise,
			Module:      "series",
			Name:        localizedFranchiseTopicName(franchise.Name, franchise.LocalizedName),
			Description: "Movie series from metadata.",
			SortOrder:   1000 + index,
			MediaIDs:    mediaIDs,
		})
	}

	now := time.Now()
	var itemCount int
	var topicCount int
	if err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existingTopics []model.MediaTopic
		if err := tx.Session(&gorm.Session{NewDB: true}).
			Table(model.TableNameMediaTopic).
			Where("kind IN ?", []string{topicKindCurated, topicKindFranchise}).
			Find(&existingTopics).Error; err != nil {
			return err
		}
		enabledByID := make(map[string]bool, len(existingTopics))
		for _, topic := range existingTopics {
			enabledByID[topic.ID] = topic.Enabled
		}

		var generatedTopicIDs []string
		if err := tx.Session(&gorm.Session{NewDB: true}).
			Table(model.TableNameMediaTopic).
			Where("kind IN ?", []string{topicKindCurated, topicKindFranchise}).
			Pluck("id", &generatedTopicIDs).Error; err != nil {
			return err
		}
		if len(generatedTopicIDs) > 0 {
			if err := tx.Session(&gorm.Session{NewDB: true}).
				Table(model.TableNameMediaTopicItem).
				Where("topic_id IN ?", generatedTopicIDs).
				Delete(&model.MediaTopicItem{}).Error; err != nil {
				return err
			}
			if err := tx.Session(&gorm.Session{NewDB: true}).
				Table(model.TableNameMediaTopic).
				Where("id IN ?", generatedTopicIDs).
				Delete(&model.MediaTopic{}).Error; err != nil {
				return err
			}
		}

		topics := make([]model.MediaTopic, 0, len(seeds))
		items := make([]model.MediaTopicItem, 0)
		for _, seed := range seeds {
			if len(seed.MediaIDs) == 0 {
				continue
			}
			topics = append(topics, model.MediaTopic{
				ID:          seed.ID,
				Kind:        seed.Kind,
				Module:      seed.Module,
				Name:        seed.Name,
				Description: seed.Description,
				SortOrder:   seed.SortOrder,
				ItemCount:   len(seed.MediaIDs),
				Enabled:     topicEnabled(enabledByID, seed.ID),
				CreatedAt:   now,
				UpdatedAt:   now,
			})
			for position, mediaID := range seed.MediaIDs {
				items = append(items, model.MediaTopicItem{
					TopicID:   seed.ID,
					MediaID:   mediaID,
					Position:  position,
					CreatedAt: now,
				})
			}
		}

		if len(topics) > 0 {
			if err := tx.Session(&gorm.Session{NewDB: true}).CreateInBatches(&topics, 100).Error; err != nil {
				return err
			}
		}
		if len(items) > 0 {
			if err := tx.Session(&gorm.Session{NewDB: true}).CreateInBatches(&items, 500).Error; err != nil {
				return err
			}
		}
		itemCount = len(items)
		topicCount = len(topics)
		return nil
	}); err != nil {
		return TopicRebuildResult{}, err
	}

	return TopicRebuildResult{
		TopicCount: topicCount,
		ItemCount:  itemCount,
	}, nil
}

func (s *service) ListAdminTopics(ctx context.Context, input TopicAdminListInput) (TopicAdminListResult, error) {
	q, err := s.dao.Get()
	if err != nil {
		return TopicAdminListResult{}, err
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	page := input.Page
	if page <= 0 {
		page = 1
	}

	db := dbForTopics(q)
	var totalCount int64
	if err := db.WithContext(ctx).Table(model.TableNameMediaTopic).Count(&totalCount).Error; err != nil {
		return TopicAdminListResult{}, err
	}

	var topics []model.MediaTopic
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaTopic).
		Order("sort_order ASC, name ASC").
		Offset((page - 1) * limit).
		Limit(limit).
		Find(&topics).Error; err != nil {
		return TopicAdminListResult{}, err
	}

	mediaIDsByTopic, err := loadTopicMediaIDMap(ctx, db, topics)
	if err != nil {
		return TopicAdminListResult{}, err
	}

	items := make([]TopicAdminItem, 0, len(topics))
	for _, topic := range topics {
		items = append(items, topicAdminItemFromModel(topic, mediaIDsByTopic[topic.ID]))
	}
	return TopicAdminListResult{TotalCount: totalCount, Items: items}, nil
}

func (s *service) CreateTopic(ctx context.Context, input TopicAdminInput) (TopicAdminItem, error) {
	q, err := s.dao.Get()
	if err != nil {
		return TopicAdminItem{}, err
	}

	name, description, mediaIDs, err := normalizeTopicInput(input)
	if err != nil {
		return TopicAdminItem{}, err
	}

	db := dbForTopics(q)
	mediaIDs, err = validateTopicMediaIDs(ctx, db, mediaIDs)
	if err != nil {
		return TopicAdminItem{}, err
	}

	id, err := newCustomTopicID()
	if err != nil {
		return TopicAdminItem{}, err
	}
	now := time.Now()
	topic := model.MediaTopic{
		ID:          id,
		Kind:        topicKindCustom,
		Module:      "custom",
		Name:        name,
		Description: description,
		SortOrder:   input.SortOrder,
		ItemCount:   len(mediaIDs),
		Enabled:     inputEnabled(input.Enabled, true),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Session(&gorm.Session{NewDB: true}).Create(&topic).Error; err != nil {
			return err
		}
		return replaceTopicItems(tx, topic.ID, mediaIDs, now)
	}); err != nil {
		return TopicAdminItem{}, err
	}
	return topicAdminItemFromModel(topic, mediaIDs), nil
}

func (s *service) UpdateTopic(ctx context.Context, id string, input TopicAdminInput) (TopicAdminItem, error) {
	q, err := s.dao.Get()
	if err != nil {
		return TopicAdminItem{}, err
	}

	topicID := strings.TrimSpace(id)
	if topicID == "" {
		return TopicAdminItem{}, ErrNotFound
	}
	name, description, mediaIDs, err := normalizeTopicInput(input)
	if err != nil {
		return TopicAdminItem{}, err
	}

	db := dbForTopics(q)
	mediaIDs, err = validateTopicMediaIDs(ctx, db, mediaIDs)
	if err != nil {
		return TopicAdminItem{}, err
	}

	var topic model.MediaTopic
	if err := db.WithContext(ctx).Table(model.TableNameMediaTopic).Where("id = ?", topicID).Take(&topic).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return TopicAdminItem{}, ErrNotFound
		}
		return TopicAdminItem{}, err
	}
	now := time.Now()
	topic.Name = name
	topic.Description = description
	topic.SortOrder = input.SortOrder
	topic.ItemCount = len(mediaIDs)
	if input.Enabled != nil {
		topic.Enabled = *input.Enabled
	}
	topic.UpdatedAt = now
	if err := db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Session(&gorm.Session{NewDB: true}).Save(&topic).Error; err != nil {
			return err
		}
		return replaceTopicItems(tx, topic.ID, mediaIDs, now)
	}); err != nil {
		return TopicAdminItem{}, err
	}
	return topicAdminItemFromModel(topic, mediaIDs), nil
}

func (s *service) DeleteTopic(ctx context.Context, id string) error {
	q, err := s.dao.Get()
	if err != nil {
		return err
	}

	topicID := strings.TrimSpace(id)
	if topicID == "" {
		return ErrNotFound
	}
	result := dbForTopics(q).WithContext(ctx).
		Table(model.TableNameMediaTopic).
		Where("id = ?", topicID).
		Delete(&model.MediaTopic{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func dbForTopics(q *dao.Query) *gorm.DB {
	return q.TorrentContent.UnderlyingDB().Session(&gorm.Session{NewDB: true})
}

func loadTopicMedia(
	ctx context.Context,
	db *gorm.DB,
	topicID string,
	limit int,
	page int,
	viewerID int64,
) ([]ListItem, int64, int64, error) {
	base := db.WithContext(ctx).
		Table(model.TableNameMediaEntry+" me").
		Joins("JOIN "+model.TableNameMediaTopicItem+" mti ON mti.media_id = me.id").
		Where("mti.topic_id = ?", topicID).
		Where("me.torrent_count > 0")
	if viewerID > 0 {
		base = base.Where(
			"NOT EXISTS (SELECT 1 FROM "+model.TableNameUserMediaBlock+" AS umb WHERE umb.user_id = ? AND umb.media_id = me.id)",
			viewerID,
		)
	}

	var summary struct {
		TotalCount        int64
		TotalTorrentCount int64
	}
	if err := base.Session(&gorm.Session{}).
		Select("COUNT(*) AS total_count, COALESCE(SUM(me.torrent_count), 0) AS total_torrent_count").
		Scan(&summary).Error; err != nil {
		return nil, 0, 0, err
	}

	var rows []model.MediaEntry
	if err := base.Select("me.*").
		Order("mti.position ASC, me.id ASC").
		Offset((page - 1) * limit).
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, 0, 0, err
	}

	items := make([]ListItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, listItemFromModel(row))
	}
	return items, summary.TotalCount, summary.TotalTorrentCount, nil
}

func loadTopicMediaIDs(db *gorm.DB, where, order string, limit int, args ...any) ([]string, error) {
	query := db.Table(model.TableNameMediaEntry+" me").
		Where(where, args...).
		Order(order).
		Limit(limit)
	var ids []string
	if err := query.Pluck("me.id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func loadTopicPreviewMap(ctx context.Context, db *gorm.DB, topics []model.MediaTopic, viewerID int64) (map[string][]ListItem, error) {
	result := make(map[string][]ListItem, len(topics))
	if len(topics) == 0 {
		return result, nil
	}

	var topicItems []model.MediaTopicItem
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaTopicItem).
		Where("topic_id IN ?", topicIDs(topics)).
		Where("position < ?", topicPreviewLimit).
		Order("topic_id ASC, position ASC, media_id ASC").
		Find(&topicItems).Error; err != nil {
		return nil, err
	}
	if len(topicItems) == 0 {
		return result, nil
	}

	mediaIDs := make([]string, 0, len(topicItems))
	for _, item := range topicItems {
		mediaIDs = append(mediaIDs, item.MediaID)
	}
	var entries []model.MediaEntry
	query := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("id IN ?", mediaIDs).
		Where("torrent_count > 0")
	if viewerID > 0 {
		query = query.Where(
			"NOT EXISTS (SELECT 1 FROM "+model.TableNameUserMediaBlock+" AS umb WHERE umb.user_id = ? AND umb.media_id = "+model.TableNameMediaEntry+".id)",
			viewerID,
		)
	}
	if err := query.Find(&entries).Error; err != nil {
		return nil, err
	}

	entriesByID := make(map[string]model.MediaEntry, len(entries))
	for _, entry := range entries {
		entriesByID[entry.ID] = entry
	}
	for _, item := range topicItems {
		if entry, ok := entriesByID[item.MediaID]; ok {
			result[item.TopicID] = append(result[item.TopicID], listItemFromModel(entry))
		}
	}
	return result, nil
}

func loadTopicMediaIDMap(ctx context.Context, db *gorm.DB, topics []model.MediaTopic) (map[string][]string, error) {
	result := make(map[string][]string, len(topics))
	if len(topics) == 0 {
		return result, nil
	}

	var rows []model.MediaTopicItem
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaTopicItem).
		Where("topic_id IN ?", topicIDs(topics)).
		Order("topic_id ASC, position ASC, media_id ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.TopicID] = append(result[row.TopicID], row.MediaID)
	}
	return result, nil
}

func topicIDs(topics []model.MediaTopic) []string {
	ids := make([]string, 0, len(topics))
	for _, topic := range topics {
		ids = append(ids, topic.ID)
	}
	return ids
}

func normalizeTopicInput(input TopicAdminInput) (string, string, []string, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || utf8.RuneCountInString(name) > 120 {
		return "", "", nil, ErrInvalidTopic
	}
	description := strings.TrimSpace(input.Description)
	if utf8.RuneCountInString(description) > 500 {
		return "", "", nil, ErrInvalidTopic
	}
	if input.SortOrder < -100000 || input.SortOrder > 100000 {
		return "", "", nil, ErrInvalidTopic
	}
	return name, description, normalizeTopicMediaIDs(input.MediaIDs), nil
}

func inputEnabled(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}

func topicEnabled(enabledByID map[string]bool, id string) bool {
	if enabled, ok := enabledByID[id]; ok {
		return enabled
	}
	return true
}

func normalizeTopicMediaIDs(ids []string) []string {
	result := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		normalized := strings.TrimSpace(id)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}

func validateTopicMediaIDs(ctx context.Context, db *gorm.DB, ids []string) ([]string, error) {
	if len(ids) == 0 {
		return []string{}, nil
	}
	var existing []string
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("id IN ?", ids).
		Pluck("id", &existing).Error; err != nil {
		return nil, err
	}
	existingSet := make(map[string]struct{}, len(existing))
	for _, id := range existing {
		existingSet[id] = struct{}{}
	}
	for _, id := range ids {
		if _, ok := existingSet[id]; !ok {
			return nil, ErrInvalidTopic
		}
	}
	return ids, nil
}

func replaceTopicItems(tx *gorm.DB, topicID string, mediaIDs []string, now time.Time) error {
	if err := tx.Session(&gorm.Session{NewDB: true}).
		Table(model.TableNameMediaTopicItem).
		Where("topic_id = ?", topicID).
		Delete(&model.MediaTopicItem{}).Error; err != nil {
		return err
	}
	if len(mediaIDs) == 0 {
		return nil
	}
	items := make([]model.MediaTopicItem, 0, len(mediaIDs))
	for position, mediaID := range mediaIDs {
		items = append(items, model.MediaTopicItem{
			TopicID:   topicID,
			MediaID:   mediaID,
			Position:  position,
			CreatedAt: now,
		})
	}
	return tx.Session(&gorm.Session{NewDB: true}).CreateInBatches(&items, 500).Error
}

func newCustomTopicID() (string, error) {
	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return "custom:" + hex.EncodeToString(random), nil
}

func loadFranchiseTopicRows(ctx context.Context, db *gorm.DB) ([]franchiseTopicRow, error) {
	var rows []franchiseTopicRow
	err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry+" me").
		Select("cc.source, cc.id, cc.name, localized.name_zh AS localized_name, COUNT(DISTINCT me.id) AS item_count").
		Joins("JOIN "+model.TableNameContentCollectionContent+" ccc ON ccc.content_type = me.content_type AND ccc.content_source = me.content_source AND ccc.content_id = me.content_id").
		Joins("JOIN "+model.TableNameContentCollection+" cc ON cc.type = ccc.content_collection_type AND cc.source = ccc.content_collection_source AND cc.id = ccc.content_collection_id").
		Joins("LEFT JOIN LATERAL ("+
			"SELECT me_localized.name_zh "+
			"FROM "+model.TableNameMediaEntry+" me_localized "+
			"JOIN "+model.TableNameContentCollectionContent+" ccc_localized ON ccc_localized.content_type = me_localized.content_type AND ccc_localized.content_source = me_localized.content_source AND ccc_localized.content_id = me_localized.content_id "+
			"WHERE ccc_localized.content_collection_type = cc.type "+
			"AND ccc_localized.content_collection_source = cc.source "+
			"AND ccc_localized.content_collection_id = cc.id "+
			"AND me_localized.torrent_count > 0 "+
			"AND NULLIF(BTRIM(me_localized.name_zh), '') IS NOT NULL "+
			"ORDER BY CHAR_LENGTH(me_localized.name_zh) ASC, me_localized.release_year ASC NULLS LAST, me_localized.id ASC "+
			"LIMIT 1"+
			") localized ON TRUE").
		Where("me.torrent_count > 0").
		Where("cc.type = ?", "franchise").
		Where("cc.name <> ''").
		Group("cc.source, cc.id, cc.name, localized.name_zh").
		Having("COUNT(DISTINCT me.id) >= ?", 2).
		Order("item_count DESC, cc.name ASC").
		Find(&rows).Error
	return rows, err
}

func localizedFranchiseTopicName(original, localized string) string {
	original = strings.TrimSpace(original)
	localized = strings.TrimSpace(localized)
	if localized == "" || !containsHan(localized) {
		return original
	}
	if strings.HasSuffix(localized, "系列") || strings.HasSuffix(localized, "合集") {
		return localized
	}
	return localized + "系列"
}

func loadFranchiseMediaIDs(db *gorm.DB, franchise franchiseTopicRow) ([]string, error) {
	var ids []string
	err := db.Table(model.TableNameMediaEntry+" me").
		Select("me.id").
		Joins("JOIN "+model.TableNameContentCollectionContent+" ccc ON ccc.content_type = me.content_type AND ccc.content_source = me.content_source AND ccc.content_id = me.content_id").
		Where("me.torrent_count > 0").
		Where("ccc.content_collection_type = ?", "franchise").
		Where("ccc.content_collection_source = ?", franchise.Source).
		Where("ccc.content_collection_id = ?", franchise.ID).
		Order("me.release_year ASC NULLS LAST, me.id ASC").
		Pluck("me.id", &ids).Error
	return ids, err
}

func franchiseTopicID(source, id string) string {
	return fmt.Sprintf("%s:%s:%s", topicKindFranchise, source, id)
}

func topicItemFromModel(topic model.MediaTopic, previews []ListItem) TopicItem {
	return TopicItem{
		ID:          topic.ID,
		Kind:        topic.Kind,
		Module:      topic.Module,
		Name:        topic.Name,
		Description: topic.Description,
		ItemCount:   topic.ItemCount,
		Enabled:     topic.Enabled,
		UpdatedAt:   topic.UpdatedAt,
		Previews:    previews,
	}
}

func topicAdminItemFromModel(topic model.MediaTopic, mediaIDs []string) TopicAdminItem {
	return TopicAdminItem{
		ID:          topic.ID,
		Kind:        topic.Kind,
		Module:      topic.Module,
		Name:        topic.Name,
		Description: topic.Description,
		SortOrder:   topic.SortOrder,
		ItemCount:   topic.ItemCount,
		Enabled:     topic.Enabled,
		UpdatedAt:   topic.UpdatedAt,
		MediaIDs:    mediaIDs,
	}
}
