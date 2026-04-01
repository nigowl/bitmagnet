package auth

import (
	"errors"
	"net/http"

	"github.com/nigowl/bitmagnet/internal/httpserver"
	"github.com/gin-gonic/gin"
	"go.uber.org/fx"
)

type HTTPParams struct {
	fx.In
	Service Service
}

type HTTPResult struct {
	fx.Out
	Option httpserver.Option `group:"http_server_options"`
}

func NewHTTPServer(p HTTPParams) HTTPResult {
	return HTTPResult{Option: &builder{service: p.Service}}
}

type builder struct {
	service Service
}

func (b *builder) Key() string {
	return "auth"
}

func (*builder) Order() int {
	// Must run before route options so viewer context is available everywhere.
	return -100
}

func (b *builder) Apply(e *gin.Engine) error {
	e.Use(b.authMiddleware())

	e.POST("/api/auth/register", b.register)
	e.POST("/api/auth/login", b.login)
	e.POST("/api/auth/logout", b.logout)

	e.GET("/api/users/me", b.requireAuth(), b.currentUser)
	e.POST("/api/users/password", b.requireAuth(), b.changePassword)
	e.GET("/api/users/favorites", b.requireAuth(), b.listFavorites)
	e.POST("/api/users/favorites/:infoHash", b.requireAuth(), b.addFavorite)
	e.DELETE("/api/users/favorites/:infoHash", b.requireAuth(), b.removeFavorite)

	return nil
}

func (b *builder) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := BearerToken(c.GetHeader("Authorization"))
		if token != "" {
			if viewer, err := b.service.AuthenticateToken(c.Request.Context(), token); err == nil {
				c.Request = c.Request.WithContext(WithViewer(c.Request.Context(), viewer))
			}
		}
		c.Next()
	}
}

func (b *builder) requireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := ViewerFromContext(c.Request.Context()); !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		c.Next()
	}
}

type credentialsRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type passwordChangeRequest struct {
	OldPassword string `json:"oldPassword"`
	NewPassword string `json:"newPassword"`
}

func (b *builder) register(c *gin.Context) {
	var req credentialsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	user, token, err := b.service.Register(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  user,
	})
}

func (b *builder) login(c *gin.Context) {
	var req credentialsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	user, token, err := b.service.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user":  user,
	})
}

func (b *builder) logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (b *builder) currentUser(c *gin.Context) {
	viewer, _ := ViewerFromContext(c.Request.Context())
	user, err := b.service.GetUser(c.Request.Context(), viewer.ID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (b *builder) changePassword(c *gin.Context) {
	viewer, _ := ViewerFromContext(c.Request.Context())

	var req passwordChangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if err := b.service.ChangePassword(c.Request.Context(), viewer.ID, req.OldPassword, req.NewPassword); err != nil {
		writeServiceError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (b *builder) listFavorites(c *gin.Context) {
	viewer, _ := ViewerFromContext(c.Request.Context())
	favorites, err := b.service.ListFavorites(c.Request.Context(), viewer.ID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": favorites})
}

func (b *builder) addFavorite(c *gin.Context) {
	viewer, _ := ViewerFromContext(c.Request.Context())
	if err := b.service.AddFavorite(c.Request.Context(), viewer.ID, c.Param("infoHash")); err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (b *builder) removeFavorite(c *gin.Context) {
	viewer, _ := ViewerFromContext(c.Request.Context())
	if err := b.service.RemoveFavorite(c.Request.Context(), viewer.ID, c.Param("infoHash")); err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func writeServiceError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrUnauthorized):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
	case errors.Is(err, ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, ErrInvalidInput):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid input"})
	case errors.Is(err, ErrInvalidCredentials):
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
	case errors.Is(err, ErrUserExists):
		c.JSON(http.StatusConflict, gin.H{"error": "user already exists"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}
