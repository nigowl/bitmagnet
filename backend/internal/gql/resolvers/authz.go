package resolvers

import (
	"context"

	"github.com/nigowl/bitmagnet/internal/auth"
)

func requireAdmin(ctx context.Context) error {
	viewer, ok := auth.ViewerFromContext(ctx)
	if !ok {
		return auth.ErrUnauthorized
	}
	if viewer.Role != auth.RoleAdmin {
		return auth.ErrForbidden
	}
	return nil
}

func requireAuthenticated(ctx context.Context) (auth.Viewer, error) {
	viewer, ok := auth.ViewerFromContext(ctx)
	if !ok {
		return auth.Viewer{}, auth.ErrUnauthorized
	}
	return viewer, nil
}
