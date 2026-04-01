package logging

import (
	"fmt"

	"go.uber.org/zap"
)

type LevelController interface {
	Level() string
	SetLevel(level string) error
}

type levelController struct {
	atomic zap.AtomicLevel
}

func NewLevelController(initial string) (LevelController, zap.AtomicLevel, error) {
	normalized, err := NormalizeLevel(initial)
	if err != nil {
		return nil, zap.AtomicLevel{}, err
	}

	parsed, err := parseZapLevel(normalized)
	if err != nil {
		return nil, zap.AtomicLevel{}, err
	}

	atomicLevel := zap.NewAtomicLevelAt(parsed)
	return &levelController{atomic: atomicLevel}, atomicLevel, nil
}

func (c *levelController) Level() string {
	return c.atomic.Level().String()
}

func (c *levelController) SetLevel(level string) error {
	parsed, err := parseZapLevel(level)
	if err != nil {
		return fmt.Errorf("set log level: %w", err)
	}
	c.atomic.SetLevel(parsed)
	return nil
}
