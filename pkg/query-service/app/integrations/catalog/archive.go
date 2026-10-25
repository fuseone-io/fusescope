package catalog

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"io"
	"path"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

const (
	maxPackageFiles     = 256
	maxPackageFileBytes = 8 << 20
	maxPackageBytes     = 32 << 20
)

// unpack reads a package tarball into memory. Only regular files with clean,
// relative names are accepted.
func unpack(archive []byte) (map[string][]byte, error) {
	gz, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return nil, err
	}
	defer gz.Close()

	files := map[string][]byte{}
	total := 0
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return files, nil
		}
		if err != nil {
			return nil, err
		}
		if hdr.Typeflag != tar.TypeReg {
			return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s is not a regular file", hdr.Name)
		}
		if hdr.Name != path.Clean(hdr.Name) || path.IsAbs(hdr.Name) || hdr.Name == ".." || strings.HasPrefix(hdr.Name, "../") {
			return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "invalid file name %q", hdr.Name)
		}
		if _, ok := files[hdr.Name]; ok {
			return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s appears twice", hdr.Name)
		}
		if len(files) == maxPackageFiles {
			return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "more than %d files", maxPackageFiles)
		}
		if hdr.Size > maxPackageFileBytes || total+int(hdr.Size) > maxPackageBytes {
			return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "%s is too large", hdr.Name)
		}
		content, err := io.ReadAll(io.LimitReader(tr, hdr.Size))
		if err != nil {
			return nil, err
		}
		total += len(content)
		files[hdr.Name] = content
	}
}
