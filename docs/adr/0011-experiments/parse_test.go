package main

import (
	"bytes"
	"debug/elf"
	"debug/macho"
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func fixtureCommand(t *testing.T, name string, args ...string) {
	t.Helper()
	if _, err := exec.LookPath(name); err != nil {
		t.Skipf("owned fixture generator needs %s", name)
	}
	output, err := exec.Command(name, args...).CombinedOutput()
	require.NoError(t, err, "%s", output)
}

func ownedELF(t *testing.T) (string, uint64, uint64) {
	t.Helper()
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		t.Skip("ELF fixture generator currently measures Linux/amd64 with GNU tools")
	}
	file := filepath.Join(t.TempDir(), "native.so")
	fixtureCommand(t, "gcc", "-shared", "-fPIC", "-O0", "-g", "-gdwarf-4", "-Wl,--build-id=sha1", "-Wl,-Ttext-segment=0x200000", "-o", file, "testdata/native.c")
	f, err := elf.Open(file)
	require.NoError(t, err)
	defer f.Close()
	symbols, err := f.Symbols()
	require.NoError(t, err)
	var address, offset uint64
	for _, symbol := range symbols {
		if symbol.Name == "native_leaf" {
			address = symbol.Value
		}
	}
	require.NotZero(t, address)
	for _, program := range f.Progs {
		if program.Type == elf.PT_LOAD && address >= program.Vaddr && address-program.Vaddr < program.Filesz {
			offset = address - program.Vaddr + program.Off
		}
	}
	require.NotEqual(t, address, offset, "fixture must exercise nonzero load bias")
	return file, address, offset
}

func TestELFFixture(t *testing.T) {
	file, address, offset := ownedELF(t)
	data, err := os.ReadFile(file)
	require.NoError(t, err)
	first, err := inspect(data, request{Address: address, Kind: "elf_rel_pc"}, defaultLimits())
	require.NoError(t, err)
	require.NotEmpty(t, first.Identity)
	testCases := []struct {
		name    string
		input   request
		invalid bool
	}{
		{name: "AndroidRelPC_Identity", input: request{Address: address, Kind: "elf_rel_pc", Identity: first.Identity, Arch: "x86_64"}},
		{name: "ProfilingOffset_LoadSegment", input: request{Address: offset, Kind: "elf_file_offset"}},
		{name: "WrongBuildID_Rejected", input: request{Address: address, Kind: "elf_rel_pc", Identity: "bad-id"}, invalid: true},
		{name: "WrongABI_Rejected", input: request{Address: address, Kind: "elf_rel_pc", Arch: "arm64"}, invalid: true},
		{name: "WrongAddressKind_Rejected", input: request{Address: address, Kind: "macho_runtime_pc"}, invalid: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			result, err := inspect(data, testCase.input, defaultLimits())
			if testCase.invalid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, address, result.LookupAddress)
			assert.Equal(t, "native_leaf", result.Function)
			assert.Equal(t, "native.c", filepath.Base(result.File))
			assert.Positive(t, result.Line)
		})
	}
}

func TestELFVariants(t *testing.T) {
	file, address, _ := ownedELF(t)
	testCases := []struct {
		name, flag string
		resolves   bool
		bomb       bool
	}{
		{name: "Stripped", flag: "--strip-debug"},
		{name: "Zlib", flag: "--compress-debug-sections=zlib", resolves: true},
		{name: "SeparateDebug", flag: "--only-keep-debug", resolves: true},
		{name: "ZlibDeclaredSizeBomb", flag: "--compress-debug-sections=zlib", bomb: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			variant := filepath.Join(t.TempDir(), "variant.so")
			fixtureCommand(t, "objcopy", testCase.flag, file, variant)
			input, err := os.ReadFile(variant)
			require.NoError(t, err)
			if testCase.bomb {
				parsed, err := elf.NewFile(bytes.NewReader(input))
				require.NoError(t, err)
				found := false
				for _, section := range parsed.Sections {
					if section.Flags&elf.SHF_COMPRESSED != 0 {
						binary.LittleEndian.PutUint64(input[section.Offset+8:section.Offset+16], defaultLimits().MaxDecoded+1)
						found = true
						break
					}
				}
				require.True(t, found, "fixture must contain a compressed section")
				require.NoError(t, parsed.Close())
			}
			result, err := inspect(input, request{Address: address, Kind: "elf_rel_pc"}, defaultLimits())
			if testCase.resolves {
				require.NoError(t, err)
				assert.Equal(t, "native_leaf", result.Function)
			} else {
				require.Error(t, err)
			}
		})
	}
}

