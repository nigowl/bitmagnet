package subtitles

import (
	"context"
	"crypto/rand"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/nigowl/bitmagnet/internal/runtimeconfig"
	"gorm.io/gorm"
)

const (
	maxTemplates         = 64
	maxTemplateNameLen   = 80
	maxTemplateURLLen    = 2048
	fallbackTemplateName = "Subtitle"
)

var (
	ErrInvalidTemplate  = errors.New("invalid subtitle template")
	ErrTemplateNotFound = errors.New("subtitle template not found")

	placeholderPattern = regexp.MustCompile(`\{[a-zA-Z0-9_]+\}`)
)

type Template struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	URLTemplate string `json:"urlTemplate"`
	Enabled     bool   `json:"enabled"`
}

type Input struct {
	Name        string `json:"name"`
	URLTemplate string `json:"urlTemplate"`
	Enabled     *bool  `json:"enabled"`
}

func Load(ctx context.Context, db *gorm.DB) ([]Template, error) {
	values, err := runtimeconfig.ReadValues(ctx, db, []string{runtimeconfig.KeyMediaSubtitleTemplates})
	if err != nil {
		return nil, err
	}

	rawValue := strings.TrimSpace(values[runtimeconfig.KeyMediaSubtitleTemplates])
	if rawValue == "" {
		return []Template{}, nil
	}

	var parsed []Template
	if err := json.Unmarshal([]byte(rawValue), &parsed); err != nil {
		return nil, fmt.Errorf("%w: parse templates", ErrInvalidTemplate)
	}
	return normalizeLoadedTemplates(parsed), nil
}

func Create(ctx context.Context, db *gorm.DB, input Input) (Template, error) {
	templates, err := Load(ctx, db)
	if err != nil {
		return Template{}, err
	}
	if len(templates) >= maxTemplates {
		return Template{}, fmt.Errorf("%w: too many templates (max %d)", ErrInvalidTemplate, maxTemplates)
	}

	template, err := normalizeInput(input, true)
	if err != nil {
		return Template{}, err
	}
	template.ID = randomID()

	templates = append(templates, template)
	if err := save(ctx, db, templates); err != nil {
		return Template{}, err
	}
	return template, nil
}

func Update(ctx context.Context, db *gorm.DB, id string, input Input) (Template, error) {
	templateID := strings.TrimSpace(id)
	if templateID == "" {
		return Template{}, fmt.Errorf("%w: id", ErrInvalidTemplate)
	}

	templates, err := Load(ctx, db)
	if err != nil {
		return Template{}, err
	}

	for idx := range templates {
		if templates[idx].ID != templateID {
			continue
		}
		template, normalizeErr := normalizeInput(input, templates[idx].Enabled)
		if normalizeErr != nil {
			return Template{}, normalizeErr
		}
		template.ID = templates[idx].ID
		templates[idx] = template
		if err := save(ctx, db, templates); err != nil {
			return Template{}, err
		}
		return template, nil
	}

	return Template{}, ErrTemplateNotFound
}

func Delete(ctx context.Context, db *gorm.DB, id string) error {
	templateID := strings.TrimSpace(id)
	if templateID == "" {
		return fmt.Errorf("%w: id", ErrInvalidTemplate)
	}

	templates, err := Load(ctx, db)
	if err != nil {
		return err
	}

	filtered := make([]Template, 0, len(templates))
	removed := false
	for _, template := range templates {
		if template.ID == templateID {
			removed = true
			continue
		}
		filtered = append(filtered, template)
	}
	if !removed {
		return ErrTemplateNotFound
	}
	return save(ctx, db, filtered)
}

