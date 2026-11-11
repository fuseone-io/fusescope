// Command parity runs a D5 parity round, the trace views on ClickHouse and on fusescope-engine
// compared, classified and reported by fingerprint; investigates one round's differences; deletes
// expired run keys; or waits, as the investigation's pod, for an operator.
package main

import (
	"fmt"
	"io"
	"os"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/parity/parityrun"
)

const usage = `usage:
  parity run -settings FILE -tenants FILE -reports DIR [-seed N]
  parity investigate -settings FILE -tenants FILE -run ID -tenant ORG -class settled|recent -identity-fd tty|N -key-fd tty|N
  parity cleanup -settings FILE
  parity wait`

func main() {
	if err := run(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		fmt.Fprintln(os.Stderr, "parity:", errorCode(err))
		os.Exit(1)
	}
}

// errorCode is how a failure is printed: by type and code, never its message.
func errorCode(err error) string {
	if e := parityrun.ErrorOf("parity", err); e != nil {
		return e.Type + "/" + e.Code
	}
	return ""
}

func run(args []string, stdout, stderr io.Writer) error {
	if len(args) > 0 {
		switch args[0] {
		case "run":
			return runRound(args[1:], stdout, stderr)
		case "investigate":
			return investigate(args[1:], stdout, stderr)
		case "cleanup":
			return cleanup(args[1:], stdout, stderr)
		case "wait":
			return wait(stderr)
		}
	}
	fmt.Fprintln(stderr, usage)
	return errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "unknown command")
}

func load(settingsFile, tenantsFile string) (parityrun.Settings, parityrun.Tenants, error) {
	sf, err := os.Open(settingsFile)
	if err != nil {
		return parityrun.Settings{}, parityrun.Tenants{}, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "the settings file does not open")
	}
	defer sf.Close()
	settings, err := parityrun.ParseSettings(sf)
	if err != nil {
		return parityrun.Settings{}, parityrun.Tenants{}, err
	}
	tf, err := os.Open(tenantsFile)
	if err != nil {
		return parityrun.Settings{}, parityrun.Tenants{}, errors.WrapInvalidInputf(err, errors.CodeInvalidInput, "the tenants file does not open")
	}
	defer tf.Close()
	tenants, err := parityrun.ParseTenants(tf)
	return settings, tenants, err
}
