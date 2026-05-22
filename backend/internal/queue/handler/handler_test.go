package handler

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/nigowl/bitmagnet/internal/model"
)

func TestExecPassesTimeoutContext(t *testing.T) {
	deadlineSeen := make(chan bool, 1)
	h := New("test", func(ctx context.Context, _ model.QueueJob) error {
		_, ok := ctx.Deadline()
		deadlineSeen <- ok
		return nil
	}, JobTimeout(time.Second))

	if err := Exec(context.Background(), h, model.QueueJob{}); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if ok := <-deadlineSeen; !ok {
		t.Fatal("expected handler context to include a deadline")
	}
}

func TestExecCancelsHandlerOnTimeout(t *testing.T) {
	h := New("test", func(ctx context.Context, _ model.QueueJob) error {
		<-ctx.Done()
		return ctx.Err()
	}, JobTimeout(20*time.Millisecond))

	startedAt := time.Now()
	err := Exec(context.Background(), h, model.QueueJob{})
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline exceeded error, got %v", err)
	}
	if elapsed := time.Since(startedAt); elapsed > time.Second {
		t.Fatalf("expected timeout to return promptly, elapsed %s", elapsed)
	}
}
