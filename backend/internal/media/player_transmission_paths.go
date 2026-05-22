package media

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func playerTransmissionResolveFilePath(downloadDir string, fileName string, localDownloadDir string) (string, error) {
	relative := filepath.Clean(filepath.FromSlash(strings.TrimSpace(fileName)))
	if relative == "." || strings.HasPrefix(relative, "..") || filepath.IsAbs(relative) {
		return "", ErrNotFound
	}

	baseDirs := buildTransmissionPathCandidates(downloadDir, localDownloadDir)
	basename := filepath.Base(relative)
	for _, baseDir := range baseDirs {
		if baseDir == "" {
			continue
		}
		candidates := []string{
			filepath.Join(baseDir, relative),
			filepath.Join(baseDir, relative+".part"),
			filepath.Join(baseDir, basename),
			filepath.Join(baseDir, basename+".part"),
			filepath.Join(baseDir, "complete", relative),
			filepath.Join(baseDir, "complete", relative+".part"),
			filepath.Join(baseDir, "complete", basename),
			filepath.Join(baseDir, "complete", basename+".part"),
			filepath.Join(baseDir, "incomplete", relative),
			filepath.Join(baseDir, "incomplete", relative+".part"),
			filepath.Join(baseDir, "incomplete", basename),
			filepath.Join(baseDir, "incomplete", basename+".part"),
		}
		for _, candidate := range candidates {
			relCheck, err := filepath.Rel(baseDir, candidate)
			if err != nil || strings.HasPrefix(relCheck, "..") {
				continue
			}
			if _, err := os.Stat(candidate); err == nil {
				return candidate, nil
			}
			partialCandidate := candidate + ".part"
			if _, err := os.Stat(partialCandidate); err == nil {
				return partialCandidate, nil
			}
		}
	}

	for _, baseDir := range baseDirs {
		if baseDir == "" {
			continue
		}
		if looseMatch, matchErr := playerTransmissionFindFileLoosely(baseDir, relative); matchErr == nil && strings.TrimSpace(looseMatch) != "" {
			return looseMatch, nil
		}
	}

	return "", fmt.Errorf("stream file not found (downloadDir=%s, file=%s, baseCandidates=%s): %w",
		strings.TrimSpace(downloadDir),
		strings.TrimSpace(fileName),
		strings.Join(baseDirs, " | "),
		ErrNotFound,
	)
}

