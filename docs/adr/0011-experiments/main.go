package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
)

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string, out io.Writer) error {
	flags := flag.NewFlagSet("native-symbol-spike", flag.ContinueOnError)
	file := flags.String("file", "", "owned fixture file; never executed")
	var query request
	flags.Uint64Var(&query.Address, "address", 0, "address, decimal or 0x-prefixed")
	flags.Uint64Var(&query.Slide, "slide", 0, "Mach-O runtime slide")
	flags.StringVar(&query.Kind, "kind", "", "elf_rel_pc, elf_file_offset or macho_runtime_pc")
	flags.StringVar(&query.Identity, "identity", "", "expected GNU build ID or Mach-O UUID")
	flags.StringVar(&query.Arch, "arch", "", "expected x86_64 or arm64")
	budget := defaultLimits()
	flags.Uint64Var(&budget.MaxFile, "max-file-bytes", budget.MaxFile, "experimental input budget")
	flags.Uint64Var(&budget.MaxDecoded, "max-decoded-bytes", budget.MaxDecoded, "experimental aggregate decoded-section budget")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *file == "" || budget.MaxFile == 0 || budget.MaxFile > 256<<20 || budget.MaxDecoded == 0 || budget.MaxDecoded > 512<<20 {
		return reject("file and bounded experimental limits are required")
	}
	input, err := os.Open(*file)
	if err != nil {
		return err
	}
	defer input.Close()
	stat, err := input.Stat()
	if err != nil {
		return err
	}
	if !stat.Mode().IsRegular() || stat.Size() < 0 || uint64(stat.Size()) > budget.MaxFile {
		return reject("regular file exceeds input budget")
	}
	data, err := io.ReadAll(io.LimitReader(input, int64(budget.MaxFile)+1))
	if err != nil {
		return err
	}
	result, err := inspect(data, query, budget)
	if err != nil {
		return err
	}
	return json.NewEncoder(out).Encode(result)
}
