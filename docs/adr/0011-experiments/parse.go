package main

import (
	"bytes"
	"debug/dwarf"
	"debug/elf"
	"debug/macho"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"runtime"
	"strings"
	"time"
)

type request struct {
	Address, Slide       uint64
	Kind, Arch, Identity string
}
type result struct {
	Format, Arch, Identity                 string
	LookupAddress                          uint64
	Function, File                         string
	Line, Functions, Lines, IndexJSONBytes int
	FileBytes                              int
	InspectNs                              int64
	AllocatedBytes                         uint64
}

func inspect(input []byte, query request, budget limits) (output *result, err error) {
	defer func() {
		if value := recover(); value != nil {
			output = nil
			err = reject("parser panic rejected")
		}
	}()
	started := time.Now()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	format, err := preflight(input, budget)
	if err != nil {
		return nil, err
	}
	output = &result{Format: format, FileBytes: len(input)}
	var data *dwarf.Data
	if format == "elf" {
		data, err = readELF(input, query, output)
	} else {
		data, err = readMachO(input, query, output)
	}
	if err != nil {
		return nil, err
	}
	if query.Arch != "" && query.Arch != output.Arch {
		return nil, reject("architecture mismatch")
	}
	if query.Identity != "" && strings.ToLower(strings.ReplaceAll(query.Identity, "-", "")) != output.Identity {
		return nil, reject("binary identity mismatch")
	}
	index, err := makeIndex(data, budget)
	if err != nil {
		return nil, err
	}
	index.lookup(output.LookupAddress, output)
	encoded, err := json.Marshal(index)
	if err != nil {
		return nil, err
	}
	output.Functions, output.Lines, output.IndexJSONBytes = len(index.Functions), len(index.Lines), len(encoded)
	runtime.ReadMemStats(&after)
	output.AllocatedBytes = after.TotalAlloc - before.TotalAlloc
	output.InspectNs = time.Since(started).Nanoseconds()
	return output, nil
}

func readELF(input []byte, query request, output *result) (*dwarf.Data, error) {
	file, err := elf.NewFile(bytes.NewReader(input))
	if err != nil {
		return nil, err
	}
	defer file.Close()
	switch file.Machine {
	case elf.EM_X86_64:
		output.Arch = "x86_64"
	case elf.EM_386:
		output.Arch = "x86"
	case elf.EM_AARCH64:
		output.Arch = "arm64"
	default:
		return nil, reject("unsupported ELF architecture")
	}
	for _, section := range file.Sections {
		if strings.HasPrefix(section.Name, ".zdebug_") {
			// Go also accepts the legacy GNU envelope; reject it until independently measured.
			return nil, reject("legacy GNU compressed sections are outside this experiment")
		}
	}
	if note := file.Section(".note.gnu.build-id"); note != nil {
		data, err := note.Data()
		if err != nil {
			return nil, err
		}
		output.Identity, err = buildID(data)
		if err != nil {
			return nil, err
		}
	}
	output.LookupAddress = query.Address
	switch query.Kind {
	case "elf_rel_pc":
	case "elf_file_offset":
		found := false
		for _, program := range file.Progs {
			if program.Type == elf.PT_LOAD && query.Address >= program.Off && query.Address-program.Off < program.Filesz {
				delta := query.Address - program.Off
				if program.Vaddr > ^uint64(0)-delta {
					return nil, reject("address overflow")
				}
				output.LookupAddress, found = program.Vaddr+delta, true
				break
			}
		}
		if !found {
			return nil, reject("ELF file offset is outside PT_LOAD")
		}
	default:
		return nil, reject("address kind does not match ELF")
	}
	return file.DWARF()
}

func buildID(data []byte) (string, error) {
	for offset := uint64(0); offset < uint64(len(data)); {
		if !within(offset, 12, uint64(len(data))) {
			return "", reject("truncated ELF note")
		}
		header := data[offset : offset+12]
		nameSize, descSize := uint64(binary.LittleEndian.Uint32(header[:4])), uint64(binary.LittleEndian.Uint32(header[4:8]))
		nameOffset := offset + 12
		descOffset := nameOffset + (nameSize+3)&^uint64(3)
		if !within(nameOffset, nameSize, uint64(len(data))) || !within(descOffset, descSize, uint64(len(data))) {
			return "", reject("ELF note length exceeds file")
		}
		if binary.LittleEndian.Uint32(header[8:12]) == 3 && string(data[nameOffset:nameOffset+nameSize]) == "GNU\x00" {
			return hex.EncodeToString(data[descOffset : descOffset+descSize]), nil
		}
		offset = descOffset + (descSize+3)&^uint64(3)
	}
	return "", reject("GNU build ID note missing")
}

func readMachO(input []byte, query request, output *result) (*dwarf.Data, error) {
	file, err := macho.NewFile(bytes.NewReader(input))
	if err != nil {
		return nil, err
	}
	defer file.Close()
	switch file.Cpu {
	case macho.CpuAmd64:
		output.Arch = "x86_64"
	case macho.CpuArm64:
		output.Arch = "arm64"
	default:
		return nil, reject("unsupported Mach-O architecture")
	}
	for _, load := range file.Loads {
		raw := load.Raw()
		if len(raw) >= 24 && binary.LittleEndian.Uint32(raw[:4]) == 0x1b {
			output.Identity = hex.EncodeToString(raw[8:24])
		}
	}
	if query.Kind != "macho_runtime_pc" || query.Address < query.Slide {
		return nil, reject("invalid Mach-O address kind/slide")
	}
	output.LookupAddress = query.Address - query.Slide
	return file.DWARF()
}
