package processor

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nigowl/bitmagnet/internal/blocking"
	"github.com/nigowl/bitmagnet/internal/classifier"
	"github.com/nigowl/bitmagnet/internal/classifier/classification"
	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/database/query"
	"github.com/nigowl/bitmagnet/internal/database/search"
	"github.com/nigowl/bitmagnet/internal/media"
	"github.com/nigowl/bitmagnet/internal/model"
	"github.com/nigowl/bitmagnet/internal/protocol"
	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"go.uber.org/zap"
	"gorm.io/gen/field"
	"gorm.io/gorm/clause"
)

type Processor interface {
	Process(ctx context.Context, params MessageParams) error
}

type processor struct {
	defaultWorkflow string
	search          search.Search
	runner          classifier.Runner
	dao             *dao.Query
	blockingManager blocking.Manager
	mediaService    media.Service
	mediaWarmupSem  chan struct{}
	mediaWarmupCfg  mediaWarmupRuntimeConfig
	logger          *zap.SugaredLogger
}

type mediaWarmupRuntimeConfig struct {
	defaultTimeout time.Duration
	cacheTTL       time.Duration
	mutex          sync.RWMutex
	cacheLoaded    bool
	cachedAt       time.Time
	cachedTimeout  time.Duration
}

type MissingHashesError struct {
	InfoHashes []protocol.ID
}

func (e MissingHashesError) Error() string {
	return fmt.Sprintf("missing %d info hashes", len(e.InfoHashes))
}

func (c *processor) Process(ctx context.Context, params MessageParams) error {
	workflowName := params.ClassifierWorkflow
	if workflowName == "" {
		workflowName = c.defaultWorkflow
	}

	searchResult, searchErr := c.search.TorrentsWithMissingInfoHashes(
		ctx,
		params.InfoHashes,
		query.Preload(func(q *dao.Query) []field.RelationField {
			return []field.RelationField{
				q.Torrent.Files.RelationField,
				q.Torrent.Hint.RelationField,
				q.Torrent.Sources.RelationField,
			}
		}),
	)
	if searchErr != nil {
		return searchErr
	}

	tcResult, tcErr := c.search.TorrentContent(
		ctx,
		query.Where(search.TorrentContentInfoHashCriteria(params.InfoHashes...)),
		search.HydrateTorrentContentContent(),
	)
	if tcErr != nil {
		return tcErr
	}

	for _, tc := range tcResult.Items {
		for ti, t := range searchResult.Torrents {
			if t.InfoHash == tc.InfoHash {
				searchResult.Torrents[ti].Contents = append(
					searchResult.Torrents[ti].Contents,
					tc.TorrentContent,
				)

				break
			}
		}
	}

	var (
		mtx                sync.Mutex
		wg                 sync.WaitGroup
		errs               []error
		idsToDelete        []string
		infoHashesToDelete []protocol.ID
	)

	tcs := make([]model.TorrentContent, 0, len(searchResult.Torrents))

	tagsToAdd := make(map[protocol.ID]map[string]struct{})

	failedHashes := make([]protocol.ID, 0, len(searchResult.MissingInfoHashes))
	failedHashes = append(failedHashes, searchResult.MissingInfoHashes...)

	if len(failedHashes) > 0 {
		errs = append(errs, MissingHashesError{InfoHashes: failedHashes})
	}

	for _, torrent := range searchResult.Torrents {
		wg.Add(1)

		go func(torrent model.Torrent) {
			defer wg.Done()

			thisDeleteIDs := make(map[string]struct{}, len(torrent.Contents))
			foundMatch := false

			for _, tc := range torrent.Contents {
				thisDeleteIDs[tc.ID] = struct{}{}

				if !foundMatch &&
					!torrent.Hint.ContentSource.Valid &&
					params.ClassifyMode != ClassifyModeRematch &&
					tc.ContentType.Valid &&
					tc.ContentSource.Valid &&
					(torrent.Hint.IsNil() || torrent.Hint.ContentType == tc.ContentType.ContentType) {
					torrent.Hint.ContentType = tc.ContentType.ContentType
					torrent.Hint.ContentSource = tc.ContentSource
					torrent.Hint.ContentID = tc.ContentID
					foundMatch = true
				}
			}

			cl, classifyErr := c.runner.Run(ctx, workflowName, params.ClassifierFlags, torrent)

			mtx.Lock()
			defer mtx.Unlock()

			if classifyErr != nil {
				if errors.Is(classifyErr, classification.ErrDeleteTorrent) {
					infoHashesToDelete = append(infoHashesToDelete, torrent.InfoHash)
				} else {
					failedHashes = append(failedHashes, torrent.InfoHash)
					errs = append(errs, classifyErr)
				}
			} else {
				torrentContent := newTorrentContent(torrent, cl)

				tcID := torrentContent.InferID()
				for id := range thisDeleteIDs {
					if id != tcID {
						idsToDelete = append(idsToDelete, id)
					}
				}

				tcs = append(tcs, torrentContent)

				if len(cl.Tags) > 0 {
					tagsToAdd[torrent.InfoHash] = cl.Tags
				}
			}
		}(torrent)
	}

	wg.Wait()

	if len(failedHashes) > 0 {
		if len(tcs) == 0 {
			return errors.Join(errs...)
		}

		republishJob, republishJobErr := NewQueueJob(MessageParams{
			InfoHashes:         failedHashes,
			ClassifyMode:       params.ClassifyMode,
			ClassifierWorkflow: workflowName,
			ClassifierFlags:    params.ClassifierFlags,
		})
		if republishJobErr != nil {
			return errors.Join(append(errs, republishJobErr)...)
		}

		if err := c.dao.QueueJob.WithContext(ctx).Clauses(clause.OnConflict{
			DoNothing: true,
		}).Create(&republishJob); err != nil {
			return errors.Join(append(errs, err)...)
		}
	}

	if len(tcs) == 0 {
		return nil
	}

	return c.persist(ctx, persistPayload{
		torrentContents:  tcs,
		deleteIDs:        idsToDelete,
		deleteInfoHashes: infoHashesToDelete,
		addTags:          tagsToAdd,
	})
}

