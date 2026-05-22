package media

import (
	"encoding/base64"
	"sort"
	"strings"
)

func playerTransmissionFileCompletedBytes(snapshot *playerTransmissionRPCTorrent, fileIndex int) int64 {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return 0
	}
	if fileIndex >= len(snapshot.FileStats) {
		return 0
	}
	completed := snapshot.FileStats[fileIndex].BytesCompleted
	if completed < 0 {
		completed = 0
	}
	fileLength := snapshot.Files[fileIndex].Length
	if fileLength > 0 && completed > fileLength {
		completed = fileLength
	}
	return completed
}

func playerTransmissionFileFullyCompleted(snapshot *playerTransmissionRPCTorrent, fileIndex int) bool {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return false
	}
	fileLength := snapshot.Files[fileIndex].Length
	if fileLength <= 0 {
		return false
	}
	return playerTransmissionFileCompletedBytes(snapshot, fileIndex) >= fileLength
}

func playerTransmissionContiguousBytesFromStart(
	snapshot *playerTransmissionRPCTorrent,
	fileIndex int,
) int64 {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return 0
	}
	fileLength := snapshot.Files[fileIndex].Length
	if playerTransmissionFileFullyCompleted(snapshot, fileIndex) {
		return fileLength
	}
	if fileLength <= 0 {
		return 0
	}
	completedBytes := playerTransmissionFileCompletedBytes(snapshot, fileIndex)
	if completedBytes <= 0 {
		return 0
	}
	if snapshot.PieceSize <= 0 || strings.TrimSpace(snapshot.Pieces) == "" {
		if snapshot.Sequential {
			return minInt64(completedBytes, fileLength)
		}
		return 0
	}

	pieceBits, err := base64.StdEncoding.DecodeString(snapshot.Pieces)
	if err != nil || len(pieceBits) == 0 {
		if snapshot.Sequential {
			return minInt64(completedBytes, fileLength)
		}
		return 0
	}

	fileOffset := int64(0)
	for idx := 0; idx < fileIndex; idx++ {
		fileOffset += snapshot.Files[idx].Length
	}
	fileEndGlobal := fileOffset + fileLength - 1
	if fileEndGlobal < fileOffset {
		return 0
	}

	firstPiece := int(fileOffset / snapshot.PieceSize)
	lastPiece := int(fileEndGlobal / snapshot.PieceSize)
	if firstPiece < 0 || lastPiece < firstPiece {
		return 0
	}

	contiguousBytes := int64(0)
	for piece := firstPiece; piece <= lastPiece; piece++ {
		pieceBytes := playerTransmissionPieceOverlapBytes(fileOffset, fileEndGlobal, snapshot.PieceSize, piece)
		if pieceBytes <= 0 {
			continue
		}
		if playerTransmissionHasPiece(pieceBits, piece) {
			contiguousBytes += pieceBytes
			continue
		}
		if piece == firstPiece && snapshot.Sequential {
			optimisticPrefix := minInt64(completedBytes, pieceBytes)
			if optimisticPrefix > contiguousBytes {
				contiguousBytes = optimisticPrefix
			}
			if optimisticPrefix >= pieceBytes {
				continue
			}
		}
		break
	}

	if contiguousBytes > fileLength {
		return fileLength
	}
	if contiguousBytes < 0 {
		return 0
	}
	return contiguousBytes
}

func playerTransmissionPieceOverlapBytes(
	fileOffset int64,
	fileEndGlobal int64,
	pieceSize int64,
	piece int,
) int64 {
	if fileEndGlobal < fileOffset || pieceSize <= 0 || piece < 0 {
		return 0
	}
	pieceStart := int64(piece) * pieceSize
	pieceEnd := pieceStart + pieceSize - 1
	if pieceEnd < fileOffset || pieceStart > fileEndGlobal {
		return 0
	}
	if pieceStart < fileOffset {
		pieceStart = fileOffset
	}
	if pieceEnd > fileEndGlobal {
		pieceEnd = fileEndGlobal
	}
	if pieceEnd < pieceStart {
		return 0
	}
	return pieceEnd - pieceStart + 1
}

func playerTransmissionMergeRanges(ranges []PlayerFileRange) []PlayerFileRange {
	if len(ranges) == 0 {
		return nil
	}
	normalized := make([]PlayerFileRange, 0, len(ranges))
	for _, item := range ranges {
		start := clampRatio(item.StartRatio)
		end := clampRatio(item.EndRatio)
		if end <= start {
			continue
		}
		normalized = append(normalized, PlayerFileRange{
			StartRatio: start,
			EndRatio:   end,
		})
	}
	if len(normalized) == 0 {
		return nil
	}
	sort.Slice(normalized, func(i, j int) bool {
		if normalized[i].StartRatio == normalized[j].StartRatio {
			return normalized[i].EndRatio < normalized[j].EndRatio
		}
		return normalized[i].StartRatio < normalized[j].StartRatio
	})
	merged := make([]PlayerFileRange, 0, len(normalized))
	for _, item := range normalized {
		if len(merged) == 0 {
			merged = append(merged, item)
			continue
		}
		last := &merged[len(merged)-1]
		if item.StartRatio <= last.EndRatio+1e-9 {
			if item.EndRatio > last.EndRatio {
				last.EndRatio = item.EndRatio
			}
			continue
		}
		merged = append(merged, item)
	}
	return merged
}

