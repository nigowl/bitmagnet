package auth

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nigowl/bitmagnet/internal/httpserver"
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

const authTokenCookieName = "bitmagnet-auth-token"

func (b *builder) Key() string {
	return "auth"
}

func (*builder) Order() int {
	// Must run before route options so viewer context is available everywhere.
	return -100
}

func (b *builder) Apply(e *gin.Engine) error {
	e.Use(b.authMiddleware())

	e.GET("/api/auth/settings", b.authSettings)
	e.POST("/api/auth/register", b.register)
	e.POST("/api/auth/login", b.login)
	e.POST("/api/auth/logout", b.logout)

	e.GET("/api/users/me", b.requireAuth(), b.currentUser)
	e.POST("/api/users/password", b.requireAuth(), b.changePassword)
	e.GET("/api/users/favorites", b.requireAuth(), b.listFavorites)
	e.POST("/api/users/favorites/:infoHash", b.requireAuth(), b.addFavorite)
	e.DELETE("/api/users/favorites/:infoHash", b.requireAuth(), b.removeFavorite)

	e.GET("/api/admin/users", b.requireAdmin(), b.listUsers)
	e.POST("/api/admin/users", b.requireAdmin(), b.createUser)
	e.PUT("/api/admin/users/:userId", b.requireAdmin(), b.updateUser)
	e.GET("/api/admin/invites", b.requireAdmin(), b.listInviteCodes)
	e.POST("/api/admin/invites", b.requireAdmin(), b.createInviteCode)
	e.POST("/api/admin/invites/batch", b.requireAdmin(), b.batchCreateInviteCodes)
	e.PUT("/api/admin/invites/:inviteId", b.requireAdmin(), b.updateInviteCode)
	e.DELETE("/api/admin/invites/:inviteId", b.requireAdmin(), b.deleteInviteCode)

	return nil
}

func (b *builder) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := readAuthToken(c)
		viewerPresent := false
		if token != "" {
			if viewer, err := b.service.AuthenticateToken(c.Request.Context(), token); err == nil {
				c.Request = c.Request.WithContext(WithViewer(c.Request.Context(), viewer))
				viewerPresent = true
			}
		}

		if c.Request.Method != http.MethodOptions && isMembershipProtectedPath(c.Request.URL.Path) {
			if access, err := b.service.GetAccessSettings(c.Request.Context()); err == nil {
				if access.MembershipEnabled && !viewerPresent && !isMembershipPublicPath(c.Request.URL.Path) {
					c.JSON(http.StatusUnauthorized, gin.H{"error": "membership login required"})
					c.Abort()
					return
				}
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

func (b *builder) requireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		viewer, ok := ViewerFromContext(c.Request.Context())
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		if viewer.Role != RoleAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			c.Abort()
			return
		}
		c.Next()
	}
}

type credentialsRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	InviteCode string `json:"inviteCode"`
}

type loginRequest struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	RememberFor string `json:"rememberFor"`
}

type passwordChangeRequest struct {
	OldPassword string `json:"oldPassword"`
	NewPassword string `json:"newPassword"`
}

