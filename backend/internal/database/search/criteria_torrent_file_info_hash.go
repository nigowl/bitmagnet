package search

import (
	"github.com/nigowl/bitmagnet/internal/database/query"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/protocol"
)

func TorrentFileInfoHashCriteria(infoHashes ...protocol.ID) query.Criteria {
	return infoHashCriteria(model.TableNameTorrentFile, infoHashes...)
}
