// Command agplguard fails when the community binary links any package from
// the AGPL collector module (docs/adr/0001-agpl-collector-dependency.md).
package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"slices"
	"strings"
)

const collectorModule = "github.com/fuseone-io/fusescope-otel-collector"

func main() {
	target := flag.String("target", "./cmd/community", "package whose dependencies are checked")
	flag.Parse()

	if err := run(*target); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(target string) error {
	out, err := exec.Command("go", "list", "-deps", target).Output()
	if err != nil {
		return fmt.Errorf("go list -deps %s: %w", target, err)
	}

	linked := collectorPackages(strings.Fields(string(out)))
	if len(linked) == 0 {
		fmt.Printf("%s links no AGPL collector packages\n", target)
		return nil
	}

	var report strings.Builder
	fmt.Fprintf(&report, "%s links AGPL collector packages, which the MIT backend must not (see docs/adr/0001-agpl-collector-dependency.md):\n", target)
	for _, pkg := range linked {
		fmt.Fprintf(&report, "  %s\n", pkg)
	}
	return fmt.Errorf("%s", strings.TrimSuffix(report.String(), "\n"))
}

func collectorPackages(deps []string) []string {
	var linked []string
	for _, dep := range deps {
		if dep == collectorModule || strings.HasPrefix(dep, collectorModule+"/") {
			linked = append(linked, dep)
		}
	}
	slices.Sort(linked)
	return linked
}