type inviteCreateRequest struct {
	Code      string     `json:"code"`
	Note      string     `json:"note"`
	MaxUses   int        `json:"maxUses"`
	Enabled   bool       `json:"enabled"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type inviteBatchRequest struct {
	Count     int        `json:"count"`
	Length    int        `json:"length"`
	Prefix    string     `json:"prefix"`
	Note      string     `json:"note"`
	MaxUses   int        `json:"maxUses"`
	Enabled   bool       `json:"enabled"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type inviteUpdateRequest struct {
	Note      *string    `json:"note"`
	MaxUses   *int       `json:"maxUses"`
	Enabled   *bool      `json:"enabled"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type createUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type updateUserRequest struct {
	Username *string `json:"username"`
	Password *string `json:"password"`
	Role     *string `json:"role"`
}

func (b *builder) register(c *gin.Context) {
	var req credentialsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	user, token, err := b.service.Register(c.Request.Context(), req.Username, req.Password, req.InviteCode)
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
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	tokenTTL, err := parseRememberFor(req.RememberFor)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, token, err := b.service.Login(c.Request.Context(), req.Username, req.Password, tokenTTL, req.RememberFor)
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
	token := readAuthToken(c)
	if token != "" {
		_ = b.service.RevokeToken(c.Request.Context(), token)
	}
	c.SetCookie(authTokenCookieName, "", -1, "/", "", false, false)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (b *builder) authSettings(c *gin.Context) {
	settings, err := b.service.GetAccessSettings(c.Request.Context())
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"settings": settings})
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

func (b *builder) listUsers(c *gin.Context) {
	users, err := b.service.ListUsers(c.Request.Context())
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": users})
}

func (b *builder) createUser(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	user, err := b.service.CreateUser(c.Request.Context(), AdminUserCreateInput{
		Username: req.Username,
		Password: req.Password,
		Role:     Role(req.Role),
	})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (b *builder) updateUser(c *gin.Context) {
	userID, err := parseInt64Param(c.Param("userId"))
	if err != nil || userID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	var rolePtr *Role
	if req.Role != nil {
		role := Role(*req.Role)
		rolePtr = &role
	}

	user, updateErr := b.service.UpdateUser(c.Request.Context(), userID, AdminUserUpdateInput{
		Username: req.Username,
		Password: req.Password,
		Role:     rolePtr,
	})
	if updateErr != nil {
		writeServiceError(c, updateErr)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (b *builder) listInviteCodes(c *gin.Context) {
	items, err := b.service.ListInviteCodes(c.Request.Context())
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (b *builder) createInviteCode(c *gin.Context) {
	var req inviteCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	var creatorID *int64
	if viewer, ok := ViewerFromContext(c.Request.Context()); ok {
		creatorID = &viewer.ID
	}
	item, err := b.service.CreateInviteCode(c.Request.Context(), InviteCodeInput{
		Code:      req.Code,
		Note:      req.Note,
		MaxUses:   req.MaxUses,
		Enabled:   req.Enabled,
		ExpiresAt: req.ExpiresAt,
	}, creatorID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": item})
}

func (b *builder) batchCreateInviteCodes(c *gin.Context) {
	var req inviteBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	var creatorID *int64
	if viewer, ok := ViewerFromContext(c.Request.Context()); ok {
		creatorID = &viewer.ID
	}
	items, err := b.service.BatchCreateInviteCodes(c.Request.Context(), InviteCodeBatchInput{
		Count:     req.Count,
		Length:    req.Length,
		Prefix:    req.Prefix,
		Note:      req.Note,
		MaxUses:   req.MaxUses,
		Enabled:   req.Enabled,
		ExpiresAt: req.ExpiresAt,
	}, creatorID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (b *builder) updateInviteCode(c *gin.Context) {
	inviteID, err := parseInt64Param(c.Param("inviteId"))
	if err != nil || inviteID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invite id"})
		return
	}
	var req inviteUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	item, updateErr := b.service.UpdateInviteCode(c.Request.Context(), inviteID, InviteCodeUpdateInput{
		Note:      req.Note,
		MaxUses:   req.MaxUses,
		Enabled:   req.Enabled,
		ExpiresAt: req.ExpiresAt,
	})
	if updateErr != nil {
		writeServiceError(c, updateErr)
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": item})
}

func (b *builder) deleteInviteCode(c *gin.Context) {
	inviteID, err := parseInt64Param(c.Param("inviteId"))
	if err != nil || inviteID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invite id"})
		return
	}
	if err := b.service.DeleteInviteCode(c.Request.Context(), inviteID); err != nil {
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
	case errors.Is(err, ErrInviteRequired):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invite code is required"})
	case errors.Is(err, ErrInviteInvalid):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invite code"})
	case errors.Is(err, ErrInviteExhausted):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invite code exhausted"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

func parseRememberFor(value string) (time.Duration, error) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch normalized {
	case "":
		return 0, nil
	case "1d":
		return 24 * time.Hour, nil
	case "1w":
		return 7 * 24 * time.Hour, nil
	case "1m":
		return 30 * 24 * time.Hour, nil
	default:
		return 0, ErrInvalidInput
	}
}

func parseInt64Param(raw string) (int64, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, ErrInvalidInput
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, err
	}
	return parsed, nil
}

func readAuthToken(c *gin.Context) string {
	token := strings.TrimSpace(BearerToken(c.GetHeader("Authorization")))
	if token != "" {
		return token
	}
	cookieToken, err := c.Cookie(authTokenCookieName)
	if err != nil {
		return ""
	}
	cookieToken = strings.TrimSpace(cookieToken)
	if cookieToken == "" {
		return ""
	}
	if decoded, decodeErr := url.QueryUnescape(cookieToken); decodeErr == nil {
		return strings.TrimSpace(decoded)
	}
	return cookieToken
}

func isMembershipProtectedPath(path string) bool {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return false
	}
	return strings.HasPrefix(trimmed, "/api/") || trimmed == "/graphql"
}

func isMembershipPublicPath(path string) bool {
	switch strings.TrimSpace(path) {
	case "/api/auth/login",
		"/api/auth/register",
		"/api/auth/settings":
		return true
	default:
		return false
	}
}