func TestCLIAdmission(t *testing.T) {
	file, address, _ := ownedELF(t)
	testCases := []struct {
		name     string
		extra    []string
		rejected bool
	}{
		{name: "Valid"},
		{name: "FileCapBeforeRead", extra: []string{"-max-file-bytes", "64"}, rejected: true},
		{name: "DecodedSectionCap", extra: []string{"-max-decoded-bytes", "1"}, rejected: true},
		{name: "WrongIdentity", extra: []string{"-identity", "not-the-build-id"}, rejected: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var output bytes.Buffer
			args := []string{"-file", file, "-kind", "elf_rel_pc", "-address", fmt.Sprintf("0x%x", address)}
			err := run(append(args, testCase.extra...), &output)
			if testCase.rejected {
				require.Error(t, err)
				assert.Empty(t, output.String())
				return
			}
			require.NoError(t, err)
			assert.Contains(t, output.String(), "native_leaf")
		})
	}
}

func TestMachOFixture(t *testing.T) {
	file := filepath.Join(t.TempDir(), "fixture")
	cmd := exec.Command("go", "build", "-gcflags=all=-N -l", "-ldflags=-compressdwarf=false", "-o", file, "testdata/macho/main.go")
	cmd.Env = append(os.Environ(), "GOOS=darwin", "GOARCH=arm64", "CGO_ENABLED=0", "GOTOOLCHAIN=go1.26.10")
	output, err := cmd.CombinedOutput()
	require.NoError(t, err, "%s", output)
	f, err := macho.Open(file)
	require.NoError(t, err)
	defer f.Close()
	var address uint64
	for _, symbol := range f.Symtab.Syms {
		if symbol.Name == "main.probe" {
			address = symbol.Value
		}
	}
	require.NotZero(t, address)
	data, err := os.ReadFile(file)
	require.NoError(t, err)
	testCases := []struct {
		name    string
		query   request
		invalid bool
	}{
		{name: "Unslid", query: request{Address: address, Kind: "macho_runtime_pc", Arch: "arm64"}},
		{name: "ASLR", query: request{Address: address + 0x400000, Slide: 0x400000, Kind: "macho_runtime_pc"}},
		{name: "WrongABI", query: request{Address: address, Kind: "macho_runtime_pc", Arch: "x86_64"}, invalid: true},
		{name: "WrongUUID", query: request{Address: address, Kind: "macho_runtime_pc", Identity: "wrong-uuid"}, invalid: true},
		{name: "SlideUnderflow", query: request{Address: 1, Slide: 2, Kind: "macho_runtime_pc"}, invalid: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			result, err := inspect(data, testCase.query, defaultLimits())
			if testCase.invalid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, address, result.LookupAddress)
			assert.Equal(t, "main.probe", result.Function)
			assert.Equal(t, "main.go", filepath.Base(result.File))
			assert.Positive(t, result.Line)
			assert.NotEmpty(t, result.Identity, "Mach-O UUID evidence is required")
		})
	}
}

func TestMalformedAndAdmission(t *testing.T) {
	elfHeader := make([]byte, 64)
	copy(elfHeader, []byte{0x7f, 'E', 'L', 'F', 2, 1, 1})
	binary.LittleEndian.PutUint64(elfHeader[40:48], 64)
	binary.LittleEndian.PutUint16(elfHeader[58:60], 64)
	binary.LittleEndian.PutUint16(elfHeader[60:62], 4097)
	machoHeader := make([]byte, 32)
	binary.LittleEndian.PutUint32(machoHeader, 0xfeedfacf)
	binary.LittleEndian.PutUint32(machoHeader[16:20], 1)
	binary.LittleEndian.PutUint32(machoHeader[20:24], 4096)
	testCases := []struct {
		name   string
		data   []byte
		limits limits
	}{
		{name: "Empty", limits: defaultLimits()},
		{name: "TruncatedELF", data: elfHeader[:20], limits: defaultLimits()},
		{name: "HeaderCountBomb", data: elfHeader, limits: defaultLimits()},
		{name: "MachOLoadCommandPastEOF", data: machoHeader, limits: defaultLimits()},
		{name: "FileBudget", data: make([]byte, 33), limits: limits{MaxFile: 32}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := inspect(testCase.data, request{}, testCase.limits)
			require.Error(t, err)
		})
	}
}

