package adminsettings

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"github.com/nigowl/bitmagnet/internal/worker"
	"go.uber.org/zap"
)

func (s *service) GetRuntimeStatus(ctx context.Context) (RuntimeStatus, error) {
	db, err := s.db.Get()
	if err != nil {
		return RuntimeStatus{}, err
	}

	runtimeValues, err := runtimeconfig.ReadValues(ctx, db, runtimeconfig.AdminEditableKeys())
	if err != nil {
		return RuntimeStatus{}, err
	}

	merged := s.merge(runtimeValues)
	effectiveMap := settingsToRuntimeValueMap(merged)
	keys := append([]string(nil), runtimeconfig.AdminEditableKeys()...)
	sort.Strings(keys)

	settings := make([]RuntimeSettingStatus, 0, len(keys))
	for _, key := range keys {
		source := "default"
		if _, ok := runtimeValues[key]; ok {
			source = "runtime"
		}
		settings = append(settings, RuntimeSettingStatus{
			Key:    key,
			Value:  effectiveMap[key],
			Source: source,
		})
	}

	workers := make([]WorkerRuntimeStatus, 0, 4)
	if s.workerRegistry != nil {
		for _, w := range s.workerRegistry.Workers() {
			workers = append(workers, WorkerRuntimeStatus{
				Key:     w.Key(),
				Enabled: w.Enabled(),
				Started: w.Started(),
			})
		}
	}

	return RuntimeStatus{
		CheckedAt: time.Now(),
		Settings:  settings,
		Workers:   workers,
	}, nil
}

func (s *service) RestartWorker(ctx context.Context, key string) (worker.RestartReport, error) {
	if s.workerRegistry == nil {
		return worker.RestartReport{}, ErrWorkerRegistryUnavailable
	}

	workerKey := strings.TrimSpace(key)
	if workerKey == "" {
		return worker.RestartReport{}, fmt.Errorf("%w: workerKey", ErrInvalidInput)
	}

	found := false
	for _, w := range s.workerRegistry.Workers() {
		if w.Key() == workerKey {
			found = true
			break
		}
	}
	if !found {
		return worker.RestartReport{}, fmt.Errorf("%w: %s", ErrWorkerNotFound, workerKey)
	}

	restartStartedAt := time.Now()
	s.logger.Info("admin worker restart requested", zap.String("worker_key", workerKey))

	report, err := s.workerRegistry.RestartWithReport(ctx, workerKey)
	if err != nil {
		s.logger.Error(
			"admin worker restart failed",
			zap.String("worker_key", workerKey),
			zap.Error(err),
			zap.Duration("elapsed", time.Since(restartStartedAt)),
		)
		return report, err
	}
	s.logger.Info(
		"admin worker restart succeeded",
		zap.String("worker_key", workerKey),
		zap.Duration("elapsed", time.Since(restartStartedAt)),
	)
	return report, nil
}
