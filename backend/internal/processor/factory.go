package processor

import (
	"time"

	"github.com/nigowl/bitmagnet/internal/blocking"
	"github.com/nigowl/bitmagnet/internal/classifier"
	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/database/search"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"github.com/nigowl/bitmagnet/internal/media"
	"go.uber.org/fx"
	"go.uber.org/zap"
)

type Params struct {
	fx.In
	ClassifierConfig classifier.Config
	Search           lazy.Lazy[search.Search]
	Workflow         lazy.Lazy[classifier.Runner]
	Dao              lazy.Lazy[*dao.Query]
	BlockingManager  lazy.Lazy[blocking.Manager]
	MediaService     media.Service `optional:"true"`
	Logger           *zap.SugaredLogger
}

type Result struct {
	fx.Out
	Processor lazy.Lazy[Processor]
}

func New(p Params) Result {
	return Result{
		Processor: lazy.New(func() (Processor, error) {
			s, err := p.Search.Get()
			if err != nil {
				return nil, err
			}
			d, err := p.Dao.Get()
			if err != nil {
				return nil, err
			}
			bm, err := p.BlockingManager.Get()
			if err != nil {
				return nil, err
			}
			w, err := p.Workflow.Get()
			if err != nil {
				return nil, err
			}
			return &processor{
				dao:             d,
				search:          s,
				blockingManager: bm,
				runner:          w,
				defaultWorkflow: p.ClassifierConfig.Workflow,
				mediaService:    p.MediaService,
				mediaWarmupSem:  make(chan struct{}, 1),
				mediaWarmupCfg: mediaWarmupRuntimeConfig{
					defaultTimeout: 90 * time.Second,
					cacheTTL:       10 * time.Second,
				},
				logger: p.Logger,
			}, nil
		}),
	}
}
