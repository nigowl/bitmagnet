package search

import (
	"github.com/bitmagnet-io/bitmagnet/internal/database/query"
	"github.com/bitmagnet-io/bitmagnet/internal/maps"
	"github.com/bitmagnet-io/bitmagnet/internal/model"
)

const ContentSourceFacetKey = "content_source"

func TorrentContentSourceFacet(options ...query.FacetOption) query.Facet {
	return torrentContentSourceFacet{
		FacetConfig: query.NewFacetConfig(
			append([]query.FacetOption{
				query.FacetHasKey(ContentSourceFacetKey),
				query.FacetHasLabel("Content Source"),
				query.FacetUsesOrLogic(),
			}, options...)...,
		),
	}
}

type torrentContentSourceFacet struct {
	query.FacetConfig
}

func (torrentContentSourceFacet) Values(ctx query.FacetContext) (map[string]string, error) {
	sources, err := ctx.Query().MetadataSource.WithContext(ctx.Context()).Find()
	if err != nil {
		return nil, err
	}

	values := make(map[string]string, len(sources))

	for _, source := range sources {
		values[source.Key] = source.Name
	}

	return values, nil
}

func (torrentContentSourceFacet) Criteria(filter query.FacetFilter) []query.Criteria {
	if len(filter) == 0 {
		return []query.Criteria{}
	}

	return []query.Criteria{
		query.GenCriteria(func(ctx query.DBContext) (query.Criteria, error) {
			values := make([]string, 0, len(filter.Values()))
			for _, value := range filter.Values() {
				values = append(values, value)
			}

			joins := maps.NewInsertMap(maps.MapEntry[string, struct{}]{Key: model.TableNameTorrentContent})

			return query.RawCriteria{
				Query: ctx.Query().TorrentContent.ContentSource.In(values...).RawExpr(),
				Joins: joins,
			}, nil
		}),
	}
}
