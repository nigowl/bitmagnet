package search

import (
	"context"
	"sort"

	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/database/query"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/protocol"
	"gorm.io/gen/field"
)

type torrentContentTorrentHydratorConfig struct {
	files bool
}

type HydrateTorrentContentTorrentOption func(config *torrentContentTorrentHydratorConfig)

func HydrateTorrentContentTorrentWithFiles() HydrateTorrentContentTorrentOption {
	return func(config *torrentContentTorrentHydratorConfig) {
		config.files = true
	}
}

func HydrateTorrentContentTorrent(options ...HydrateTorrentContentTorrentOption) query.Option {
	var config torrentContentTorrentHydratorConfig
	for _, option := range options {
		option(&config)
	}

	return query.HydrateHasOne[TorrentContentResultItem, model.Torrent, protocol.ID](
		torrentContentTorrentHydrator{config},
	)
}

type torrentContentTorrentHydrator struct {
	torrentContentTorrentHydratorConfig
}

func (torrentContentTorrentHydrator) RootToSubID(root TorrentContentResultItem) (protocol.ID, bool) {
	return root.InfoHash, true
}

func (h torrentContentTorrentHydrator) GetSubs(
	ctx context.Context,
	dbCtx query.DBContext,
	ids []protocol.ID,
) ([]model.Torrent, error) {
	result, err := search{dbCtx.Query()}.
		Torrents(ctx,
			query.Where(TorrentInfoHashCriteria(ids...)),
			query.Preload(func(q *dao.Query) []field.RelationField {
				return []field.RelationField{
					q.Torrent.Sources.RelationField,
					q.Torrent.Sources.TorrentSource.RelationField,
					q.Torrent.Hint.RelationField,
					q.Torrent.Tags.RelationField,
				}
			}))
	if err != nil {
		return nil, err
	}

	if h.files && len(result.Items) > 0 {
		fileResult, fileErr := search{dbCtx.Query()}.TorrentFiles(
			ctx,
			query.Where(
				TorrentFileInfoHashCriteria(ids...),
				query.DBCriteria{
					SQL:  model.TableNameTorrentFile + ".index < ?",
					Args: []interface{}{5},
				},
			),
		)
		if fileErr != nil {
			return nil, fileErr
		}

		filesByHash := make(map[protocol.ID][]model.TorrentFile, len(ids))
		for _, file := range fileResult.Items {
			filesByHash[file.InfoHash] = append(filesByHash[file.InfoHash], file)
		}
		for i := range result.Items {
			result.Items[i].Files = filesByHash[result.Items[i].InfoHash]
			sort.Slice(result.Items[i].Files, func(left, right int) bool {
				return result.Items[i].Files[left].Index < result.Items[i].Files[right].Index
			})
		}
	}

	return result.Items, nil
}

func (torrentContentTorrentHydrator) SubID(item model.Torrent) protocol.ID {
	return item.InfoHash
}

func (torrentContentTorrentHydrator) Hydrate(root *TorrentContentResultItem, sub model.Torrent) {
	root.Torrent = sub
}

func (torrentContentTorrentHydrator) MustSucceed() bool {
	return true
}
