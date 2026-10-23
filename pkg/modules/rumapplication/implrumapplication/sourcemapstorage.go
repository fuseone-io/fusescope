package implrumapplication

import (
	"context"
	"io"
	"os"
	"path/filepath"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/modules/rumapplication"
	"github.com/fuseone-io/fusescope/pkg/types/rumtypes"
)

var ErrCodeSourceMapStorage = errors.MustNewCode("rum_source_map_storage_failed")

type fileSourceMapStorage struct {
	dir string
}

// NewFileSourceMapStorage stores each key as a file under dir, written to a
// temporary file first so a reader never sees a partial map.
func NewFileSourceMapStorage(dir string) rumapplication.SourceMapStorage {
	return &fileSourceMapStorage{dir: dir}
}

func (storage *fileSourceMapStorage) Put(ctx context.Context, key string, content io.Reader) error {
	path, err := storage.path(key)
	if err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return errors.WrapInternalf(err, ErrCodeSourceMapStorage, "failed to create the source map directory")
	}

	temp, err := os.CreateTemp(filepath.Dir(path), ".upload-*")
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeSourceMapStorage, "failed to store source map")
	}
	defer func() { _ = os.Remove(temp.Name()) }()

	_, err = io.Copy(temp, content)
	if err == nil {
		err = temp.Sync()
	}
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Rename(temp.Name(), path)
	}
	if err != nil {
		return errors.WrapInternalf(err, ErrCodeSourceMapStorage, "failed to store source map")
	}
	return nil
}

func (storage *fileSourceMapStorage) Open(_ context.Context, key string) (io.ReadCloser, error) {
	path, err := storage.path(key)
	if err != nil {
		return nil, err
	}
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil, errors.NewNotFoundf(rumtypes.ErrCodeSourceMapNotFound, "source map content %s not found", key)
	}
	if err != nil {
		return nil, errors.WrapInternalf(err, ErrCodeSourceMapStorage, "failed to open source map")
	}
	return file, nil
}

func (storage *fileSourceMapStorage) Delete(_ context.Context, key string) error {
	path, err := storage.path(key)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return errors.WrapInternalf(err, ErrCodeSourceMapStorage, "failed to delete source map")
	}
	return nil
}

func (storage *fileSourceMapStorage) path(key string) (string, error) {
	if !filepath.IsLocal(key) {
		return "", errors.NewInternalf(ErrCodeSourceMapStorage, "source map storage key %q is not a local path", key)
	}
	return filepath.Join(storage.dir, filepath.FromSlash(key)), nil
}
