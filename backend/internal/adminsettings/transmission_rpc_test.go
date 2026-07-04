package adminsettings

import "testing"

func TestTransmissionRPCResultError(t *testing.T) {
	if err := transmissionRPCResultError("session-get", " success "); err != nil {
		t.Fatalf("expected success, got %v", err)
	}

	err := transmissionRPCResultError("session-get", "denied")
	if err == nil || err.Error() != `transmission session-get result="denied"` {
		t.Fatalf("unexpected error: %v", err)
	}
}
