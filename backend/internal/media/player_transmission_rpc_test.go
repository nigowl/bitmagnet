package media

import "testing"

func TestPlayerTransmissionRPCResultError(t *testing.T) {
	if err := playerTransmissionRPCResultError("torrent-get", " success "); err != nil {
		t.Fatalf("expected success, got %v", err)
	}

	err := playerTransmissionRPCResultError("torrent-get", "failure")
	if err == nil || err.Error() != `transmission torrent-get result="failure"` {
		t.Fatalf("unexpected error: %v", err)
	}
}
