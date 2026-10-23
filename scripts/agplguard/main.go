// Command agplguard fails when the community binary links a package from the
// AGPL collector module that is not in the allowlist, or when the allowlist
// names a package the binary no longer links, so the list can only shrink.
package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"slices"
	"strings"
)

const collectorModule = "github.com/fuseone-io/fusescope-otel-collector"

func main() {
	allowlistPath := flag.String("allowlist", "scripts/agplguard/allowlist.txt", "file listing the collector packages the binary may link")
	target := flag.String("target", "./cmd/community", "package whose dependencies are checked")
	flag.Parse()

	if err := run(*allowlistPath, *target); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(allowlistPath, target string) error {
	file, err := os.Open(allowlistPath)
	if err != nil {
		return err
	}
	defer file.Close()

	allowed, err := parseAllowlist(file)
	if err != nil {
		return fmt.Errorf("%s: %w", allowlistPath, err)
	}

	out, err := exec.Command("go", "list", "-deps", target).Output()
	if err != nil {
		return fmt.Errorf("go list -deps %s: %w", target, err)
	}

	unexpected, stale := compare(strings.Fields(string(out)), allowed)
	if len(unexpected) == 0 && len(stale) == 0 {
		fmt.Printf("%s links %d allowed AGPL collector packages\n", target, len(allowed))
		return nil
	}

	var report strings.Builder
	if len(unexpected) > 0 {
		fmt.Fprintf(&report, "%s links AGPL collector packages that are not allowed (see docs/adr/0001-agpl-collector-dependency.md):\n", target)
		for _, pkg := range unexpected {
			fmt.Fprintf(&report, "  %s\n", pkg)
		}
	}
	if len(stale) > 0 {
		fmt.Fprintf(&report, "%s no longer links these packages; remove them from %s:\n", target, allowlistPath)
		for _, pkg := range stale {
			fmt.Fprintf(&report, "  %s\n", pkg)
		}
	}
	return fmt.Errorf("%s", strings.TrimSuffix(report.String(), "\n"))
}

func parseAllowlist(r io.Reader) ([]string, error) {
	var allowed []string
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if slices.Contains(allowed, line) {
			return nil, fmt.Errorf("duplicate entry %s", line)
		}
		allowed = append(allowed, line)
	}
	return allowed, scanner.Err()
}

func compare(deps, allowed []string) (unexpected, stale []string) {
	var linked []string
	for _, dep := range deps {
		if dep == collectorModule || strings.HasPrefix(dep, collectorModule+"/") {
			linked = append(linked, dep)
		}
	}

	for _, pkg := range linked {
		if !slices.Contains(allowed, pkg) {
			unexpected = append(unexpected, pkg)
		}
	}
	for _, pkg := range allowed {
		if !slices.Contains(linked, pkg) {
			stale = append(stale, pkg)
		}
	}
	slices.Sort(unexpected)
	slices.Sort(stale)
	return unexpected, stale
}