func playerTransmissionAvailableRanges(
	snapshot *playerTransmissionRPCTorrent,
	fileIndex int,
) []PlayerFileRange {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return nil
	}
	fileLength := snapshot.Files[fileIndex].Length
	if playerTransmissionFileFullyCompleted(snapshot, fileIndex) {
		return []PlayerFileRange{{StartRatio: 0, EndRatio: 1}}
	}
	if fileLength <= 0 {
		return nil
	}

	ranges := make([]PlayerFileRange, 0, 64)
	contiguousBytes := playerTransmissionContiguousBytesFromStart(snapshot, fileIndex)
	if contiguousBytes > 0 {
		ranges = append(ranges, PlayerFileRange{
			StartRatio: 0,
			EndRatio:   clampRatio(float64(contiguousBytes) / float64(fileLength)),
		})
	}
	if snapshot.PieceSize <= 0 || strings.TrimSpace(snapshot.Pieces) == "" {
		return playerTransmissionMergeRanges(ranges)
	}

	pieceBits, err := base64.StdEncoding.DecodeString(snapshot.Pieces)
	if err != nil || len(pieceBits) == 0 {
		return playerTransmissionMergeRanges(ranges)
	}

	fileOffset := int64(0)
	for idx := 0; idx < fileIndex; idx++ {
		fileOffset += snapshot.Files[idx].Length
	}
	fileEndGlobal := fileOffset + fileLength - 1
	if fileEndGlobal < fileOffset {
		return playerTransmissionMergeRanges(ranges)
	}

	firstPiece := int(fileOffset / snapshot.PieceSize)
	lastPiece := int(fileEndGlobal / snapshot.PieceSize)
	if firstPiece < 0 || lastPiece < firstPiece {
		return playerTransmissionMergeRanges(ranges)
	}

	currentStart := -1
	flush := func(runStart int, runEnd int) {
		if runStart < 0 || runEnd < runStart {
			return
		}
		globalStart := int64(runStart) * snapshot.PieceSize
		globalEnd := int64(runEnd+1)*snapshot.PieceSize - 1
		if globalStart < fileOffset {
			globalStart = fileOffset
		}
		if globalEnd > fileEndGlobal {
			globalEnd = fileEndGlobal
		}
		if globalEnd < globalStart {
			return
		}
		start := clampRatio(float64(globalStart-fileOffset) / float64(fileLength))
		end := clampRatio(float64(globalEnd-fileOffset+1) / float64(fileLength))
		if end <= start {
			return
		}
		ranges = append(ranges, PlayerFileRange{StartRatio: start, EndRatio: end})
	}

	for piece := firstPiece; piece <= lastPiece; piece++ {
		hasPiece := playerTransmissionHasPiece(pieceBits, piece)
		if hasPiece {
			if currentStart < 0 {
				currentStart = piece
			}
			continue
		}
		if currentStart >= 0 {
			flush(currentStart, piece-1)
			currentStart = -1
		}
	}
	if currentStart >= 0 {
		flush(currentStart, lastPiece)
	}
	return playerTransmissionMergeRanges(ranges)
}

func playerTransmissionHasPiece(pieceBits []byte, piece int) bool {
	byteIndex := piece / 8
	if byteIndex < 0 || byteIndex >= len(pieceBits) {
		return false
	}
	bitIndex := uint(7 - (piece % 8))
	return (pieceBits[byteIndex] & (1 << bitIndex)) != 0
}

func playerTransmissionRangeAvailable(
	snapshot *playerTransmissionRPCTorrent,
	fileIndex int,
	start int64,
	end int64,
) bool {
	if snapshot == nil || fileIndex < 0 || fileIndex >= len(snapshot.Files) {
		return false
	}
	if start < 0 || end < start {
		return false
	}
	fileLength := snapshot.Files[fileIndex].Length
	if fileLength > 0 && (start >= fileLength || end >= fileLength) {
		return false
	}
	if playerTransmissionFileFullyCompleted(snapshot, fileIndex) {
		return true
	}
	contiguous := playerTransmissionContiguousBytesFromStart(snapshot, fileIndex)
	if contiguous > 0 && end < contiguous {
		return true
	}
	if snapshot.PieceSize <= 0 {
		return false
	}

	pieceBits, err := base64.StdEncoding.DecodeString(snapshot.Pieces)
	if err != nil || len(pieceBits) == 0 {
		return false
	}

	fileOffset := int64(0)
	for idx := 0; idx < fileIndex; idx++ {
		fileOffset += snapshot.Files[idx].Length
	}

	globalStart := fileOffset + start
	globalEnd := fileOffset + end
	if globalStart < 0 || globalEnd < globalStart {
		return false
	}

	firstPiece := int(globalStart / snapshot.PieceSize)
	lastPiece := int(globalEnd / snapshot.PieceSize)
	for piece := firstPiece; piece <= lastPiece; piece++ {
		if !playerTransmissionHasPiece(pieceBits, piece) {
			return false
		}
	}
	return true
}