func buildTransmissionPathCandidates(downloadDir string, localDownloadDir string) []string {
	normalized := filepath.Clean(strings.TrimSpace(downloadDir))
	if normalized == "" {
		return nil
	}
	candidates := make([]string, 0, 8)
	appendCandidate := func(path string) {
		path = strings.TrimSpace(path)
		if path == "" {
			return
		}
		if !filepath.IsAbs(path) {
			if absPath, err := filepath.Abs(path); err == nil {
				path = absPath
			}
		}
		path = filepath.Clean(path)
		for _, existing := range candidates {
			if strings.EqualFold(existing, path) {
				return
			}
		}
		candidates = append(candidates, path)
	}

	appendCandidate(normalized)
	if baseName := strings.ToLower(strings.TrimSpace(filepath.Base(normalized))); baseName == "complete" || baseName == "incomplete" {
		appendCandidate(filepath.Dir(normalized))
	}
	if override := strings.TrimSpace(os.Getenv("BITMAGNET_PLAYER_TRANSMISSION_LOCAL_DOWNLOAD_DIR")); override != "" {
		appendCandidate(override)
	}
	if override := strings.TrimSpace(localDownloadDir); override != "" {
		appendCandidate(override)
	}
	for _, mapped := range mapTransmissionRemotePathToLocal(normalized) {
		appendCandidate(mapped)
	}

	localRoots := make([]string, 0, 8)
	appendLocalRoot := func(path string) {
		path = strings.TrimSpace(path)
		if path == "" {
			return
		}
		localRoots = append(localRoots, path)
		appendCandidate(path)
	}
	appendLocalRoot("/root/.local/share/bitmagnet/transmission/downloads")
	appendLocalRoot("/var/lib/bitmagnet/transmission/downloads")
	if homeDir, err := os.UserHomeDir(); err == nil && strings.TrimSpace(homeDir) != "" {
		appendLocalRoot(filepath.Join(homeDir, ".local/share/bitmagnet/transmission/downloads"))
	}
	if wd, err := os.Getwd(); err == nil && strings.TrimSpace(wd) != "" {
		appendLocalRoot(filepath.Join(wd, "data/transmission/downloads"))
		appendLocalRoot(filepath.Join(wd, "../data/transmission/downloads"))
		appendLocalRoot(filepath.Join(wd, "../backend/data/transmission/downloads"))
		appendLocalRoot(filepath.Join(wd, "backend/data/transmission/downloads"))
	}

	remoteSuffixes := transmissionCandidateSuffixes(normalized)
	for _, root := range localRoots {
		for _, suffix := range remoteSuffixes {
			appendCandidate(filepath.Join(root, suffix))
		}
	}

	remotePrefix := "/downloads"
	if strings.HasPrefix(normalized, remotePrefix) {
		suffix := strings.TrimPrefix(normalized, remotePrefix)
		appendCandidate(filepath.Join("/root/.local/share/bitmagnet/transmission/downloads"))
		appendCandidate(filepath.Join("/var/lib/bitmagnet/transmission/downloads"))
		if homeDir, err := os.UserHomeDir(); err == nil && strings.TrimSpace(homeDir) != "" {
			appendCandidate(filepath.Join(homeDir, ".local/share/bitmagnet/transmission/downloads"))
		}
		if wd, err := os.Getwd(); err == nil && strings.TrimSpace(wd) != "" {
			appendCandidate(filepath.Join(wd, "data/transmission/downloads"))
			appendCandidate(filepath.Join(wd, "../data/transmission/downloads"))
			appendCandidate(filepath.Join(wd, "../backend/data/transmission/downloads"))
			appendCandidate(filepath.Join(wd, "backend/data/transmission/downloads"))
		}
		appendCandidate(filepath.Join("/root/.local/share/bitmagnet/transmission/downloads", suffix))
		appendCandidate(filepath.Join("/var/lib/bitmagnet/transmission/downloads", suffix))
		if homeDir, err := os.UserHomeDir(); err == nil && strings.TrimSpace(homeDir) != "" {
			appendCandidate(filepath.Join(homeDir, ".local/share/bitmagnet/transmission/downloads", suffix))
		}
		if wd, err := os.Getwd(); err == nil && strings.TrimSpace(wd) != "" {
			appendCandidate(filepath.Join(wd, "data/transmission/downloads", suffix))
			appendCandidate(filepath.Join(wd, "../data/transmission/downloads", suffix))
			appendCandidate(filepath.Join(wd, "../backend/data/transmission/downloads", suffix))
			appendCandidate(filepath.Join(wd, "backend/data/transmission/downloads", suffix))
		}
	}

	return candidates
}

func transmissionCandidateSuffixes(downloadDir string) []string {
	normalized := strings.ToLower(filepath.ToSlash(strings.TrimSpace(downloadDir)))
	if normalized == "" || normalized == "." || normalized == "/" {
		return nil
	}
	markers := []string{"/incomplete", "/complete", "/downloads"}
	suffixes := make([]string, 0, 3)
	seen := map[string]struct{}{}
	for _, marker := range markers {
		index := strings.Index(normalized, marker)
		if index < 0 {
			continue
		}
		suffix := strings.TrimPrefix(normalized[index:], "/")
		suffix = strings.TrimSpace(suffix)
		if suffix == "" || suffix == "." {
			continue
		}
		if _, ok := seen[suffix]; ok {
			continue
		}
		seen[suffix] = struct{}{}
		suffixes = append(suffixes, filepath.FromSlash(suffix))
	}
	return suffixes
}

