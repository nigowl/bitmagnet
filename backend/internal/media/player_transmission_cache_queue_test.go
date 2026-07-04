package media

import "testing"

func TestPlayerTransmissionCacheQueue(t *testing.T) {
	queue := newPlayerTransmissionCacheQueue()

	first := queue.enqueue("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	if first.state != playerCacheQueuePending || first.position != 1 {
		t.Fatalf("first enqueue = %+v", first)
	}
	if dup := queue.enqueue("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"); dup.position != 1 {
		t.Fatalf("duplicate enqueue = %+v", dup)
	}

	claimed := queue.claimPending(1)
	if len(claimed) != 1 || claimed[0] != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" {
		t.Fatalf("claimed = %#v", claimed)
	}
	if running := queue.snapshot(claimed[0]); running.state != playerCacheQueueRunning || running.position != 0 {
		t.Fatalf("running snapshot = %+v", running)
	}

	queue.setState(claimed[0], playerCacheQueueFailed, "boom")
	retry := queue.enqueue(claimed[0])
	if retry.state != playerCacheQueuePending || retry.position != 1 {
		t.Fatalf("retry enqueue = %+v", retry)
	}

	queue.setState(claimed[0], playerCacheQueueFailed, ErrPlayerFileNotFound.Error())
	queue.retryFailures(ErrPlayerFileNotFound.Error())
	if snapshot := queue.snapshot(claimed[0]); snapshot.state != playerCacheQueuePending || snapshot.err != "" {
		t.Fatalf("file-list retry snapshot = %+v", snapshot)
	}

	queue.setState(claimed[0], playerCacheQueueCanceled, "")
	requeued := queue.enqueue(claimed[0])
	if requeued.state != playerCacheQueuePending || requeued.position != 1 {
		t.Fatalf("requeued enqueue = %+v", requeued)
	}

	if !queue.remove(claimed[0]) {
		t.Fatal("expected remove to succeed")
	}
	queue.setState(claimed[0], playerCacheQueueDone, "")
	if snapshot := queue.snapshot(claimed[0]); snapshot.state != "" {
		t.Fatalf("removed snapshot = %+v", snapshot)
	}
}
