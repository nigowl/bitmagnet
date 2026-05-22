package mediaapi

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/nigowl/bitmagnet/internal/media"
)

func (b *builder) cover(c *gin.Context) {
	headOnly := c.Request.Method == http.MethodHead

	result, err := b.service.Cover(c.Request.Context(), c.Param("id"), c.Param("kind"), c.Param("size"))
	if err != nil {
		switch {
		case errors.Is(err, media.ErrNotFound), errors.Is(err, media.ErrCoverNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": "cover not found"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	if result.Pending {
		c.Header("Cache-Control", "no-store, max-age=0")
		c.Header("X-Bitmagnet-Cover-Status", "pending")
		if headOnly {
			c.Status(http.StatusAccepted)
			return
		}
		c.Data(http.StatusAccepted, "image/svg+xml; charset=utf-8", []byte(pendingCoverSVG()))
		return
	}

	c.Header("Cache-Control", "public, max-age=2592000, immutable")
	c.Header("X-Bitmagnet-Cover-Status", "ready")
	if headOnly {
		c.Status(http.StatusOK)
		return
	}
	c.File(result.FilePath)
}

func pendingCoverSVG() string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 720" role="img" aria-label="Loading cover">
<defs>
<linearGradient id="card-bg" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" stop-color="#1f2937"/>
<stop offset="50%" stop-color="#374151"/>
<stop offset="100%" stop-color="#1f2937"/>
<animateTransform attributeName="gradientTransform" type="translate" from="-1 0" to="1 0" dur="1.2s" repeatCount="indefinite"/>
</linearGradient>
<linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" stop-color="#000000" stop-opacity="0"/>
<stop offset="45%" stop-color="#ffffff" stop-opacity="0.06"/>
<stop offset="55%" stop-color="#ffffff" stop-opacity="0.26"/>
<stop offset="65%" stop-color="#ffffff" stop-opacity="0.06"/>
<stop offset="100%" stop-color="#000000" stop-opacity="0"/>
</linearGradient>
<clipPath id="poster-clip">
<rect x="24" y="24" width="432" height="672" rx="18"/>
</clipPath>
</defs>
<rect width="480" height="720" fill="#111827"/>
<rect x="24" y="24" width="432" height="672" rx="18" fill="url(#card-bg)"/>
<g clip-path="url(#poster-clip)">
<rect x="-432" y="24" width="432" height="672" fill="url(#shine)">
<animate attributeName="x" from="-432" to="480" dur="1.2s" repeatCount="indefinite"/>
</rect>
</g>
<rect x="92" y="500" width="296" height="10" rx="5" fill="#4b5563" opacity="0.8"/>
<rect x="132" y="524" width="216" height="10" rx="5" fill="#4b5563" opacity="0.7"/>
<g transform="translate(240 612)">
<circle r="18" fill="none" stroke="#4b5563" stroke-width="4" opacity="0.28"/>
<path d="M 0 -18 A 18 18 0 0 1 15.6 -9" fill="none" stroke="#d1d5db" stroke-width="4" stroke-linecap="round">
<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1s" repeatCount="indefinite"/>
</path>
</g>
<text x="50%" y="660" text-anchor="middle" fill="#d1d5db" font-size="22" font-family="sans-serif">Loading cover...</text>
</svg>`
}
