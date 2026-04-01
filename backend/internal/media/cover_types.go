package media

import (
	"errors"
	"fmt"
	"strings"
)

var ErrCoverNotFound = errors.New("cover not found")

type coverKind string

const (
	coverKindPoster   coverKind = "poster"
	coverKindBackdrop coverKind = "backdrop"
)

type coverSize string

const (
	coverSizeSM coverSize = "sm"
	coverSizeMD coverSize = "md"
	coverSizeLG coverSize = "lg"
	coverSizeXL coverSize = "xl"
)

type coverVariant struct {
	size  coverSize
	width int
}

var coverVariants = map[coverKind][]coverVariant{
	coverKindPoster: {
		{size: coverSizeSM, width: 240},
		{size: coverSizeMD, width: 360},
		{size: coverSizeLG, width: 500},
		{size: coverSizeXL, width: 780},
	},
	coverKindBackdrop: {
		{size: coverSizeSM, width: 640},
		{size: coverSizeMD, width: 960},
		{size: coverSizeLG, width: 1280},
		{size: coverSizeXL, width: 1920},
	},
}

func parseCoverKind(raw string) (coverKind, error) {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case string(coverKindPoster):
		return coverKindPoster, nil
	case string(coverKindBackdrop):
		return coverKindBackdrop, nil
	default:
		return "", fmt.Errorf("invalid cover kind: %q", raw)
	}
}

func parseCoverSize(raw string) (coverSize, error) {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case string(coverSizeSM):
		return coverSizeSM, nil
	case string(coverSizeMD):
		return coverSizeMD, nil
	case string(coverSizeLG):
		return coverSizeLG, nil
	case string(coverSizeXL):
		return coverSizeXL, nil
	default:
		return "", fmt.Errorf("invalid cover size: %q", raw)
	}
}
