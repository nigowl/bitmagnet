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

	content := readHTTPServerLogFileContent(t, logDir)
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

	content := readHTTPServerLogFileContent(t, logDir)
	if strings.Contains(content, "debug-before-runtime-change") {
		t.Fatalf("expected DEBUG log before runtime level change to be filtered, got: %s", content)
	}
	if !strings.Contains(content, "debug-after-runtime-change") {
		t.Fatalf("expected DEBUG log after runtime level change to be written, got: %s", content)
	}
}

func TestFileRotatorSeparatesServiceModuleLogs(t *testing.T) {
	t.Parallel()

	logDir := t.TempDir()
	result := New(Params{
		Config: Config{
			Level: "INFO",
			FileRotator: FileRotatorConfig{
				Enabled:    true,
				Level:      "INFO",
				Path:       logDir,
				BaseName:   "bitmagnet",
				MaxAge:     time.Hour,
				MaxSize:    8 * 1024 * 1024,
				MaxBackups: 5,
				BufferSize: 256,
			},
		},
	})

	result.Logger.Named("http_server").Info("http-module-log")
	result.Logger.Named("queue").Info("queue-module-log")
	result.Logger.Named("dht_crawler").Info("dht-module-log")
	if result.AppHook.OnStop != nil {
		if err := result.AppHook.OnStop(context.Background()); err != nil {
			t.Fatalf("close rotator: %v", err)
		}
	}

	httpContent := readLogFileContentByPrefix(t, logDir, "bitmagnet-http_server.")
	queueContent := readLogFileContentByPrefix(t, logDir, "bitmagnet-queue_server.")
	dhtContent := readLogFileContentByPrefix(t, logDir, "bitmagnet-dht_server.")
	if !strings.Contains(httpContent, "http-module-log") {
		t.Fatalf("expected http log in http_server file, got: %s", httpContent)
	}
	if strings.Contains(httpContent, "queue-module-log") || strings.Contains(httpContent, "dht-module-log") {
		t.Fatalf("expected http_server file to contain only http module logs, got: %s", httpContent)
	}
	if !strings.Contains(queueContent, "queue-module-log") {
		t.Fatalf("expected queue log in queue_server file, got: %s", queueContent)
	}
	if strings.Contains(queueContent, "http-module-log") || strings.Contains(queueContent, "dht-module-log") {
		t.Fatalf("expected queue_server file to contain only queue module logs, got: %s", queueContent)
	}
	if !strings.Contains(dhtContent, "dht-module-log") {
		t.Fatalf("expected dht log in dht_server file, got: %s", dhtContent)
	}
	if strings.Contains(dhtContent, "http-module-log") || strings.Contains(dhtContent, "queue-module-log") {
		t.Fatalf("expected dht_server file to contain only dht module logs, got: %s", dhtContent)
	}
}

func readHTTPServerLogFileContent(t *testing.T, logDir string) string {
	t.Helper()

	return readLogFileContentByPrefix(t, logDir, "bitmagnet-http_server.")
}

func readLogFileContentByPrefix(t *testing.T, logDir string, prefix string) string {
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
		if !strings.HasPrefix(name, prefix) || !strings.HasSuffix(name, ".log") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(logDir, name))
		if err != nil {
			t.Fatalf("read log file: %v", err)
		}
		return string(raw)
	}

	t.Fatalf("log file with prefix %q not found in %s", prefix, logDir)
	return ""
}
