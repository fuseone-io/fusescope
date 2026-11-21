package main

import (
	"debug/elf"
	"encoding/binary"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestELF32Fixture(t *testing.T) {
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		t.Skip("requires GNU x86 cross assembler/linker")
	}
	dir := t.TempDir()
	object, library := filepath.Join(dir, "native.o"), filepath.Join(dir, "native.so")
	fixtureCommand(t, "gcc", "-m32", "-fPIC", "-O0", "-g", "-gdwarf-4", "-c", "testdata/native.c", "-o", object)
	fixtureCommand(t, "ld", "-m", "elf_i386", "-shared", "--build-id=sha1", "-Ttext-segment=0x200000", object, "-o", library)
	file, err := elf.Open(library)
	require.NoError(t, err)
	defer file.Close()
	symbols, err := file.Symbols()
	require.NoError(t, err)
	var address, offset uint64
	for _, symbol := range symbols {
		if symbol.Name == "native_leaf" {
			address = symbol.Value
		}
	}
	require.NotZero(t, address)
	for _, program := range file.Progs {
		if program.Type == elf.PT_LOAD && address >= program.Vaddr && address-program.Vaddr < program.Filesz {
			offset = address - program.Vaddr + program.Off
		}
	}
	require.NotEqual(t, address, offset)
	testCases := []struct {
		name, kind string
		address    uint64
		compressed bool
	}{
		{name: "RelPC", kind: "elf_rel_pc", address: address},
		{name: "FileOffset", kind: "elf_file_offset", address: offset},
		{name: "Zlib", kind: "elf_rel_pc", address: address, compressed: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			path := library
			if testCase.compressed {
				path = filepath.Join(dir, "compressed.so")
				fixtureCommand(t, "objcopy", "--compress-debug-sections=zlib", library, path)
			}
			data, err := os.ReadFile(path)
			require.NoError(t, err)
			result, err := inspect(data, request{Address: testCase.address, Kind: testCase.kind, Arch: "x86"}, defaultLimits())
			require.NoError(t, err)
			assert.Equal(t, address, result.LookupAddress)
			assert.Equal(t, "native_leaf", result.Function)
			assert.NotEmpty(t, result.Identity)
			assert.Positive(t, result.Line)
		})
	}
}

func TestELF32Admission(t *testing.T) {
	testCases := []struct {
		name    string
		mutate  func([]byte)
		invalid bool
	}{
		{name: "EmptySection_WithinBudget", mutate: func([]byte) {}},
		{name: "TruncatedTable_Rejected", mutate: func(data []byte) { binary.LittleEndian.PutUint32(data[32:36], 80) }, invalid: true},
		{name: "ZeroFillBudget_Rejected", mutate: func(data []byte) {
			binary.LittleEndian.PutUint32(data[56:60], 8)
			binary.LittleEndian.PutUint32(data[72:76], 65<<20)
		}, invalid: true},
		{name: "CompressedExpansion_Rejected", mutate: func(data []byte) {
			binary.LittleEndian.PutUint32(data[60:64], 0x800)
			binary.LittleEndian.PutUint32(data[68:72], 92)
			binary.LittleEndian.PutUint32(data[72:76], 12)
			binary.LittleEndian.PutUint32(data[92:96], 1)
			binary.LittleEndian.PutUint32(data[96:100], 65<<20)
		}, invalid: true},
		{name: "TruncatedCompression_Rejected", mutate: func(data []byte) {
			binary.LittleEndian.PutUint32(data[60:64], 0x800)
			binary.LittleEndian.PutUint32(data[68:72], 100)
			binary.LittleEndian.PutUint32(data[72:76], 4)
		}, invalid: true},
		{name: "BigEndian_Rejected", mutate: func(data []byte) { data[5] = 2 }, invalid: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			data := make([]byte, 104)
			copy(data, "\x7fELF")
			data[4], data[5] = 1, 1
			binary.LittleEndian.PutUint32(data[32:36], 52)
			binary.LittleEndian.PutUint16(data[46:48], 40)
			binary.LittleEndian.PutUint16(data[48:50], 1)
			testCase.mutate(data)
			err := checkELF(data, defaultLimits())
			if testCase.invalid {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
