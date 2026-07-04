package media

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"
)

const (
	playerCacheQueuePending  = "pending"
	playerCacheQueueRunning  = "running"
	playerCacheQueueDone     = "done"
	playerCacheQueueFailed   = "failed"
	playerCacheQueueCanceled = "canceled"
)

type playerTransmissionCacheQueue struct {
	// ponytail: in-memory queue; use a DB-backed queue if pending items must survive restarts.
	mu            sync.Mutex
	items         map[string]*playerTransmissionCacheQueueItem
	order         []string
	workerStarted bool
}

type playerTransmissionCacheQueueItem struct {
	infoHash string
	state    string
	err      string
	updated  time.Time
}

type playerTransmissionCacheQueueSnapshot struct {
	infoHash string
	state    string
	position int
	err      string
	updated  time.Time
}

func newPlayerTransmissionCacheQueue() playerTransmissionCacheQueue {
	return playerTransmissionCacheQueue{items: make(map[string]*playerTransmissionCacheQueueItem)}
}

func (q *playerTransmissionCacheQueue) enqueue(infoHash string) playerTransmissionCacheQueueSnapshot {
	q.mu.Lock()
	defer q.mu.Unlock()

	now := time.Now()
	if item, ok := q.items[infoHash]; ok {
		if item.state == playerCacheQueueFailed || item.state == playerCacheQueueDone || item.state == playerCacheQueueCanceled {
			item.state = playerCacheQueuePending
			item.err = ""
			item.updated = now
		}
		return q.snapshotLocked(infoHash)
	}

	q.items[infoHash] = &playerTransmissionCacheQueueItem{
		infoHash: infoHash,
		state:    playerCacheQueuePending,
		updated:  now,
	}
	q.order = append(q.order, infoHash)
	return q.snapshotLocked(infoHash)
}

func (q *playerTransmissionCacheQueue) snapshot(infoHash string) playerTransmissionCacheQueueSnapshot {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.snapshotLocked(infoHash)
}

func (q *playerTransmissionCacheQueue) snapshots(infoHashes []string) map[string]playerTransmissionCacheQueueSnapshot {
	q.mu.Lock()
	defer q.mu.Unlock()

	result := make(map[string]playerTransmissionCacheQueueSnapshot, len(infoHashes))
	for _, infoHash := range infoHashes {
		if snapshot := q.snapshotLocked(infoHash); snapshot.state != "" {
			result[infoHash] = snapshot
		}
	}
	return result
}

func (q *playerTransmissionCacheQueue) snapshotLocked(infoHash string) playerTransmissionCacheQueueSnapshot {
	item, ok := q.items[infoHash]
	if !ok {
		return playerTransmissionCacheQueueSnapshot{}
	}
	position := 0
	if item.state == playerCacheQueuePending {
		for _, queued := range q.order {
			candidate, ok := q.items[queued]
			if !ok || candidate.state != playerCacheQueuePending {
				continue
			}
			position++
			if queued == infoHash {
				break
			}
		}
	}
	return playerTransmissionCacheQueueSnapshot{
		infoHash: item.infoHash,
		state:    item.state,
		position: position,
		err:      item.err,
		updated:  item.updated,
	}
}

func (q *playerTransmissionCacheQueue) runningCount() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.runningCountLocked()
}

func (q *playerTransmissionCacheQueue) runningHashes() []string {
	q.mu.Lock()
	defer q.mu.Unlock()

	hashes := make([]string, 0)
	for _, infoHash := range q.order {
		item, ok := q.items[infoHash]
		if ok && item.state == playerCacheQueueRunning {
			hashes = append(hashes, infoHash)
		}
	}
	return hashes
}

func (q *playerTransmissionCacheQueue) claimPending(limit int) []string {
	if limit <= 0 {
		return nil
	}

	q.mu.Lock()
	defer q.mu.Unlock()

	claimed := make([]string, 0, limit)
	now := time.Now()
	for _, infoHash := range q.order {
		if len(claimed) >= limit {
			break
		}
		item, ok := q.items[infoHash]
		if !ok || item.state != playerCacheQueuePending {
			continue
		}
		item.state = playerCacheQueueRunning
		item.err = ""
		item.updated = now
		claimed = append(claimed, infoHash)
	}
	return claimed
}

