package media

import (
	"context"
	"errors"
	"strings"

	"github.com/nigowl/bitmagnet/internal/model"
)

func (s *service) EnsureContentRefsReady(ctx context.Context, refs []model.ContentRef) error {
	filteredRefs := filterSupportedRefs(refs)
	if len(filteredRefs) == 0 {
		return nil
	}

	q, err := s.dao.Get()
	if err != nil {
		return err
	}

	db := q.TorrentContent.WithContext(ctx).UnderlyingDB()
	runtimeOptions := s.loadRuntimeOptions(ctx, db)
	if !runtimeOptions.autoFetchBilingual && !runtimeOptions.autoCacheCover {
		return nil
	}

	mediaIDs := make([]string, 0, len(filteredRefs))
	for _, ref := range filteredRefs {
		mediaIDs = append(mediaIDs, model.MediaEntryID(ref.Type, ref.Source, ref.ID))
	}

	var rows []model.MediaEntry
	if err := db.WithContext(ctx).
		Table(model.TableNameMediaEntry).
		Where("id IN ?", mediaIDs).
		Where("torrent_count > 0").
		Find(&rows).Error; err != nil {
		return err
	}

	var runErr error
outer:
	for _, row := range rows {
		if ctxErr := ctx.Err(); ctxErr != nil {
			if runErr == nil {
				runErr = ctxErr
			}
			break
		}

		current := row

		if runtimeOptions.autoFetchBilingual {
			enriched := s.sitePluginManager.Enrich(ctx, db, row)
			if ctxErr := ctx.Err(); ctxErr != nil {
				if runErr == nil {
					runErr = ctxErr
				}
				break
			}

			if enrichErr := enrichStructuredMetadata(ctx, db, []string{enriched.ID}); enrichErr != nil && runErr == nil {
				runErr = enrichErr
				if errors.Is(enrichErr, context.Canceled) || errors.Is(enrichErr, context.DeadlineExceeded) {
					break
				}
			}
			if ctxErr := ctx.Err(); ctxErr != nil {
				if runErr == nil {
					runErr = ctxErr
				}
				break
			}

			var refreshed model.MediaEntry
			if reloadErr := db.WithContext(ctx).
				Table(model.TableNameMediaEntry).
				Where("id = ?", enriched.ID).
				Take(&refreshed).Error; reloadErr == nil {
				current = refreshed
			} else if (errors.Is(reloadErr, context.Canceled) || errors.Is(reloadErr, context.DeadlineExceeded)) && runErr == nil {
				runErr = reloadErr
				break
			}
		}

		if runtimeOptions.autoCacheCover {
			if ctxErr := ctx.Err(); ctxErr != nil {
				if runErr == nil {
					runErr = ctxErr
				}
				break
			}

			if strings.TrimSpace(current.PosterPath.String) != "" &&
				s.entryNeedsCoverCacheKind(current.ID, coverKindPoster, current.PosterPath.String) {
				if _, resolveErr := s.coverCache.resolvePath(ctx, current.ID, coverKindPoster, coverSizeMD, current.PosterPath.String); resolveErr != nil && runErr == nil {
					runErr = resolveErr
					if errors.Is(resolveErr, context.Canceled) || errors.Is(resolveErr, context.DeadlineExceeded) {
						break outer
					}
				}
			}
			if strings.TrimSpace(current.BackdropPath.String) != "" &&
				s.entryNeedsCoverCacheKind(current.ID, coverKindBackdrop, current.BackdropPath.String) {
				if _, resolveErr := s.coverCache.resolvePath(ctx, current.ID, coverKindBackdrop, coverSizeMD, current.BackdropPath.String); resolveErr != nil && runErr == nil {
					runErr = resolveErr
					if errors.Is(resolveErr, context.Canceled) || errors.Is(resolveErr, context.DeadlineExceeded) {
						break outer
					}
				}
			}
		}
	}

	return runErr
}
