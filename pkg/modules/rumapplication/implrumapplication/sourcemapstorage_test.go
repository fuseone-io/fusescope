package implrumapplication

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFileSourceMapStorage(t *testing.T) {
	ctx := context.Background()
	dir := filepath.Join(t.TempDir(), "sourcemaps")
	storage := NewFileSourceMapStorage(dir)

	require.NoError(t, storage.Put(ctx, "org/app/one.map", strings.NewReader(`{"version":3}`)))
	require.NoError(t, storage.Put(ctx, "org/app/one.map", strings.NewReader(`{"version":3,"replaced":true}`)))

	reader, err := storage.Open(ctx, "org/app/one.map")
	require.NoError(t, err)
	content, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.NoError(t, reader.Close())
	assert.Equal(t, `{"version":3,"replaced":true}`, string(content))

	entries, err := os.ReadDir(filepath.Join(dir, "org", "app"))
	require.NoError(t, err)
	assert.Len(t, entries, 1, "no temporary file is left behind")

	require.NoError(t, storage.Delete(ctx, "org/app/one.map"))
	require.NoError(t, storage.Delete(ctx, "org/app/one.map"), "deleting a missing key is not an error")

	_, err = storage.Open(ctx, "org/app/one.map")
	assert.True(t, errors.Ast(err, errors.TypeNotFound), err)

	for _, key := range []string{"../escape.map", "/abs.map", ""} {
		assert.Error(t, storage.Put(ctx, key, strings.NewReader("x")), key)
		_, err := storage.Open(ctx, key)
		assert.Error(t, err, key)
	}
}