func (q *playerTransmissionCacheQueue) retryFailures(errText string) {
	q.mu.Lock()
	defer q.mu.Unlock()

	now := time.Now()
	for _, item := range q.items {
		if item.state == playerCacheQueueFailed && item.err == errText {
			item.state = playerCacheQueuePending
			item.err = ""
			item.updated = now
		}
	}
}

func (q *playerTransmissionCacheQueue) list() []playerTransmissionCacheQueueSnapshot {
	q.mu.Lock()
	defer q.mu.Unlock()

	result := make([]playerTransmissionCacheQueueSnapshot, 0, len(q.order))
	for _, infoHash := range q.order {
		if snapshot := q.snapshotLocked(infoHash); snapshot.infoHash != "" {
			result = append(result, snapshot)
		}
	}
	return result
}

func (q *playerTransmissionCacheQueue) remove(infoHash string) bool {
	q.mu.Lock()
	defer q.mu.Unlock()

	if _, ok := q.items[infoHash]; !ok {
		return false
	}
	delete(q.items, infoHash)
	nextOrder := q.order[:0]
	for _, queued := range q.order {
		if queued != infoHash {
			nextOrder = append(nextOrder, queued)
		}
	}
	q.order = nextOrder
	return true
}

func (q *playerTransmissionCacheQueue) setState(infoHash string, state string, errText string) {
	q.mu.Lock()
	defer q.mu.Unlock()

	item, ok := q.items[infoHash]
	if !ok {
		return
	}
	if item.state == playerCacheQueueCanceled && state != playerCacheQueuePending && state != playerCacheQueueCanceled {
		return
	}
	item.state = state
	item.err = errText
	item.updated = time.Now()
}

func (q *playerTransmissionCacheQueue) runningCountLocked() int {
	count := 0
	for _, item := range q.items {
		if item.state == playerCacheQueueRunning {
			count++
		}
	}
	return count
}

func (s *service) PlayerTransmissionEnqueueCache(
	ctx context.Context,
	input PlayerTransmissionCacheQueueInput,
) (PlayerTransmissionCacheQueueResult, error) {
	infoHash, _, _, settings, err := s.loadPlayerTransmissionBase(ctx, input.InfoHash)
	if err != nil {
		return PlayerTransmissionCacheQueueResult{}, err
	}
	if !settings.TransmissionCacheQueueEnabled {
		return PlayerTransmissionCacheQueueResult{}, ErrPlayerCacheQueueDisabled
	}

	snapshot := s.playerCacheQueue.enqueue(infoHash)
	s.startPlayerCacheQueueWorker()
	return PlayerTransmissionCacheQueueResult{
		InfoHash:   infoHash,
		QueueState: snapshot.state,
		Position:   snapshot.position,
	}, nil
}

func (s *service) PlayerTransmissionCacheQueue(ctx context.Context) (PlayerTransmissionCacheQueueListResult, error) {
	items, err := s.loadPlayerCacheQueueItems(ctx)
	if err != nil {
		return PlayerTransmissionCacheQueueListResult{}, err
	}
	return PlayerTransmissionCacheQueueListResult{Items: items}, nil
}

func (s *service) PlayerTransmissionCancelCache(
	ctx context.Context,
	input PlayerTransmissionCacheQueueActionInput,
) (PlayerTransmissionCacheQueueItem, error) {
	infoHash, err := normalizePlayerInfoHash(input.InfoHash)
	if err != nil {
		return PlayerTransmissionCacheQueueItem{}, err
	}
	s.playerCacheQueue.setState(infoHash, playerCacheQueueCanceled, "")
	if _, err := s.PlayerTransmissionClearCache(ctx, PlayerTransmissionClearCacheInput{InfoHashes: []string{infoHash}}); err != nil {
		return PlayerTransmissionCacheQueueItem{}, err
	}
	return s.loadPlayerCacheQueueItem(ctx, infoHash)
}

