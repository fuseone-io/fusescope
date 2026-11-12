// Command logspipelinecompat checks the collector's log pipelines library,
// which the pipeline preview runs, in this module's graph (collector ADR 0012,
// decision 4). This module, not the library, selects the versions in this
// build (minimal version selection), so it fails when the versions selected
// here for the modules the library is built with differ from the library's
// own requirements, apart from the drifts approved in approved.txt. It then
// runs the library's tests with this go.mod, its replace directives included.
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"slices"
	"strings"

	"golang.org/x/mod/modfile"
)

const library = "github.com/fuseone-io/fusescope-collector-server/components/pkg/logspipeline"

// watched are the modules that decide the library's behaviour.
var watched = []string{
	"github.com/expr-lang/expr",
	"github.com/open-telemetry/opentelemetry-collector-contrib/pkg/stanza",
	"go.opentelemetry.io/collector/pdata",
}

type module struct {
	Path    string
	Version string
	GoMod   string
	Replace *module
}

func main() {
	approvedPath := flag.String("approved", "scripts/logspipelinecompat/approved.txt", "drifts from the library's versions this module has approved")
	test := flag.Bool("test", true, "also run the library's tests in this module's graph")
	flag.Parse()
	if err := run(*approvedPath, *test); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(approvedPath string, test bool) error {
	selected, err := listModules(append([]string{library}, watched...))
	if err != nil {
		return err
	}
	lib, ok := selected[library]
	if !ok {
		return fmt.Errorf("%s is not in this module's graph", library)
	}
	gomod, err := libraryGoMod(lib.Version)
	if err != nil {
		return err
	}
	required, err := requires(gomod)
	if err != nil {
		return fmt.Errorf("%s@%s go.mod: %w", library, lib.Version, err)
	}
	f, err := os.Open(approvedPath)
	if err != nil {
		return err
	}
	defer f.Close()
	approved, err := parseApproved(f)
	if err != nil {
		return fmt.Errorf("%s: %w", approvedPath, err)
	}
	if problems := compare(watched, required, selected, approved); len(problems) > 0 {
		return fmt.Errorf("%s@%s in this module's graph:\n  %s", library, lib.Version, strings.Join(problems, "\n  "))
	}
	fmt.Printf("%s@%s: the versions selected here match its requirements, apart from %d approved drift(s)\n", library, lib.Version, len(approved))
	if !test {
		return nil
	}
	cmd := exec.Command("go", "test", "-count=1", library+"/...")
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("the library's tests in this module's graph: %w", err)
	}
	return nil
}

// compare returns a problem for every watched module whose version selected
// here differs from the library's requirement without an approval, every
// approval that matches no drift, and every watched module the build does not
// select. A drift reads "path required => selected", where selected is a
// version or a replacement "path version".
func compare(watched []string, required map[string]string, selected map[string]module, approved []string) []string {
	var problems []string
	drifts := map[string]bool{}
	for _, path := range watched {
		want, ok := required[path]
		if !ok {
			continue
		}
		got, ok := selected[path]
		if !ok {
			problems = append(problems, "not selected by this build: "+path)
			continue
		}
		effective := got.Version
		if got.Replace != nil {
			effective = got.Replace.Path + " " + got.Replace.Version
		}
		if got.Replace == nil && got.Version == want {
			continue
		}
		drift := path + " " + want + " => " + effective
		drifts[drift] = true
		if !slices.Contains(approved, drift) {
			problems = append(problems, "drift not approved: "+drift)
		}
	}
	for _, a := range approved {
		if !drifts[a] {
			problems = append(problems, "approval matches no drift, remove it: "+a)
		}
	}
	return problems
}

// parseApproved reads one drift per line, "path version => version" or
// "path version => path version"; "#" starts a comment.
func parseApproved(r io.Reader) ([]string, error) {
	var approved []string
	scanner := bufio.NewScanner(r)
	for n := 1; scanner.Scan(); n++ {
		line, _, _ := strings.Cut(scanner.Text(), "#")
		line = strings.Join(strings.Fields(line), " ")
		if line == "" {
			continue
		}
		if !strings.Contains(line, " => ") {
			return nil, fmt.Errorf("line %d: want \"path version => selected\", got %q", n, line)
		}
		approved = append(approved, line)
	}
	return approved, scanner.Err()
}

// requires returns the library's requirements, direct and indirect.
func requires(gomod []byte) (map[string]string, error) {
	f, err := modfile.ParseLax("go.mod", gomod, nil)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(f.Require))
	for _, r := range f.Require {
		out[r.Mod.Path] = r.Mod.Version
	}
	return out, nil
}

func listModules(paths []string) (map[string]module, error) {
	out, err := exec.Command("go", append([]string{"list", "-m", "-json"}, paths...)...).Output()
	if err != nil {
		return nil, fmt.Errorf("go list -m: %w", err)
	}
	modules := map[string]module{}
	dec := json.NewDecoder(bytes.NewReader(out))
	for dec.More() {
		var m module
		if err := dec.Decode(&m); err != nil {
			return nil, err
		}
		modules[m.Path] = m
	}
	return modules, nil
}

func libraryGoMod(version string) ([]byte, error) {
	out, err := exec.Command("go", "mod", "download", "-json", library+"@"+version).Output()
	if err != nil {
		return nil, fmt.Errorf("go mod download %s@%s: %w", library, version, err)
	}
	var m module
	if err := json.Unmarshal(out, &m); err != nil {
		return nil, err
	}
	return os.ReadFile(m.GoMod)
}
