package logging

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestFileRotatorHonorsGlobalLevel(t *testing.T) {
	t.Parallel()

	logDir := t.TempDir()
	result := New(Params{
		Config: Config{
			Level: "INFO",
			FileRotator: FileRotatorConfig{
				Enabled:    true,
				Level:      "DEBUG",
				Path:       logDir,
				BaseName:   "bitmagnet",
				MaxAge:     time.Hour,
				MaxSize:    8 * 1024 * 1024,
				MaxBackups: 5,
				BufferSize: 256,
			},
		},
	})

	result.Logger.Debug("debug-before-level-change")
	result.Logger.Info("info-before-level-change")
	if result.AppHook.OnStop != nil {
		if err := result.AppHook.OnStop(context.Background()); err != nil {
			t.Fatalf("close rotator: %v", err)
		}
	}

	content := readMainLogFileContent(t, logDir)
	if strings.Contains(content, "debug-before-level-change") {
		t.Fatalf("expected DEBUG log to be filtered by global INFO level, but found in file logs: %s", content)
	}
	if !strings.Contains(content, "info-before-level-change") {
		t.Fatalf("expected INFO log to be written in file logs, got: %s", content)
	}
}

func TestFileRotatorRespectsRuntimeLevelChange(t *testing.T) {
	t.Parallel()

	logDir := t.TempDir()
	result := New(Params{
		Config: Config{
			Level: "INFO",
			FileRotator: FileRotatorConfig{
				Enabled:    true,
				Level:      "DEBUG",
				Path:       logDir,
				BaseName:   "bitmagnet",
				MaxAge:     time.Hour,
				MaxSize:    8 * 1024 * 1024,
				MaxBackups: 5,
				BufferSize: 256,
			},
		},
	})

	result.Logger.Debug("debug-before-runtime-change")
	if err := result.LevelController.SetLevel("DEBUG"); err != nil {
		t.Fatalf("set runtime level: %v", err)
	}
	result.Logger.Debug("debug-after-runtime-change")
	if result.AppHook.OnStop != nil {
		if err := result.AppHook.OnStop(context.Background()); err != nil {
			t.Fatalf("close rotator: %v", err)
		}
	}

	content := readMainLogFileContent(t, logDir)
	if strings.Contains(content, "debug-before-runtime-change") {
		t.Fatalf("expected DEBUG log before runtime level change to be filtered, got: %s", content)
	}
	if !strings.Contains(content, "debug-after-runtime-change") {
		t.Fatalf("expected DEBUG log after runtime level change to be written, got: %s", content)
	}
}

func readMainLogFileContent(t *testing.T, logDir string) string {
	t.Helper()

	entries, err := os.ReadDir(logDir)
	if err != nil {
		t.Fatalf("read log dir: %v", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasPrefix(name, "bitmagnet-main.") || !strings.HasSuffix(name, ".log") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(logDir, name))
		if err != nil {
			t.Fatalf("read log file: %v", err)
		}
		return string(raw)
	}

	t.Fatalf("main log file not found in %s", logDir)
	return ""
}
