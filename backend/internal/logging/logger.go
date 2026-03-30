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
	Logger    *zap.Logger
	Sugar     *zap.SugaredLogger
	LogBuffer *LogBuffer
	AppHook   fx.Hook `group:"app_hooks"`
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

	logLevel := levelToZapLevel(params.Config.Level)
	buffer := NewLogBuffer(defaultBufferLines)

	core := zapcore.NewTee(
		zapcore.NewCore(
			newEncoder(params.Config),
			zapcore.AddSync(os.Stdout),
			logLevel,
		),
		zapcore.NewCore(
			newEncoder(params.Config),
			buffer,
			logLevel,
		),
	)

	if params.Config.FileRotator.Enabled {
		fWriteSyncer := newFileRotator(params.Config.FileRotator)
		core = zapcore.NewTee(
			core,
			zapcore.NewCore(
				zapcore.NewJSONEncoder(jsonEncoderConfig),
				fWriteSyncer,
				levelToZapLevel(params.Config.FileRotator.Level),
			),
		)
		appHook = fx.Hook{
			OnStop: func(context.Context) error {
				return fWriteSyncer.Close()
			},
		}
	}

	l := zap.New(core, opts...)

	return Result{
		Logger:    l,
		Sugar:     l.Sugar(),
		LogBuffer: buffer,
		AppHook:   appHook,
	}
}

func newEncoder(config Config) zapcore.Encoder {
	if config.JSON {
		return zapcore.NewJSONEncoder(jsonEncoderConfig)
	}

	return zapcore.NewConsoleEncoder(consoleEncoderConfig)
}
