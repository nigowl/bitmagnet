package model

import (
	"crypto/md5"
	"fmt"
	"time"
)

var TableNameMediaEntry = "media_entries"

// MediaEntry stores one media entity (movie / tv show), and aggregates multiple torrents.
type MediaEntry struct {
	ID                  string            `gorm:"column:id;primaryKey;<-:create" json:"id"`
	ContentType         ContentType       `gorm:"column:content_type;not null" json:"contentType"`
	ContentSource       string            `gorm:"column:content_source;not null" json:"contentSource"`
	ContentID           string            `gorm:"column:content_id;not null" json:"contentId"`
	Title               string            `gorm:"column:title;not null" json:"title"`
	NameOriginal        NullString        `gorm:"column:name_original" json:"nameOriginal"`
	NameEn              NullString        `gorm:"column:name_en" json:"nameEn"`
	NameZh              NullString        `gorm:"column:name_zh" json:"nameZh"`
	ReleaseDate         Date              `gorm:"column:release_date" json:"releaseDate"`
	ReleaseYear         Year              `gorm:"column:release_year" json:"releaseYear"`
	OriginalLanguage    NullLanguage      `gorm:"column:original_language" json:"originalLanguage"`
	OriginalTitle       NullString        `gorm:"column:original_title" json:"originalTitle"`
	Overview            NullString        `gorm:"column:overview" json:"overview"`
	OverviewOriginal    NullString        `gorm:"column:overview_original" json:"overviewOriginal"`
	OverviewEn          NullString        `gorm:"column:overview_en" json:"overviewEn"`
	OverviewZh          NullString        `gorm:"column:overview_zh" json:"overviewZh"`
	Tagline             NullString        `gorm:"column:tagline" json:"tagline"`
	StatusText          NullString        `gorm:"column:status_text" json:"statusText"`
	HomepageURL         NullString        `gorm:"column:homepage_url" json:"homepageUrl"`
	Runtime             NullUint16        `gorm:"column:runtime" json:"runtime"`
	Popularity          NullFloat32       `gorm:"column:popularity" json:"popularity"`
	VoteCount           NullUint          `gorm:"column:vote_count" json:"voteCount"`
	PosterPath          NullString        `gorm:"column:poster_path" json:"posterPath"`
	BackdropPath        NullString        `gorm:"column:backdrop_path" json:"backdropPath"`
	VoteAverage         NullFloat32       `gorm:"column:vote_average" json:"voteAverage"`
	Collections         []MediaCollection `gorm:"column:collections;serializer:json" json:"collections"`
	Attributes          []MediaAttribute  `gorm:"column:attributes;serializer:json" json:"attributes"`
	Genres              []string          `gorm:"column:genres;serializer:json" json:"genres"`
	Languages           []string          `gorm:"column:languages;serializer:json" json:"languages"`
	ProductionCountries []string          `gorm:"column:production_countries;serializer:json" json:"productionCountries"`
	SpokenLanguages     []string          `gorm:"column:spoken_languages;serializer:json" json:"spokenLanguages"`
	PremiereDates       []string          `gorm:"column:premiere_dates;serializer:json" json:"premiereDates"`
	SeasonCount         NullUint          `gorm:"column:season_count" json:"seasonCount"`
	EpisodeCount        NullUint          `gorm:"column:episode_count" json:"episodeCount"`
	NetworkNames        []string          `gorm:"column:network_names;serializer:json" json:"networkNames"`
	StudioNames         []string          `gorm:"column:studio_names;serializer:json" json:"studioNames"`
	AwardNames          []string          `gorm:"column:award_names;serializer:json" json:"awardNames"`
	CreatorNames        []string          `gorm:"column:creator_names;serializer:json" json:"creatorNames"`
	TitleAliases        []string          `gorm:"column:title_aliases;serializer:json" json:"titleAliases"`
	Certification       NullString        `gorm:"column:certification" json:"certification"`
	CastMembers         []string          `gorm:"column:cast_members;serializer:json" json:"castMembers"`
	DirectorNames       []string          `gorm:"column:director_names;serializer:json" json:"directorNames"`
	WriterNames         []string          `gorm:"column:writer_names;serializer:json" json:"writerNames"`
	IMDbID              NullString        `gorm:"column:imdb_id" json:"imdbId"`
	DoubanID            NullString        `gorm:"column:douban_id" json:"doubanId"`
	QualityTags         []string          `gorm:"column:quality_tags;serializer:json" json:"qualityTags"`
	IsAnime             bool              `gorm:"column:is_anime;not null" json:"isAnime"`
	TorrentCount        uint              `gorm:"column:torrent_count;not null" json:"torrentCount"`
	MaxSeeders          NullUint          `gorm:"column:max_seeders" json:"maxSeeders"`
	LatestPublishedAt   *time.Time        `gorm:"column:latest_published_at" json:"latestPublishedAt"`
	CreatedAt           time.Time         `gorm:"column:created_at;not null;<-:create" json:"createdAt"`
	UpdatedAt           time.Time         `gorm:"column:updated_at;not null" json:"updatedAt"`
}

func (*MediaEntry) TableName() string {
	return TableNameMediaEntry
}

func MediaEntryID(contentType ContentType, contentSource, contentID string) string {
	raw := fmt.Sprintf("%s:%s:%s", contentType, contentSource, contentID)
	return fmt.Sprintf("%x", md5.Sum([]byte(raw)))
}
