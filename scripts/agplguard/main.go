// Command agplguard fails when the community binary links any package from
// the AGPL collector module, or, with -chart, when the chart's default install
// runs an AGPL image (docs/adr/0001-agpl-collector-dependency.md).
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
	chart := flag.String("chart", "", "Helm chart directory whose default install is checked for AGPL images")
	flag.Parse()

	if err := run(*target); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if *chart == "" {
		return
	}
	if err := runChart(*chart); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runChart(chart string) error {
	if out, err := exec.Command("helm", "dependency", "build", chart).CombinedOutput(); err != nil {
		return fmt.Errorf("helm dependency build %s: %w\n%s", chart, err, out)
	}
	manifest, err := exec.Command("helm", "template", "agpl-check", chart).Output()
	if err != nil {
		return fmt.Errorf("helm template %s: %w", chart, err)
	}
	images, err := renderedImages(manifest)
	if err != nil {
		return err
	}
	if len(images) == 0 {
		return fmt.Errorf("%s renders no images; the check would pass vacuously", chart)
	}

	agpl := agplImages(images)
	if len(agpl) == 0 {
		fmt.Printf("%s's default install runs no AGPL images (%d checked)\n", chart, len(images))
		return nil
	}

	var report strings.Builder
	fmt.Fprintf(&report, "%s's default install runs AGPL images (see docs/adr/0001-agpl-collector-dependency.md):\n", chart)
	for _, image := range agpl {
		fmt.Fprintf(&report, "  %s\n", image)
	}
	return fmt.Errorf("%s", strings.TrimSuffix(report.String(), "\n"))
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
