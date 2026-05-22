package media

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

func playerTransmissionPrebufferRangeHeader(
	header string,
	total int64,
	startBytes int64,
	durationSeconds float64,
	prebufferSeconds int,
) string {
	if total <= 0 || prebufferSeconds <= 0 {
		return header
	}
	start := startBytes
	trimmed := strings.TrimSpace(header)
	if strings.HasPrefix(strings.ToLower(trimmed), "bytes=") {
		spec := strings.TrimSpace(trimmed[6:])
		if comma := strings.Index(spec, ","); comma >= 0 {
			spec = strings.TrimSpace(spec[:comma])
		}
		parts := strings.SplitN(spec, "-", 2)
		if len(parts) != 2 {
			return header
		}
		left := strings.TrimSpace(parts[0])
		right := strings.TrimSpace(parts[1])
		if left == "" {
			return header
		}
		parsedStart, err := strconv.ParseInt(left, 10, 64)
		if err != nil || parsedStart < 0 {
			return header
		}
		start = parsedStart
		if right != "" {
			return header
		}
	}
	if start < 0 {
		start = 0
	}
	if start >= total {
		start = total - 1
	}

	windowBytes := playerTransmissionPrebufferWindowBytes(total, durationSeconds, prebufferSeconds)
	if windowBytes <= 0 {
		return header
	}
	end := start + windowBytes - 1
	if end >= total {
		end = total - 1
	}
	return fmt.Sprintf("bytes=%d-%d", start, end)
}

func playerTransmissionPrebufferWindowBytes(total int64, durationSeconds float64, prebufferSeconds int) int64 {
	if total <= 0 || prebufferSeconds <= 0 {
		return 0
	}
	window := defaultPlayerStreamProbeChunkBytes
	if durationSeconds > 0 && !math.IsNaN(durationSeconds) && !math.IsInf(durationSeconds, 0) {
		bytesPerSecond := float64(total) / durationSeconds
		estimated := int64(math.Ceil(bytesPerSecond * float64(prebufferSeconds) * 1.35))
		if estimated > window {
			window = estimated
		}
	} else if prebufferSeconds > 30 {
		steps := int64((prebufferSeconds + 29) / 30)
		if estimated := defaultPlayerStreamProbeChunkBytes * steps; estimated > window {
			window = estimated
		}
	}
	if !(durationSeconds > 0 && !math.IsNaN(durationSeconds) && !math.IsInf(durationSeconds, 0)) && window > defaultPlayerStreamMaxRangeBytes {
		window = defaultPlayerStreamMaxRangeBytes
	}
	if window > total {
		window = total
	}
	if window < 1 {
		return 1
	}
	return window
}

func parsePlayerByteRange(header string, total int64) (int64, int64, bool, error) {
	return parsePlayerByteRangeWithMax(header, total, defaultPlayerStreamMaxRangeBytes)
}

func parsePlayerByteRangeWithMax(header string, total int64, maxRangeBytes int64) (int64, int64, bool, error) {
	if total <= 0 {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	if maxRangeBytes <= 0 {
		maxRangeBytes = defaultPlayerStreamMaxRangeBytes
	}

	if strings.TrimSpace(header) == "" {
		end := total - 1
		limit := defaultPlayerStreamProbeChunkBytes - 1
		if end > limit {
			end = limit
		}
		return 0, end, true, nil
	}

	trimmed := strings.TrimSpace(header)
	if !strings.HasPrefix(strings.ToLower(trimmed), "bytes=") {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	spec := strings.TrimSpace(trimmed[6:])
	if spec == "" {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	if comma := strings.Index(spec, ","); comma >= 0 {
		spec = strings.TrimSpace(spec[:comma])
	}

	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 {
		return 0, 0, false, ErrPlayerInvalidRange
	}

	left := strings.TrimSpace(parts[0])
	right := strings.TrimSpace(parts[1])

	var start int64
	var end int64
	if left == "" {
		suffixLen, err := strconv.ParseInt(right, 10, 64)
		if err != nil || suffixLen <= 0 {
			return 0, 0, false, ErrPlayerInvalidRange
		}
		if suffixLen >= total {
			start = 0
		} else {
			start = total - suffixLen
		}
		end = total - 1
		return start, end, true, nil
	}

	parsedStart, err := strconv.ParseInt(left, 10, 64)
	if err != nil || parsedStart < 0 || parsedStart >= total {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	start = parsedStart

	if right == "" {
		end = total - 1
		limit := start + defaultPlayerStreamProbeChunkBytes - 1
		if end > limit {
			end = limit
		}
	} else {
		parsedEnd, endErr := strconv.ParseInt(right, 10, 64)
		if endErr != nil || parsedEnd < start {
			return 0, 0, false, ErrPlayerInvalidRange
		}
		if parsedEnd >= total {
			end = total - 1
		} else {
			end = parsedEnd
		}
	}
	maxEnd := start + maxRangeBytes - 1
	if end > maxEnd {
		end = maxEnd
	}

	return start, end, true, nil
}

func parsePlayerByteRangeForCompletedFile(header string, total int64) (int64, int64, bool, error) {
	if total <= 0 {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	if strings.TrimSpace(header) == "" {
		return 0, total - 1, false, nil
	}

	trimmed := strings.TrimSpace(header)
	if !strings.HasPrefix(strings.ToLower(trimmed), "bytes=") {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	spec := strings.TrimSpace(trimmed[6:])
	if spec == "" {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	if comma := strings.Index(spec, ","); comma >= 0 {
		spec = strings.TrimSpace(spec[:comma])
	}

	parts := strings.SplitN(spec, "-", 2)
	if len(parts) != 2 {
		return 0, 0, false, ErrPlayerInvalidRange
	}

	left := strings.TrimSpace(parts[0])
	right := strings.TrimSpace(parts[1])

	var start int64
	var end int64
	if left == "" {
		suffixLen, err := strconv.ParseInt(right, 10, 64)
		if err != nil || suffixLen <= 0 {
			return 0, 0, false, ErrPlayerInvalidRange
		}
		if suffixLen >= total {
			start = 0
		} else {
			start = total - suffixLen
		}
		end = total - 1
		return start, end, true, nil
	}

	parsedStart, err := strconv.ParseInt(left, 10, 64)
	if err != nil || parsedStart < 0 || parsedStart >= total {
		return 0, 0, false, ErrPlayerInvalidRange
	}
	start = parsedStart

	if right == "" {
		end = total - 1
	} else {
		parsedEnd, endErr := strconv.ParseInt(right, 10, 64)
		if endErr != nil || parsedEnd < start {
			return 0, 0, false, ErrPlayerInvalidRange
		}
		if parsedEnd >= total {
			end = total - 1
		} else {
			end = parsedEnd
		}
	}
	return start, end, true, nil
}
