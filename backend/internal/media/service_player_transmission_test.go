package media

import (
	"encoding/base64"
	"math"
	"os"
	"path/filepath"
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

func TestPlayerTransmissionAvailableRangesDoesNotTruncateFragmentedLargeFiles(t *testing.T) {
	pieces := make([]int, 0, 1301)
	for piece := 0; piece <= 2600; piece += 2 {
		pieces = append(pieces, piece)
	}
	snapshot := &playerTransmissionRPCTorrent{
		PieceSize:  1024,
		Pieces:     buildPieceBits(pieces...),
		Sequential: false,
		Files:      []playerTransmissionRPCFile{{Length: 2602 * 1024}},
		FileStats:  []playerTransmissionRPCFileStat{{BytesCompleted: int64(len(pieces) * 1024)}},
	}

	ranges := playerTransmissionAvailableRanges(snapshot, 0)
	if len(ranges) != len(pieces) {
		t.Fatalf("expected every completed run to be represented, got=%d want=%d", len(ranges), len(pieces))
	}
	availableRatio := 0.0
	for _, item := range ranges {
		availableRatio += item.EndRatio - item.StartRatio
	}
	want := float64(len(pieces)) / 2602.0
	if math.Abs(availableRatio-want) > 1e-9 {
		t.Fatalf("unexpected available ratio, got=%f want=%f", availableRatio, want)
	}
}

func TestPlayerTransmissionResolveFilePathFindsIncompletePartFile(t *testing.T) {
	dir := t.TempDir()
	relative := filepath.Join("Movie Folder", "movie.mp4")
	partPath := filepath.Join(dir, "incomplete", relative+".part")
	if err := os.MkdirAll(filepath.Dir(partPath), 0o755); err != nil {
		t.Fatalf("mkdir part dir: %v", err)
	}
	if err := os.WriteFile(partPath, []byte("partial"), 0o644); err != nil {
		t.Fatalf("write part file: %v", err)
	}

	got, err := playerTransmissionResolveFilePath("/downloads", filepath.ToSlash(relative), dir)
	if err != nil {
		t.Fatalf("expected .part path to resolve: %v", err)
	}
	if got != partPath {
		t.Fatalf("unexpected resolved path, got=%q want=%q", got, partPath)
	}
}

func TestPlayerTransmissionSequentialStartPieceUsesSelectedFileOffset(t *testing.T) {
	snapshot := &playerTransmissionRPCTorrent{
		PieceSize: 1024,
		Files: []playerTransmissionRPCFile{
			{Length: 200},
			{Length: 5000},
		},
	}

	got, ok := playerTransmissionSequentialStartPiece(snapshot, 1, 1800)
	if !ok {
		t.Fatalf("expected sequential start piece")
	}
	if got != 1 {
		t.Fatalf("unexpected start piece, got=%d want=1", got)
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