func newTorrentContent(t model.Torrent, c classification.Result) model.TorrentContent {
	var filesCount model.NullUint
	if t.FilesCount.Valid {
		filesCount = t.FilesCount
	} else if t.FilesStatus == model.FilesStatusSingle {
		filesCount = model.NewNullUint(1)
	}

	tc := model.TorrentContent{
		Torrent:         t,
		InfoHash:        t.InfoHash,
		ContentType:     c.ContentType,
		Languages:       c.Languages,
		Episodes:        c.Episodes,
		VideoResolution: c.VideoResolution,
		VideoSource:     c.VideoSource,
		VideoCodec:      c.VideoCodec,
		Video3D:         c.Video3D,
		VideoModifier:   c.VideoModifier,
		ReleaseGroup:    c.ReleaseGroup,
		Size:            t.Size,
		FilesCount:      filesCount,
		Seeders:         t.Seeders(),
		Leechers:        t.Leechers(),
		PublishedAt:     t.PublishedAt(),
	}

	if c.Content != nil {
		content := *c.Content
		content.UpdateTsv()
		tc.ContentType = model.NewNullContentType(content.Type)
		tc.ContentSource = model.NewNullString(content.Source)
		tc.ContentID = model.NewNullString(content.ID)
		tc.Content = content
	}

	tc.UpdateTsv()

	return tc
}

func (c *processor) ensureMediaRefsReady(refs []model.ContentRef) {
	if c.mediaService == nil || len(refs) == 0 {
		return
	}
	if c.mediaWarmupSem != nil {
		select {
		case c.mediaWarmupSem <- struct{}{}:
		default:
			if c.logger != nil {
				c.logger.Debugw("skip media warmup: previous task still running", "refCount", len(refs))
			}
			return
		}
	}

	refsCopy := append([]model.ContentRef(nil), refs...)
	go func() {
		if c.mediaWarmupSem != nil {
			defer func() { <-c.mediaWarmupSem }()
		}

		timeout := c.getMediaWarmupTimeout()
		runCtx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()

		if err := c.mediaService.EnsureContentRefsReady(runCtx, refsCopy); err != nil && c.logger != nil {
			c.logger.Warnw("ensure media refs ready failed", "error", err, "refCount", len(refsCopy), "timeout", timeout.String())
		}
	}()
}

func (c *processor) getMediaWarmupTimeout() time.Duration {
	defaultTimeout := c.mediaWarmupCfg.defaultTimeout
	if defaultTimeout <= 0 {
		defaultTimeout = 90 * time.Second
	}
	if c.dao == nil {
		return defaultTimeout
	}

	if c.mediaWarmupCfg.cacheTTL <= 0 {
		c.mediaWarmupCfg.cacheTTL = 10 * time.Second
	}

	now := time.Now()
	c.mediaWarmupCfg.mutex.RLock()
	if c.mediaWarmupCfg.cacheLoaded && now.Sub(c.mediaWarmupCfg.cachedAt) < c.mediaWarmupCfg.cacheTTL {
		timeout := c.mediaWarmupCfg.cachedTimeout
		c.mediaWarmupCfg.mutex.RUnlock()
		if timeout > 0 {
			return timeout
		}
		return defaultTimeout
	}
	c.mediaWarmupCfg.mutex.RUnlock()

	loadedTimeout := defaultTimeout
	db := c.dao.KeyValue.UnderlyingDB()
	if db != nil {
		values, err := runtimeconfig.ReadValues(context.Background(), db, []string{runtimeconfig.KeyMediaWarmupTimeoutSeconds})
		if err == nil {
			if raw, ok := values[runtimeconfig.KeyMediaWarmupTimeoutSeconds]; ok {
				if parsed, parseErr := strconv.Atoi(strings.TrimSpace(raw)); parseErr == nil && parsed >= 5 && parsed <= 7200 {
					loadedTimeout = time.Duration(parsed) * time.Second
				}
			}
		}
	}

	c.mediaWarmupCfg.mutex.Lock()
	c.mediaWarmupCfg.cacheLoaded = true
	c.mediaWarmupCfg.cachedAt = now
	c.mediaWarmupCfg.cachedTimeout = loadedTimeout
	c.mediaWarmupCfg.mutex.Unlock()

	return loadedTimeout
}
