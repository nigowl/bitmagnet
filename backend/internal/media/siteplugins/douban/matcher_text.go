package douban

import (
	"strconv"
	"strings"
	"unicode"

	"github.com/agnivade/levenshtein"
)

func extractYearFromText(value string) int {
	match := yearRegex.FindString(value)
	if match == "" {
		return 0
	}
	year, _ := strconv.Atoi(match)
	return year
}

func compareNameSimilarity(left, right string) float64 {
	leftVariants := buildTitleVariants(left)
	rightVariants := buildTitleVariants(right)
	if len(leftVariants) == 0 || len(rightVariants) == 0 {
		return 0
	}

	best := 0.0
	for _, l := range leftVariants {
		for _, r := range rightVariants {
			sim := stringSimilarity(l, r)
			if sim > best {
				best = sim
			}

			leftLatin := normalizeLatinComparable(l)
			rightLatin := normalizeLatinComparable(r)
			if leftLatin == "" || rightLatin == "" {
				continue
			}
			if strings.Contains(leftLatin, rightLatin) || strings.Contains(rightLatin, leftLatin) {
				boosted := sim + 0.22
				if boosted > 1 {
					boosted = 1
				}
				if boosted > best {
					best = boosted
				}
			}
		}
	}

	return best
}

func stringSimilarity(left, right string) float64 {
	left = normalizeComparableText(left)
	right = normalizeComparableText(right)
	if left == "" || right == "" {
		return 0
	}
	if left == right {
		return 1
	}

	distance := levenshtein.ComputeDistance(left, right)
	maxLen := max(len([]rune(left)), len([]rune(right)))
	if maxLen == 0 {
		return 0
	}

	score := 1 - (float64(distance) / float64(maxLen))
	if score < 0 {
		return 0
	}
	return score
}

func normalizeComparableText(value string) string {
	value = strings.ToLower(stripFormatChars(cleanText(value)))
	var b strings.Builder
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func normalizeLatinComparable(value string) string {
	value = strings.ToLower(stripFormatChars(cleanText(value)))
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func buildTitleVariants(value string) []string {
	value = stripFormatChars(cleanText(value))
	if value == "" {
		return nil
	}

	candidates := []string{
		value,
		strings.TrimSpace(bracketContentRegex.ReplaceAllString(value, " ")),
		strings.TrimSpace(yearRegex.ReplaceAllString(value, " ")),
		strings.TrimSpace(yearRegex.ReplaceAllString(bracketContentRegex.ReplaceAllString(value, " "), " ")),
		strings.TrimSpace(titleNormalizeReg.ReplaceAllString(value, " ")),
	}

	parts := multiDividerSplitReg.Split(value, -1)
	for _, part := range parts {
		part = cleanText(part)
		if part != "" {
			candidates = append(candidates, part)
		}
	}

	if latin := extractLatinPhrase(value); latin != "" {
		candidates = append(candidates, latin, strings.TrimSpace(yearRegex.ReplaceAllString(latin, " ")))
	}
	if han := extractHanPhrase(value); han != "" {
		candidates = append(candidates, han)
	}

	result := make([]string, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		candidate = cleanText(stripFormatChars(candidate))
		if len([]rune(candidate)) < 2 {
			continue
		}
		key := normalizeComparableText(candidate)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, candidate)
	}

	return result
}

func extractLatinPhrase(value string) string {
	var b strings.Builder
	lastWasSpace := false
	for _, r := range value {
		isLatin := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
		isDigit := r >= '0' && r <= '9'
		if isLatin || isDigit || r == '\'' || r == '’' {
			b.WriteRune(r)
			lastWasSpace = false
			continue
		}
		if unicode.IsSpace(r) && !lastWasSpace && b.Len() > 0 {
			b.WriteRune(' ')
			lastWasSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

func extractHanPhrase(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.Is(unicode.Han, r) {
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

func stripFormatChars(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.Is(unicode.Cf, r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func joinNonEmpty(values ...string) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		normalized := cleanText(value)
		if normalized != "" {
			parts = append(parts, normalized)
		}
	}
	return strings.Join(parts, " ")
}

func cleanText(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return multiSpaceRegex.ReplaceAllString(trimmed, " ")
}

func extractDigits(value string) string {
	var b strings.Builder
	for _, r := range value {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func containsHan(value string) bool {
	for _, r := range value {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}
