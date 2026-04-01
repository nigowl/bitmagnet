package logging

import (
	"bufio"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type logFileInfo struct {
	Name      string
	SizeBytes int64
	UpdatedAt time.Time
}

func listLogFiles(config FileRotatorConfig, category string) ([]logFileInfo, error) {
	if !config.Enabled {
		return []logFileInfo{}, nil
	}

	baseName := ""
	normalizedCategory := normalizeLogCategory(category)
	for _, item := range logCategories(config) {
		if item.Key == normalizedCategory {
			baseName = item.BaseName
			break
		}
	}
	if strings.TrimSpace(baseName) == "" {
		return []logFileInfo{}, nil
	}

	entries, err := os.ReadDir(config.Path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []logFileInfo{}, nil
		}
		return nil, err
	}

	prefix := baseName + "."
	files := make([]logFileInfo, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if !strings.HasPrefix(name, prefix) || !strings.HasSuffix(name, ".log") {
			continue
		}

		fileInfo, statErr := entry.Info()
		if statErr != nil {
			continue
		}

		files = append(files, logFileInfo{
			Name:      name,
			SizeBytes: fileInfo.Size(),
			UpdatedAt: fileInfo.ModTime(),
		})
	}

	sort.SliceStable(files, func(i, j int) bool {
		return files[i].UpdatedAt.After(files[j].UpdatedAt)
	})

	return files, nil
}

func readLogFilePage(path string, page int, linesPerPage int) ([]string, int, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, 0, err
	}
	defer f.Close()

	lines := make([]string, 0, 2048)
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		line := strings.TrimRight(scanner.Text(), "\r\n")
		if line == "" {
			continue
		}
		lines = append(lines, line)
	}
	if scanErr := scanner.Err(); scanErr != nil {
		return nil, 0, scanErr
	}

	if page < 1 {
		page = 1
	}
	if linesPerPage < 1 {
		linesPerPage = 100
	}

	total := len(lines)
	if total == 0 {
		return []string{}, 0, nil
	}

	offset := (page - 1) * linesPerPage
	end := total - offset
	if end < 0 {
		end = 0
	}
	start := end - linesPerPage
	if start < 0 {
		start = 0
	}
	if start > end {
		start = end
	}

	return append([]string(nil), lines[start:end]...), total, nil
}

func logFilePath(config FileRotatorConfig, fileName string) string {
	return filepath.Join(config.Path, fileName)
}