func (s *service) PlayerTransmissionDeleteCache(
	ctx context.Context,
	input PlayerTransmissionCacheQueueActionInput,
) (PlayerTransmissionCacheQueueDeleteResult, error) {
	infoHash, err := normalizePlayerInfoHash(input.InfoHash)
	if err != nil {
		return PlayerTransmissionCacheQueueDeleteResult{}, err
	}
	if _, err := s.PlayerTransmissionClearCache(ctx, PlayerTransmissionClearCacheInput{InfoHashes: []string{infoHash}}); err != nil {
		return PlayerTransmissionCacheQueueDeleteResult{}, err
	}
	return PlayerTransmissionCacheQueueDeleteResult{
		InfoHash: infoHash,
		Removed:  s.playerCacheQueue.remove(infoHash),
	}, nil
}

func (s *service) loadPlayerCacheQueueItem(ctx context.Context, infoHash string) (PlayerTransmissionCacheQueueItem, error) {
	items, err := s.loadPlayerCacheQueueItems(ctx)
	if err != nil {
		return PlayerTransmissionCacheQueueItem{}, err
	}
	for _, item := range items {
		if item.InfoHash == infoHash {
			return item, nil
		}
	}
	return PlayerTransmissionCacheQueueItem{
		InfoHash: infoHash,
		State:    "missing",
	}, nil
}

func (s *service) loadPlayerCacheQueueItems(ctx context.Context) ([]PlayerTransmissionCacheQueueItem, error) {
	queueSnapshots := s.playerCacheQueue.list()
	if len(queueSnapshots) == 0 {
		return []PlayerTransmissionCacheQueueItem{}, nil
	}

	items := make([]PlayerTransmissionCacheQueueItem, 0, len(queueSnapshots))
	infoHashes := make([]string, 0, len(queueSnapshots))
	for _, snapshot := range queueSnapshots {
		infoHashes = append(infoHashes, snapshot.infoHash)
		items = append(items, PlayerTransmissionCacheQueueItem{
			InfoHash:      snapshot.infoHash,
			QueueState:    snapshot.state,
			QueuePosition: snapshot.position,
			ErrorMessage:  snapshot.err,
			UpdatedAt:     snapshot.updated,
			State:         "missing",
		})
	}

	q, err := s.dao.Get()
	if err != nil {
		return nil, err
	}
	db := q.Torrent.WithContext(ctx).UnderlyingDB()
	settings, err := s.loadPlayerBootstrapSettings(ctx, db)
	if err != nil || !settings.PlayerEnabled || !settings.TransmissionEnabled {
		return items, nil
	}

	transmissionSnapshots, err := s.playerTransmissionFetchTorrents(ctx, settings, infoHashes)
	if err != nil {
		return items, nil
	}
	s.syncMediaCacheFlagsForInfoHashes(ctx, db, settings, infoHashes, transmissionSnapshots)
	for idx := range items {
		snapshot, ok := transmissionSnapshots[items[idx].InfoHash]
		if !ok {
			continue
		}
		items[idx].Exists = true
		items[idx].TorrentID = snapshot.ID
		items[idx].Name = snapshot.Name
		items[idx].State = playerTransmissionStatusLabel(snapshot.Status)
		items[idx].Progress = clampRatio(snapshot.PercentDone)
	}
	return items, nil
}

func (s *service) startPlayerCacheQueueWorker() {
	s.playerCacheQueue.mu.Lock()
	if s.playerCacheQueue.workerStarted {
		s.playerCacheQueue.mu.Unlock()
		return
	}
	s.playerCacheQueue.workerStarted = true
	s.playerCacheQueue.mu.Unlock()

	go s.runPlayerCacheQueueWorker()
}

func (s *service) runPlayerCacheQueueWorker() {
	for {
		interval := s.processPlayerCacheQueue(context.Background())
		time.Sleep(interval)
	}
}

