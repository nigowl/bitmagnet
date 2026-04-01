package logging

import (
	"context"
	"os"

	"go.uber.org/fx"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type Params struct {
	fx.In
	Config Config
}

type Result struct {
	fx.Out
	Logger          *zap.Logger
	Sugar           *zap.SugaredLogger
	LogBuffer       *LogBuffer
	LevelController LevelController
	AppHook         fx.Hook `group:"app_hooks"`
}

func New(params Params) Result {
	var appHook fx.Hook

	opts := []zap.Option{
		zap.AddStacktrace(zapcore.ErrorLevel),
		zap.AddCaller(),
	}
	if params.Config.Development {
		opts = append(opts, zap.Development())
	}

	levelController, atomicLevel, levelErr := NewLevelController(params.Config.Level)
	if levelErr != nil {
		levelController, atomicLevel, _ = NewLevelController(NewDefaultConfig().Level)
	}
	buffer := NewLogBuffer(defaultBufferLines)

	core := zapcore.NewTee(
		zapcore.NewCore(
			newEncoder(params.Config),
			zapcore.AddSync(os.Stdout),
			atomicLevel,
		),
		zapcore.NewCore(
			newEncoder(params.Config),
			buffer,
			atomicLevel,
		),
	)

	if params.Config.FileRotator.Enabled {
		fileLevel := levelToZapLevel(params.Config.FileRotator.Level)
		rotators := make([]*fileRotator, 0, len(logCategories(params.Config.FileRotator)))

		for _, category := range logCategories(params.Config.FileRotator) {
			cfg := params.Config.FileRotator
			cfg.BaseName = category.BaseName

			rotator := newFileRotator(cfg)
			rotators = append(rotators, rotator)

			categoryKey := category.Key
			fileCore := newFilteredCore(
				zapcore.NewCore(
					zapcore.NewJSONEncoder(jsonEncoderConfig),
					rotator,
					fileLevel,
				),
				func(entry zapcore.Entry) bool {
					return loggerCategory(entry.LoggerName) == categoryKey
				},
			)

			core = zapcore.NewTee(core, fileCore)
		}

		appHook = fx.Hook{
			OnStop: func(context.Context) error {
				var firstErr error
				for _, rotator := range rotators {
					if err := rotator.Close(); err != nil && firstErr == nil {
						firstErr = err
					}
				}
				return firstErr
			},
		}
	}

	l := zap.New(core, opts...)

	return Result{
		Logger:          l,
		Sugar:           l.Sugar(),
		LogBuffer:       buffer,
		LevelController: levelController,
		AppHook:         appHook,
	}
}

func newEncoder(config Config) zapcore.Encoder {
	if config.JSON {
		return zapcore.NewJSONEncoder(jsonEncoderConfig)
	}

	return zapcore.NewConsoleEncoder(consoleEncoderConfig)
}
