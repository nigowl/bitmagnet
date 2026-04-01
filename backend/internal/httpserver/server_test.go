package httpserver

import (
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type testOption struct {
	key string
}

func (o testOption) Key() string {
	return o.key
}

func (testOption) Apply(*gin.Engine) error {
	return nil
}

type orderedTestOption struct {
	testOption
	order int
}

func (o orderedTestOption) Order() int {
	return o.order
}

func TestResolveOptionsSortsByOrderThenKey(t *testing.T) {
	options := []Option{
		testOption{key: "admin_settings"},
		orderedTestOption{testOption: testOption{key: "auth"}, order: -100},
		testOption{key: "media"},
		orderedTestOption{testOption: testOption{key: "cors"}, order: -90},
	}

	resolved, err := resolveOptions([]string{"*"}, options)
	require.NoError(t, err)
	require.Len(t, resolved, 4)
	require.Equal(t, "auth", resolved[0].Key())
	require.Equal(t, "cors", resolved[1].Key())
	require.Equal(t, "admin_settings", resolved[2].Key())
	require.Equal(t, "media", resolved[3].Key())
}

func TestResolveOptionsSelectedSubsetStillSorted(t *testing.T) {
	options := []Option{
		testOption{key: "admin_settings"},
		orderedTestOption{testOption: testOption{key: "auth"}, order: -100},
		orderedTestOption{testOption: testOption{key: "cors"}, order: -90},
		testOption{key: "media"},
	}

	resolved, err := resolveOptions([]string{"media", "auth", "admin_settings"}, options)
	require.NoError(t, err)
	require.Len(t, resolved, 3)
	require.Equal(t, "auth", resolved[0].Key())
	require.Equal(t, "admin_settings", resolved[1].Key())
	require.Equal(t, "media", resolved[2].Key())
}
