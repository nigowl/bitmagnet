package media

import (
	"encoding/base64"
	"math"
	"testing"
)

func TestPlayerTransmissionPrebufferWindowBytesUsesDurationEstimate(t *testing.T) {
	got := playerTransmissionPrebufferWindowBytes(20*1024*1024*1024, 10800, 60)
	const want int64 = 161061274
	if got != want {
		t.Fatalf("expected high bitrate window to follow duration estimate, got=%d want=%d", got, want)
	}
}

func TestParsePlayerByteRangeWithMaxAllowsTranscodePrebufferWindow(t *testing.T) {
	const maxRange int64 = 160 * 1024 * 1024
	_, end, _, err := parsePlayerByteRangeWithMax("bytes=1024-500000000", 500*1024*1024, maxRange)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := int64(1024) + maxRange - 1; end != want {
		t.Fatalf("expected custom max range end, got=%d want=%d", end, want)
	}
}

func TestPlayerTransmissionPrebufferRangeHeaderBuildsClosedWindow(t *testing.T) {
	got := playerTransmissionPrebufferRangeHeader("", 100000000, 0, 3600, 60)
	if got == "" || got == "bytes=0-" {
		t.Fatalf("expected explicit range header, got=%q", got)
	}
	if got != "bytes=0-16777215" {
		t.Fatalf("expected bounded probe window for small bitrate stream, got=%q", got)
	}
}

func TestPlayerTransmissionContiguousBytesFromStartBoundaryPieceFallback(t *testing.T) {
	snapshot := &playerTransmissionRPCTorrent{
		PieceSize:   1024,
		Pieces:      buildPieceBits(1, 2),
		Sequential:  true,
		Files:       []playerTransmissionRPCFile{{Length: 200}, {Length: 5000}},
		FileStats:   []playerTransmissionRPCFileStat{{BytesCompleted: 0}, {BytesCompleted: 3200}},
		PercentDone: 0.4,
	}

	got := playerTransmissionContiguousBytesFromStart(snapshot, 1)
	const want int64 = 2872 // 824 (piece 0 overlap) + 1024 + 1024
	if got != want {
		t.Fatalf("unexpected contiguous bytes, got=%d want=%d", got, want)
	}
}

func TestPlayerTransmissionContiguousBytesFromStartBoundaryPieceNoFallbackWhenNotSequential(t *testing.T) {
	snapshot := &playerTransmissionRPCTorrent{
		PieceSize:  1024,
		Pieces:     buildPieceBits(1, 2),
		Sequential: false,
		Files:      []playerTransmissionRPCFile{{Length: 200}, {Length: 5000}},
		FileStats:  []playerTransmissionRPCFileStat{{BytesCompleted: 0}, {BytesCompleted: 3200}},
	}

	got := playerTransmissionContiguousBytesFromStart(snapshot, 1)
	if got != 0 {
		t.Fatalf("expected contiguous bytes to stay 0 when not sequential, got=%d", got)
	}
}

func TestPlayerTransmissionRangeAvailableUsesContiguousFallback(t *testing.T) {
	snapshot := &playerTransmissionRPCTorrent{
		PieceSize:  1024,
		Pieces:     buildPieceBits(1, 2),
		Sequential: true,
		Files:      []playerTransmissionRPCFile{{Length: 200}, {Length: 5000}},
		FileStats:  []playerTransmissionRPCFileStat{{BytesCompleted: 0}, {BytesCompleted: 3200}},
	}

	if !playerTransmissionRangeAvailable(snapshot, 1, 0, 1023) {
		t.Fatalf("expected initial range to be available with contiguous fallback")
	}
}

func TestPlayerTransmissionAvailableRangesInjectsContiguousPrefix(t *testing.T) {
	snapshot := &playerTransmissionRPCTorrent{
		PieceSize:  1024,
		Pieces:     buildPieceBits(1, 2),
		Sequential: true,
		Files:      []playerTransmissionRPCFile{{Length: 200}, {Length: 5000}},
		FileStats:  []playerTransmissionRPCFileStat{{BytesCompleted: 0}, {BytesCompleted: 3200}},
	}

	ranges := playerTransmissionAvailableRanges(snapshot, 1)
	if len(ranges) != 1 {
		t.Fatalf("expected one merged range, got=%d", len(ranges))
	}
	if ranges[0].StartRatio != 0 {
		t.Fatalf("expected range to start at 0, got=%f", ranges[0].StartRatio)
	}
	const want = 2872.0 / 5000.0
	if math.Abs(ranges[0].EndRatio-want) > 1e-9 {
		t.Fatalf("unexpected end ratio, got=%f want=%f", ranges[0].EndRatio, want)
	}
}

func TestPlayerTransmissionAvailableRangesFallsBackToSequentialCompletedBytes(t *testing.T) {
	snapshot := &playerTransmissionRPCTorrent{
		PieceSize:  0,
		Pieces:     "",
		Sequential: true,
		Files:      []playerTransmissionRPCFile{{Length: 5000}},
		FileStats:  []playerTransmissionRPCFileStat{{BytesCompleted: 2000}},
	}

	ranges := playerTransmissionAvailableRanges(snapshot, 0)
	if len(ranges) != 1 {
		t.Fatalf("expected one fallback range, got=%d", len(ranges))
	}
	if ranges[0].StartRatio != 0 {
		t.Fatalf("expected fallback range to start at 0, got=%f", ranges[0].StartRatio)
	}
	const want = 2000.0 / 5000.0
	if math.Abs(ranges[0].EndRatio-want) > 1e-9 {
		t.Fatalf("unexpected fallback end ratio, got=%f want=%f", ranges[0].EndRatio, want)
	}
}

func buildPieceBits(pieces ...int) string {
	maxPiece := -1
	for _, piece := range pieces {
		if piece > maxPiece {
			maxPiece = piece
		}
	}
	if maxPiece < 0 {
		return ""
	}
	bits := make([]byte, (maxPiece/8)+1)
	for _, piece := range pieces {
		if piece < 0 {
			continue
		}
		byteIndex := piece / 8
		bitIndex := uint(7 - (piece % 8))
		bits[byteIndex] |= 1 << bitIndex
	}
	return base64.StdEncoding.EncodeToString(bits)
}
