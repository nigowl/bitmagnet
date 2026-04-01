package classifier

import (
	"github.com/nigowl/bitmagnet/internal/tmdb"
)

type dependencies struct {
	search     LocalSearch
	tmdbClient tmdb.Client
}