func FuzzPreflight(f *testing.F) {
	f.Add([]byte{0x7f, 'E', 'L', 'F'})
	f.Add([]byte{0xcf, 0xfa, 0xed, 0xfe})
	dir := f.TempDir()
	if runtime.GOOS == "linux" && runtime.GOARCH == "amd64" {
		if _, err := exec.LookPath("gcc"); err == nil {
			file := filepath.Join(dir, "seed.so")
			output, err := exec.Command("gcc", "-shared", "-fPIC", "-O0", "-g", "-Wl,--build-id=sha1", "-o", file, "testdata/native.c").CombinedOutput()
			if err != nil {
				f.Fatalf("owned ELF seed: %v: %s", err, output)
			}
			data, err := os.ReadFile(file)
			if err != nil {
				f.Fatal(err)
			}
			f.Add(data)
		}
	}
	file := filepath.Join(dir, "seed-macho")
	cmd := exec.Command("go", "build", "-gcflags=all=-N -l", "-ldflags=-compressdwarf=false", "-o", file, "testdata/macho/main.go")
	cmd.Env = append(os.Environ(), "GOOS=darwin", "GOARCH=arm64", "CGO_ENABLED=0", "GOTOOLCHAIN=go1.26.10")
	output, err := cmd.CombinedOutput()
	if err != nil {
		f.Fatalf("owned Mach-O seed: %v: %s", err, output)
	}
	data, err := os.ReadFile(file)
	if err != nil {
		f.Fatal(err)
	}
	f.Add(data)
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 4<<20 {
			return
		}
		budget := defaultLimits()
		budget.MaxFile, budget.MaxDecoded = 4<<20, 16<<20
		kind := "elf_rel_pc"
		if len(data) >= 4 && string(data[:4]) == "\xcf\xfa\xed\xfe" {
			kind = "macho_runtime_pc"
		}
		_, _ = inspect(data, request{Kind: kind}, budget)
	})
}

func TestMachOSymbolCountBudget(t *testing.T) {
	testCases := []struct {
		name        string
		command     uint32
		size        int
		countOffset int
	}{
		{name: "Symbols", command: 2, size: 24, countOffset: 12},
		{name: "IndirectSymbols", command: 11, size: 80, countOffset: 60},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			data := make([]byte, 32+testCase.size)
			binary.LittleEndian.PutUint32(data, 0xfeedfacf)
			binary.LittleEndian.PutUint32(data[16:20], 1)
			binary.LittleEndian.PutUint32(data[20:24], uint32(testCase.size))
			binary.LittleEndian.PutUint32(data[32:36], testCase.command)
			binary.LittleEndian.PutUint32(data[36:40], uint32(testCase.size))
			binary.LittleEndian.PutUint32(data[32+testCase.countOffset:], ^uint32(0))
			_, err := preflight(data, defaultLimits())
			require.Error(t, err)
		})
	}
}

func TestRangeOverflow(t *testing.T) {
	testCases := []struct {
		name                 string
		offset, size, length uint64
		valid                bool
	}{
		{name: "ExactEnd", offset: 8, size: 8, length: 16, valid: true},
		{name: "OffsetPastEOF", offset: 17, length: 16},
		{name: "AdditionOverflow", offset: ^uint64(0) - 4, size: 16, length: ^uint64(0)},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			assert.Equal(t, testCase.valid, within(testCase.offset, testCase.size, testCase.length))
		})
	}
}

func TestZeroFillCannotBypassDecodedBudget(t *testing.T) {
	elfData := make([]byte, 128)
	copy(elfData, []byte{0x7f, 'E', 'L', 'F', 2, 1, 1})
	binary.LittleEndian.PutUint64(elfData[40:48], 64)
	binary.LittleEndian.PutUint16(elfData[58:60], 64)
	binary.LittleEndian.PutUint16(elfData[60:62], 1)
	binary.LittleEndian.PutUint32(elfData[68:72], 8)
	binary.LittleEndian.PutUint64(elfData[96:104], defaultLimits().MaxDecoded+1)
	machoData := make([]byte, 184)
	binary.LittleEndian.PutUint32(machoData, 0xfeedfacf)
	binary.LittleEndian.PutUint32(machoData[16:20], 1)
	binary.LittleEndian.PutUint32(machoData[20:24], 152)
	binary.LittleEndian.PutUint32(machoData[32:36], 0x19)
	binary.LittleEndian.PutUint32(machoData[36:40], 152)
	binary.LittleEndian.PutUint32(machoData[96:100], 1)
	copy(machoData[104:120], "__debug_info")
	binary.LittleEndian.PutUint64(machoData[144:152], defaultLimits().MaxDecoded+1)
	binary.LittleEndian.PutUint32(machoData[168:172], 1)
	testCases := []struct {
		name string
		data []byte
	}{{name: "ELFNOBITS", data: elfData}, {name: "MachOZeroFill", data: machoData}}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) { _, err := preflight(testCase.data, defaultLimits()); require.Error(t, err) })
	}
}
