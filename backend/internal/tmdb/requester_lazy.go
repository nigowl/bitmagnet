package tmdb

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/nigowl/bitmagnet/internal/concurrency"
	"go.uber.org/zap"
	"golang.org/x/sync/semaphore"
	"golang.org/x/time/rate"
)

// requesterLazy defers instantiation of the requester (and possible failure) until the first request is made,
// avoiding failure when the TMDB client is not needed.
type requesterLazy struct {
	mutex     sync.Mutex
	config    Config
	logger    *zap.SugaredLogger
	err       error
	requester Requester
}

func (r *requesterLazy) Request(
	ctx context.Context,
	path string,
	queryParams map[string]string,
	result interface{},
) (*resty.Response, error) {
	requester, err := r.getRequester(ctx)
	if err != nil {
		return nil, err
	}

	return requester.Request(ctx, path, queryParams, result)
}

func (r *requesterLazy) getRequester(ctx context.Context) (Requester, error) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	if r.requester != nil {
		return r.requester, nil
	}
	if r.err != nil {
		return nil, r.err
	}

	requester, err := newRequester(ctx, r.config, r.logger)
	if err != nil {
		if isPermanentRequesterInitError(err) {
			r.err = err
		}
		return nil, err
	}

	r.requester = requester

	return requester, nil
}

var errTmdbDisabled = errors.New("TMDB is disabled")

func isPermanentRequesterInitError(err error) bool {
	return errors.Is(err, errTmdbDisabled) || errors.Is(err, ErrUnauthorized)
}

func newRequester(ctx context.Context, config Config, logger *zap.SugaredLogger) (Requester, error) {
	if !config.Enabled {
		return nil, errTmdbDisabled
	}

	if config.APIKey == defaultTmdbAPIKey {
		logger.Warnln(
			"you are using the default TMDB api key; TMDB requests will be limited to 1 per second; " +
				"to remove this warning please configure a personal TMDB api key",
		)

		config.RateLimit = time.Second
		config.RateLimitBurst = 8
	}

	r := requesterLogger{
		requester: requesterFailFast{
			requester: requesterSemaphore{
				requester: requesterLimiter{
					requester: requester{
						resty: resty.New().
							SetBaseURL(config.BaseURL).
							SetQueryParam("api_key", config.APIKey).
							SetRetryCount(3).
							SetRetryWaitTime(2 * time.Second).
							SetRetryMaxWaitTime(20 * time.Second).
							SetTimeout(10 * time.Second).
							EnableTrace().
							SetLogger(logger),
					},
					limiter: rate.NewLimiter(rate.Every(config.RateLimit), config.RateLimitBurst),
				},
				semaphore: semaphore.NewWeighted(2),
			},
			isUnauthorized: &concurrency.AtomicValue[bool]{},
		},
		logger: logger,
	}

	err := client{r}.ValidateAPIKey(ctx)
	if errors.Is(err, ErrUnauthorized) {
		if config.APIKey == defaultTmdbAPIKey {
			return r, fmt.Errorf("default api key is invalid: %w", err)
		}

		logger.Errorw("invalid api key, falling back to default", "error", err)

		config.APIKey = defaultTmdbAPIKey

		return newRequester(ctx, config, logger)
	}

	return r, err
}
