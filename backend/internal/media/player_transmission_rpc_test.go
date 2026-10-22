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

func TestPlayerTransmissionWantedFileIndicesOnlySelectsRequestedFile(t *testing.T) {
	wanted, unwanted := playerTransmissionWantedFileIndices(4, 2)
	if len(wanted) != 1 || wanted[0] != 2 {
		t.Fatalf("wanted = %#v", wanted)
	}
	if got, want := len(unwanted), 3; got != want {
		t.Fatalf("unwanted length = %d, want %d", got, want)
	}
	for _, index := range unwanted {
		if index == 2 {
			t.Fatalf("requested file was also marked unwanted: %#v", unwanted)
		}
	}
}
