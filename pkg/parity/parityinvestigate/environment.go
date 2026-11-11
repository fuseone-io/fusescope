package parityinvestigate

import (
	"os"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

var ErrCodeEnvironment = errors.MustNewCode("parity_investigation_environment")

// serviceAccountToken is where Kubernetes mounts the pod's service account token.
const serviceAccountToken = "/var/run/secrets/kubernetes.io/serviceaccount/token"

// ambientCredentials are the variables through which the AWS SDK would pick up a workstation's or
// a shell's credentials instead of the pod's workload identity.
var ambientCredentials = []string{"AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE"}

// CheckEnvironment refuses to investigate anywhere but an interactive session in the parity's pod:
// never in CI, never with stdout other than a terminal, never outside the cluster or without the
// pod's service account, and never with ambient AWS credentials that would override the pod's.
//
// # Errors
//
// Any of those.
func CheckEnvironment(env func(string) (string, bool), stdoutIsTerminal, serviceAccount bool) error {
	refuse := func(why string) error {
		return errors.Newf(errors.TypeForbidden, ErrCodeEnvironment, "the investigation does not run here: %s", why)
	}
	for _, ci := range []string{"CI", "GITHUB_ACTIONS"} {
		if _, ok := env(ci); ok {
			return refuse("this is CI")
		}
	}
	if !stdoutIsTerminal {
		return refuse("its values are shown on a terminal only")
	}
	if host, ok := env("KUBERNETES_SERVICE_HOST"); !ok || host == "" || !serviceAccount {
		return refuse("it runs in the parity's pod only")
	}
	for _, name := range ambientCredentials {
		if _, ok := env(name); ok {
			return refuse("ambient AWS credentials would replace the pod's")
		}
	}
	return nil
}

// CheckThisEnvironment is CheckEnvironment of the running process.
//
// # Errors
//
// See CheckEnvironment.
func CheckThisEnvironment() error {
	info, err := os.Stdout.Stat()
	terminal := err == nil && info.Mode()&os.ModeCharDevice != 0
	_, tokenErr := os.Stat(serviceAccountToken)
	return CheckEnvironment(os.LookupEnv, terminal, tokenErr == nil)
}