func normalizeLoadedTemplates(templates []Template) []Template {
	normalized := make([]Template, 0, len(templates))
	seenID := map[string]struct{}{}

	for idx, item := range templates {
		urlTemplate := strings.TrimSpace(item.URLTemplate)
		if urlTemplate == "" || len(urlTemplate) > maxTemplateURLLen {
			continue
		}
		if err := validateURLTemplate(urlTemplate); err != nil {
			continue
		}

		id := strings.TrimSpace(item.ID)
		if id == "" {
			id = stableID(item.Name, urlTemplate, idx)
		}
		if _, exists := seenID[id]; exists {
			continue
		}
		seenID[id] = struct{}{}

		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = inferNameFromURL(urlTemplate)
		}
		if name == "" {
			name = fallbackTemplateName
		}
		if len(name) > maxTemplateNameLen {
			name = name[:maxTemplateNameLen]
		}

		normalized = append(normalized, Template{
			ID:          id,
			Name:        name,
			URLTemplate: urlTemplate,
			Enabled:     item.Enabled,
		})
		if len(normalized) >= maxTemplates {
			break
		}
	}

	return normalized
}

func normalizeInput(input Input, defaultEnabled bool) (Template, error) {
	name := strings.TrimSpace(input.Name)
	urlTemplate := strings.TrimSpace(input.URLTemplate)
	if urlTemplate == "" {
		return Template{}, fmt.Errorf("%w: urlTemplate is required", ErrInvalidTemplate)
	}
	if len(urlTemplate) > maxTemplateURLLen {
		return Template{}, fmt.Errorf("%w: urlTemplate too long", ErrInvalidTemplate)
	}
	if err := validateURLTemplate(urlTemplate); err != nil {
		return Template{}, err
	}

	if name == "" {
		name = inferNameFromURL(urlTemplate)
	}
	if name == "" {
		name = fallbackTemplateName
	}
	if len(name) > maxTemplateNameLen {
		return Template{}, fmt.Errorf("%w: name too long", ErrInvalidTemplate)
	}

	enabled := defaultEnabled
	if input.Enabled != nil {
		enabled = *input.Enabled
	}

	return Template{
		Name:        name,
		URLTemplate: urlTemplate,
		Enabled:     enabled,
	}, nil
}

func validateURLTemplate(value string) error {
	probe := value
	replacer := strings.NewReplacer(
		"{title}", "Avatar%20Fire%20and%20Ash",
		"{titleRaw}", "Avatar-Fire-and-Ash",
		"{titleEncoded}", "Avatar%3A%20Fire%20and%20Ash",
		"{year}", "2026",
	)
	probe = replacer.Replace(probe)
	probe = placeholderPattern.ReplaceAllString(probe, "test")

	parsed, err := url.ParseRequestURI(probe)
	if err != nil {
		return fmt.Errorf("%w: invalid url template", ErrInvalidTemplate)
	}
	switch strings.ToLower(strings.TrimSpace(parsed.Scheme)) {
	case "http", "https":
		return nil
	default:
		return fmt.Errorf("%w: only http/https are allowed", ErrInvalidTemplate)
	}
}

func save(ctx context.Context, db *gorm.DB, templates []Template) error {
	if len(templates) == 0 {
		return runtimeconfig.WriteValues(ctx, db, map[string]*string{
			runtimeconfig.KeyMediaSubtitleTemplates: nil,
		})
	}

	normalized := normalizeLoadedTemplates(templates)
	encoded, err := json.Marshal(normalized)
	if err != nil {
		return err
	}

	value := string(encoded)
	return runtimeconfig.WriteValues(ctx, db, map[string]*string{
		runtimeconfig.KeyMediaSubtitleTemplates: &value,
	})
}

func inferNameFromURL(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return ""
	}
	if strings.HasPrefix(host, "www.") {
		host = strings.TrimPrefix(host, "www.")
	}
	return host
}

func randomID() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err == nil {
		return hex.EncodeToString(buffer)
	}
	return stableID(time.Now().UTC().String(), "subtitle", 0)
}

func stableID(name string, template string, idx int) string {
	hash := sha1.Sum([]byte(fmt.Sprintf("%s|%s|%d", strings.TrimSpace(name), strings.TrimSpace(template), idx)))
	return hex.EncodeToString(hash[:8])
}
