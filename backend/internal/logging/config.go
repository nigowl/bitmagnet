package logging

import (
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap/zapcore"
)

type Config struct {
	Level       string
	Development bool
	JSON        bool
	FileRotator FileRotatorConfig
}

type FileRotatorConfig struct {
	Enabled    bool
	Level      string
	Path       string
	BaseName   string
	MaxAge     time.Duration
	MaxSize    int
	MaxBackups int
	BufferSize int
}

func NewDefaultConfig() Config {
	return Config{
		Level:       "info",
		Development: false,
		JSON:        false,
		FileRotator: FileRotatorConfig{
			Enabled:    true,
			Level:      "info",
			Path:       "logs",
			BaseName:   "bitmagnet",
			MaxAge:     time.Minute * 60,
			MaxSize:    8 * 1024 * 1024,
			BufferSize: 1_000,
			MaxBackups: 5,
		},
	}
}

const (
	timestamp  = "timestamp"
	severity   = "severity"
	logger     = "logger"
	caller     = "caller"
	message    = "message"
	stacktrace = "stacktrace"

	levelDebug     = "DEBUG"
	levelInfo      = "INFO"
	levelWarning   = "WARNING"
	levelError     = "ERROR"
	levelCritical  = "CRITICAL"
	levelAlert     = "ALERT"
	levelEmergency = "EMERGENCY"
)

var jsonEncoderConfig = zapcore.EncoderConfig{
	TimeKey:        timestamp,
	LevelKey:       severity,
	NameKey:        logger,
	CallerKey:      caller,
	MessageKey:     message,
	StacktraceKey:  stacktrace,
	LineEnding:     zapcore.DefaultLineEnding,
	EncodeLevel:    levelEncoder(),
	EncodeTime:     timeEncoder(),
	EncodeDuration: zapcore.SecondsDurationEncoder,
	EncodeCaller:   zapcore.ShortCallerEncoder,
}

var consoleEncoderConfig = zapcore.EncoderConfig{
	TimeKey:        "",
	LevelKey:       "L",
	NameKey:        "N",
	CallerKey:      "C",
	FunctionKey:    zapcore.OmitKey,
	MessageKey:     "M",
	StacktraceKey:  "S",
	LineEnding:     zapcore.DefaultLineEnding,
	EncodeLevel:    zapcore.CapitalColorLevelEncoder,
	EncodeTime:     zapcore.ISO8601TimeEncoder,
	EncodeDuration: zapcore.StringDurationEncoder,
	EncodeCaller:   zapcore.ShortCallerEncoder,
}

// levelToZapLevel converts the given string to the appropriate zap level
// value.
func levelToZapLevel(s string) zapcore.Level {
	level, err := parseZapLevel(s)
	if err != nil {
		return zapcore.WarnLevel
	}
	return level
}

func parseZapLevel(s string) (zapcore.Level, error) {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case levelDebug:
		return zapcore.DebugLevel, nil
	case levelInfo:
		return zapcore.InfoLevel, nil
	case levelWarning:
		return zapcore.WarnLevel, nil
	case levelError:
		return zapcore.ErrorLevel, nil
	case levelCritical:
		return zapcore.DPanicLevel, nil
	case levelAlert:
		return zapcore.PanicLevel, nil
	case levelEmergency:
		return zapcore.FatalLevel, nil
	}
	return zapcore.WarnLevel, fmt.Errorf("unsupported log level: %q", s)
}

func NormalizeLevel(s string) (string, error) {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case levelDebug:
		return levelDebug, nil
	case levelInfo:
		return levelInfo, nil
	case levelWarning:
		return levelWarning, nil
	case levelError:
		return levelError, nil
	case levelCritical:
		return levelCritical, nil
	case levelAlert:
		return levelAlert, nil
	case levelEmergency:
		return levelEmergency, nil
	default:
		return "", fmt.Errorf("unsupported log level: %q", s)
	}
}

// levelEncoder transforms a zap level to the associated stackdriver level.
func levelEncoder() zapcore.LevelEncoder {
	return func(l zapcore.Level, enc zapcore.PrimitiveArrayEncoder) {
		switch l {
		case zapcore.DebugLevel:
			enc.AppendString(levelDebug)
		case zapcore.InfoLevel:
			enc.AppendString(levelInfo)
		case zapcore.WarnLevel:
			enc.AppendString(levelWarning)
		case zapcore.ErrorLevel:
			enc.AppendString(levelError)
		case zapcore.DPanicLevel:
			enc.AppendString(levelCritical)
		case zapcore.PanicLevel:
			enc.AppendString(levelAlert)
		case zapcore.FatalLevel:
			enc.AppendString(levelEmergency)
		}
	}
}

// timeEncoder encodes the time as RFC3339 nano.
func timeEncoder() zapcore.TimeEncoder {
	return func(t time.Time, enc zapcore.PrimitiveArrayEncoder) {
		enc.AppendString(t.Format(time.RFC3339Nano))
	}
}
