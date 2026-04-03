package worker

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"runtime/debug"
	"slices"
	"sort"
	"sync"
	"time"

	"github.com/nigowl/bitmagnet/internal/slice"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

type RegistryParams struct {
	fx.In
	fx.Shutdowner
	Workers    []Worker    `group:"workers"`
	Decorators []Decorator `group:"worker_decorators"`
	Logger     *zap.SugaredLogger
}

type RegistryResult struct {
	fx.Out
	Registry Registry
}

func NewRegistry(p RegistryParams) (RegistryResult, error) {
	logger := p.Logger
	if logger == nil {
		logger = zap.NewNop().Sugar()
	}

	r := &registry{
		mutex:   &sync.RWMutex{},
		workers: make(map[string]Worker),
		logger:  logger,
	}
	for _, w := range p.Workers {
		r.workers[w.Key()] = w
	}

	for _, d := range p.Decorators {
		if err := r.decorate(d.Key, d.Decorate); err != nil {
			return RegistryResult{}, err
		}
	}

	return RegistryResult{Registry: r}, nil
}

type Registry interface {
	Workers() []Worker
	Enable(names ...string) error
	Disable(names ...string) error
	EnableAll()
	DisableAll()
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
	Restart(ctx context.Context, names ...string) error
	RestartWithReport(ctx context.Context, names ...string) (RestartReport, error)
	decorate(name string, fn DecorateFunction) error
}

type RestartPhaseReport struct {
	Name      string        `json:"name"`
	Status    string        `json:"status"`
	Elapsed   time.Duration `json:"elapsed"`
	Message   string        `json:"message,omitempty"`
	StartedAt time.Time     `json:"startedAt"`
	EndedAt   time.Time     `json:"endedAt"`
}

type RestartWorkerReport struct {
	Key               string               `json:"key"`
	Enabled           bool                 `json:"enabled"`
	PreviouslyStarted bool                 `json:"previouslyStarted"`
	Started           bool                 `json:"started"`
	SkippedStart      bool                 `json:"skippedStart"`
	Phases            []RestartPhaseReport `json:"phases"`
	Elapsed           time.Duration        `json:"elapsed"`
}

type RestartReport struct {
	Workers   []RestartWorkerReport `json:"workers"`
	Elapsed   time.Duration         `json:"elapsed"`
	Requested time.Time             `json:"requestedAt"`
	Completed time.Time             `json:"completedAt"`
}

type Worker interface {
	Key() string
	Enabled() bool
	Started() bool
	_hook() fx.Hook
	setEnabled(enabled bool)
	setStarted(started bool)
	decorate(DecorateFunction) Worker
}

type DecorateFunction func(fx.Hook) fx.Hook

type Decorator struct {
	Key      string
	Decorate DecorateFunction
}

type worker struct {
	key     string
	hook    fx.Hook
	enabled bool
	started bool
}

func NewWorker(key string, hook fx.Hook) Worker {
	return &worker{
		key:  key,
		hook: hook,
	}
}

func (w *worker) Key() string {
	return w.key
}

func (w *worker) Enabled() bool {
	return w.enabled
}

func (w *worker) Started() bool {
	return w.started
}

func (w *worker) decorate(fn DecorateFunction) Worker {
	return &worker{
		key: w.key,
		hook: fn(fx.Hook{
			OnStart: w.hook.OnStart,
			OnStop:  w.hook.OnStop,
		}),
	}
}

func (w *worker) _hook() fx.Hook {
	return w.hook
}

func (w *worker) setEnabled(enabled bool) {
	w.enabled = enabled
}

func (w *worker) setStarted(started bool) {
	w.started = started
}

type registry struct {
	mutex   *sync.RWMutex
	workers map[string]Worker
	logger  *zap.SugaredLogger
}

func (r *registry) invokeHook(ctx context.Context, workerKey string, phase string, fn func(context.Context) error) (err error) {
	if fn == nil {
		return nil
	}

	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf(
				"panic in worker %s %s hook: %v\n%s",
				workerKey,
				phase,
				recovered,
				string(debug.Stack()),
			)
		}
	}()

	return fn(ctx)
}

func (r *registry) Workers() []Worker {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	keys := slices.Collect(maps.Keys(r.workers))

	sort.Strings(keys)

	return slice.Map(keys, func(s string) Worker {
		return r.workers[s]
	})
}

func (r *registry) Enable(names ...string) error {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	for _, name := range names {
		w, ok := r.workers[name]
		if !ok {
			return fmt.Errorf("worker %s not found", name)
		}

		w.setEnabled(true)
	}

	return nil
}

func (r *registry) Disable(names ...string) error {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	for _, name := range names {
		w, ok := r.workers[name]
		if !ok {
			return fmt.Errorf("worker %s not found", name)
		}

		w.setEnabled(false)
	}

	return nil
}

func (r *registry) EnableAll() {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	for _, w := range r.workers {
		w.setEnabled(true)
	}
}

func (r *registry) DisableAll() {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	for _, w := range r.workers {
		w.setEnabled(false)
	}
}

var ErrNoWorkersEnabled = errors.New("no workers enabled")

func (r *registry) Start(ctx context.Context) error {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	i := 0

	for _, w := range r.workers {
		if w.Enabled() {
			if w.Started() {
				return fmt.Errorf("worker %s already started", w.Key())
			}

			startHook := w._hook().OnStart
			if startHook != nil {
				if err := r.invokeHook(ctx, w.Key(), "start", startHook); err != nil {
					r.logger.Errorw("error starting worker", "key", w.Key(), "error", err)
					return err
				}
			}

			w.setStarted(true)
			r.logger.Infow("started worker", "key", w.Key())

			i++
		}
	}

	if i == 0 {
		return ErrNoWorkersEnabled
	}

	return nil
}

