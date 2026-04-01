package auth

import "context"

type viewerCtxKey struct{}

func WithViewer(ctx context.Context, viewer Viewer) context.Context {
	return context.WithValue(ctx, viewerCtxKey{}, viewer)
}

func ViewerFromContext(ctx context.Context) (Viewer, bool) {
	viewer, ok := ctx.Value(viewerCtxKey{}).(Viewer)
	return viewer, ok
}