func mapTransmissionRemotePathToLocal(remotePath string) []string {
	rulesRaw := strings.TrimSpace(os.Getenv("BITMAGNET_PLAYER_TRANSMISSION_PATH_MAP"))
	if rulesRaw == "" {
		return nil
	}
	normalizedRemote := filepath.Clean(strings.TrimSpace(remotePath))
	if normalizedRemote == "" {
		return nil
	}

	type mapRule struct {
		remote string
		local  string
	}
	rules := make([]mapRule, 0, 4)
	for _, item := range strings.Split(rulesRaw, ";") {
		part := strings.TrimSpace(item)
		if part == "" {
			continue
		}
		separator := "="
		if strings.Contains(part, "=>") {
			separator = "=>"
		}
		pairs := strings.SplitN(part, separator, 2)
		if len(pairs) != 2 {
			continue
		}
		remote := filepath.Clean(strings.TrimSpace(pairs[0]))
		local := filepath.Clean(strings.TrimSpace(pairs[1]))
		if remote == "" || remote == "." || local == "" || local == "." {
			continue
		}
		rules = append(rules, mapRule{remote: remote, local: local})
	}
	if len(rules) == 0 {
		return nil
	}

	mapped := make([]string, 0, len(rules)*2)
	for _, rule := range rules {
		if strings.EqualFold(normalizedRemote, rule.remote) {
			mapped = append(mapped, rule.local)
			continue
		}
		prefix := rule.remote
		if !strings.HasSuffix(prefix, string(os.PathSeparator)) {
			prefix += string(os.PathSeparator)
		}
		if strings.HasPrefix(normalizedRemote, prefix) {
			suffix := strings.TrimPrefix(normalizedRemote, prefix)
			mapped = append(mapped, filepath.Join(rule.local, suffix))
		}
	}
	return mapped
}

func playerTransmissionFindFileLoosely(baseDir string, relative string) (string, error) {
	base := strings.TrimSpace(baseDir)
	if base == "" {
		return "", ErrNotFound
	}

	relativeLower := strings.ToLower(filepath.ToSlash(relative))
	baseNameLower := strings.ToLower(filepath.Base(relative))
	if baseNameLower == "" || baseNameLower == "." {
		return "", ErrNotFound
	}

	type match struct {
		path  string
		score int
	}
	const maxVisited = 60000
	visited := 0
	matches := make([]match, 0, 4)
	stopWalk := errors.New("stop walk")

	walkErr := filepath.WalkDir(base, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if visited >= maxVisited {
			return stopWalk
		}
		visited++
		if d.IsDir() {
			return nil
		}

		nameLower := strings.ToLower(d.Name())
		trimmedPart := strings.TrimSuffix(nameLower, ".part")
		if nameLower != baseNameLower && trimmedPart != baseNameLower {
			return nil
		}
		relativePath, relErr := filepath.Rel(base, path)
		if relErr != nil {
			return nil
		}
		relLower := strings.ToLower(filepath.ToSlash(relativePath))
		score := 60
		if strings.HasSuffix(relLower, relativeLower) {
			score = 0
		} else if strings.HasSuffix(relLower, "/"+baseNameLower) {
			score = 20
		}
		matches = append(matches, match{
			path:  path,
			score: score,
		})
		return nil
	})
	if walkErr != nil && !errors.Is(walkErr, stopWalk) {
		return "", walkErr
	}
	if len(matches) == 0 {
		return "", ErrNotFound
	}
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].score != matches[j].score {
			return matches[i].score < matches[j].score
		}
		return len(matches[i].path) < len(matches[j].path)
	})
	return matches[0].path, nil
}

func playerTransmissionDescribeLocalDir(localDownloadDir string) string {
	trimmed := strings.TrimSpace(localDownloadDir)
	if trimmed == "" {
		return "unset"
	}

	info, err := os.Stat(trimmed)
	if err != nil {
		return fmt.Sprintf("%s (stat error: %v)", trimmed, err)
	}
	if !info.IsDir() {
		return fmt.Sprintf("%s (exists=true,isDir=false)", trimmed)
	}

	entries, readErr := os.ReadDir(trimmed)
	if readErr != nil {
		return fmt.Sprintf("%s (exists=true,isDir=true,readable=false,error=%v)", trimmed, readErr)
	}
	return fmt.Sprintf("%s (exists=true,isDir=true,readable=true,entries=%d)", trimmed, len(entries))
}
