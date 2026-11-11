package parityinvestigate

import (
	"bytes"
	"io"
	"os"

	"golang.org/x/term"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeSecret = errors.MustNewCode("parity_investigation_secret")

// ReadSecret reads one secret value of at most limit bytes from f: from a terminal without echo,
// one line; from a pipe or file, everything up to EOF, one trailing newline aside. It is the one
// channel a secret comes through: never an argument, the environment or stdin. Errors never carry
// what was read. The caller wipes the value once used.
//
// # Errors
//
// An empty value, one over limit, more than one line, or a read that failed.
func ReadSecret(f *os.File, limit int) ([]byte, error) {
	refuse := func(why string) ([]byte, error) {
		return nil, errors.Newf(errors.TypeInvalidInput, ErrCodeSecret, "the secret is refused: %s", why)
	}
	var value []byte
	if term.IsTerminal(int(f.Fd())) {
		read, err := term.ReadPassword(int(f.Fd()))
		if err != nil {
			Wipe(read)
			return refuse("the terminal could not be read")
		}
		value = read
	} else {
		read, err := io.ReadAll(io.LimitReader(f, int64(limit)+2))
		if err != nil {
			Wipe(read)
			return refuse("it could not be read")
		}
		value = bytes.TrimSuffix(read, []byte("\n"))
		if bytes.ContainsRune(value, '\n') {
			Wipe(read)
			return refuse("it holds more than one value")
		}
	}
	if len(value) == 0 || len(value) > limit {
		Wipe(value)
		return refuse("it is empty or over its limit")
	}
	return value, nil
}

// Wipe overwrites a secret buffer, a best effort against it lingering in memory.
func Wipe(b []byte) {
	clear(b)
}