func (s *service) processPlayerCacheQueue(ctx context.Context) time.Duration {
	settings, err := s.loadPlayerCacheQueueSettings(ctx)
	if err != nil {
		s.logPlayerCacheQueueError("load settings", err)
		return time.Duration(defaultPlayerTransmissionCacheQueueCheckIntervalSeconds) * time.Second
	}
	interval := time.Duration(settings.TransmissionCacheQueueCheckInterval) * time.Second
	if !settings.PlayerEnabled || !settings.TransmissionEnabled || !settings.TransmissionCacheQueueEnabled {
		return interval
	}

	s.playerCacheQueue.retryFailures(ErrPlayerFileNotFound.Error())
	s.monitorRunningPlayerCacheItems(ctx, settings)
	capacity := settings.TransmissionCacheQueueMaxActive - s.playerCacheQueue.runningCount()
	for _, infoHash := range s.playerCacheQueue.claimPending(capacity) {
		go s.startPlayerCacheItem(infoHash)
	}
	return interval
}

func (s *service) loadPlayerCacheQueueSettings(ctx context.Context) (playerBootstrapSettings, error) {
	q, err := s.dao.Get()
	if err != nil {
		return playerBootstrapSettings{}, err
	}
	return s.loadPlayerBootstrapSettings(ctx, q.Torrent.WithContext(ctx).UnderlyingDB())
}

func (s *service) monitorRunningPlayerCacheItems(ctx context.Context, settings playerBootstrapSettings) {
	infoHashes := s.playerCacheQueue.runningHashes()
	if len(infoHashes) == 0 {
		return
	}
	snapshots, err := s.playerTransmissionFetchTorrents(ctx, settings, infoHashes)
	if err != nil {
		s.logPlayerCacheQueueError("monitor", err)
		return
	}
	for _, infoHash := range infoHashes {
		snapshot, ok := snapshots[infoHash]
		switch {
		case !ok:
			s.playerCacheQueue.setState(infoHash, playerCacheQueueFailed, ErrNotFound.Error())
		case snapshot.Error != 0:
			s.playerCacheQueue.setState(infoHash, playerCacheQueueFailed, snapshot.ErrorString)
		case snapshot.PercentDone >= 0.999 || snapshot.IsFinished || snapshot.Status == 6:
			s.playerCacheQueue.setState(infoHash, playerCacheQueueDone, "")
		}
	}
}

func (s *service) startPlayerCacheItem(infoHash string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	normalized, db, torrent, settings, err := s.loadPlayerTransmissionBase(ctx, infoHash)
	if err != nil {
		s.playerCacheQueue.setState(infoHash, playerCacheQueueFailed, err.Error())
		return
	}
	_ = s.playerTransmissionAutoCleanup(ctx, settings, normalized)
	snapshot, err := s.playerTransmissionEnsureTorrent(ctx, settings, normalized, torrent.MagnetURI())
	if err != nil {
		s.playerCacheQueue.setState(infoHash, playerCacheQueueFailed, err.Error())
		return
	}
	if len(snapshot.Files) == 0 {
		s.playerCacheQueue.setState(infoHash, playerCacheQueuePending, "")
		return
	}
	selected := playerTransmissionDefaultFileIndex(snapshot.Files, settings.TransmissionDownloadVideoFormats)
	if err := s.playerTransmissionSetOnlyWantedFile(ctx, settings, normalized, selected, snapshot, 0); err != nil {
		s.playerCacheQueue.setState(infoHash, playerCacheQueueFailed, err.Error())
		return
	}
	s.playerTransmissionRememberSelectedFile(normalized, selected)
	_ = s.playerTransmissionTryStart(ctx, settings, normalized)
	if snapshot.PercentDone >= 0.999 || snapshot.IsFinished {
		s.playerCacheQueue.setState(normalized, playerCacheQueueDone, "")
	}
	s.syncMediaCacheFlagsForInfoHashes(ctx, db, settings, []string{normalized}, map[string]playerTransmissionRPCTorrent{
		normalized: *snapshot,
	})
}

func (s *service) logPlayerCacheQueueError(action string, err error) {
	if s != nil && s.logger != nil && err != nil {
		s.logger.Warn("player cache queue failed", zap.String("action", action), zap.Error(err))
	}
}