func (r *registry) Stop(ctx context.Context) error {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	for _, w := range r.workers {
		if w.Started() {
			stopHook := w._hook().OnStop
			if stopHook != nil {
				if err := r.invokeHook(ctx, w.Key(), "stop", stopHook); err != nil {
					r.logger.Errorw("error stopping worker", "key", w.Key(), "error", err)
					continue
				}
			}

			w.setStarted(false)
			r.logger.Infow("stopped worker", "key", w.Key())
		}
	}

	return nil
}

func (r *registry) Restart(ctx context.Context, names ...string) error {
	_, err := r.RestartWithReport(ctx, names...)
	return err
}

func (r *registry) RestartWithReport(ctx context.Context, names ...string) (RestartReport, error) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	report := RestartReport{
		Workers:   make([]RestartWorkerReport, 0, len(names)),
		Requested: time.Now(),
	}

	if len(names) == 0 {
		report.Completed = time.Now()
		report.Elapsed = report.Completed.Sub(report.Requested)
		return report, nil
	}

	restartStartedAt := time.Now()
	r.logger.Infow("worker restart requested", "workers", names, "count", len(names))

	for _, name := range names {
		w, ok := r.workers[name]
		if !ok {
			return report, fmt.Errorf("worker %s not found", name)
		}

		workerReport := RestartWorkerReport{
			Key:               w.Key(),
			Enabled:           w.Enabled(),
			PreviouslyStarted: w.Started(),
			Started:           w.Started(),
			Phases:            make([]RestartPhaseReport, 0, 2),
		}
		workerRestartStartedAt := time.Now()

		r.logger.Infow(
			"restarting worker",
			"key", w.Key(),
			"enabled", w.Enabled(),
			"started", w.Started(),
		)

		if w.Started() {
			stopStartedAt := time.Now()
			stopHook := w._hook().OnStop
			if stopHook != nil {
				if err := r.invokeHook(ctx, w.Key(), "stop", stopHook); err != nil {
					workerReport.Phases = append(workerReport.Phases, RestartPhaseReport{
						Name:      "stop",
						Status:    "failed",
						Elapsed:   time.Since(stopStartedAt),
						Message:   err.Error(),
						StartedAt: stopStartedAt,
						EndedAt:   time.Now(),
					})
					workerReport.Elapsed = time.Since(workerRestartStartedAt)
					report.Workers = append(report.Workers, workerReport)
					r.logger.Errorw("error stopping worker", "key", w.Key(), "error", err)
					return report, err
				}
				workerReport.Phases = append(workerReport.Phases, RestartPhaseReport{
					Name:      "stop",
					Status:    "ok",
					Elapsed:   time.Since(stopStartedAt),
					StartedAt: stopStartedAt,
					EndedAt:   time.Now(),
				})
			}
			w.setStarted(false)
			r.logger.Infow("worker stopped for restart", "key", w.Key(), "elapsed", time.Since(stopStartedAt))
			workerReport.Started = false
		}

		if !w.Enabled() {
			r.logger.Infow("restarted worker skipped start: disabled", "key", w.Key())
			workerReport.SkippedStart = true
			workerReport.Phases = append(workerReport.Phases, RestartPhaseReport{
				Name:      "start",
				Status:    "skipped",
				Message:   "worker disabled",
				Elapsed:   0,
				StartedAt: time.Now(),
				EndedAt:   time.Now(),
			})
			workerReport.Elapsed = time.Since(workerRestartStartedAt)
			report.Workers = append(report.Workers, workerReport)
			continue
		}

		startStartedAt := time.Now()
		startHook := w._hook().OnStart
		if startHook != nil {
			if err := r.invokeHook(ctx, w.Key(), "start", startHook); err != nil {
				workerReport.Phases = append(workerReport.Phases, RestartPhaseReport{
					Name:      "start",
					Status:    "failed",
					Elapsed:   time.Since(startStartedAt),
					Message:   err.Error(),
					StartedAt: startStartedAt,
					EndedAt:   time.Now(),
				})
				workerReport.Elapsed = time.Since(workerRestartStartedAt)
				report.Workers = append(report.Workers, workerReport)
				r.logger.Errorw("error starting worker", "key", w.Key(), "error", err)
				return report, err
			}
			workerReport.Phases = append(workerReport.Phases, RestartPhaseReport{
				Name:      "start",
				Status:    "ok",
				Elapsed:   time.Since(startStartedAt),
				StartedAt: startStartedAt,
				EndedAt:   time.Now(),
			})
		}

		w.setStarted(true)
		workerReport.Started = true
		workerReport.Elapsed = time.Since(workerRestartStartedAt)
		report.Workers = append(report.Workers, workerReport)
		r.logger.Infow("worker restarted", "key", w.Key(), "elapsed", time.Since(startStartedAt))
	}

	r.logger.Infow("worker restart completed", "workers", names, "elapsed", time.Since(restartStartedAt))
	report.Completed = time.Now()
	report.Elapsed = report.Completed.Sub(report.Requested)

	return report, nil
}

func (r *registry) decorate(name string, fn DecorateFunction) error {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	if w, ok := r.workers[name]; ok {
		r.workers[name] = w.decorate(fn)
		return nil
	}

	return fmt.Errorf("worker %s not found", name)
}
