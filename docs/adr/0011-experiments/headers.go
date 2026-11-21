package main

import (
	"encoding/binary"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

type limits struct {
	MaxFile, MaxDecoded    uint64
	MaxHeaders, MaxEntries int
}

func defaultLimits() limits {
	return limits{MaxFile: 32 << 20, MaxDecoded: 64 << 20, MaxHeaders: 4096, MaxEntries: 200000}
}

func reject(format string, args ...any) error {
	return errors.NewInvalidInputf(errors.CodeInvalidInput, format, args...)
}

func within(offset, size, length uint64) bool { return offset <= length && size <= length-offset }

func preflight(data []byte, budget limits) (string, error) {
	if uint64(len(data)) > budget.MaxFile {
		return "", reject("file budget exceeded")
	}
	if len(data) < 4 {
		return "", reject("truncated magic")
	}
	switch string(data[:4]) {
	case "\x7fELF":
		return "elf", checkELF(data, budget)
	case "\xcf\xfa\xed\xfe":
		return "macho", checkMachO(data, budget)
	default:
		return "", reject("unsupported format: only little-endian ELF64 and thin Mach-O64")
	}
}

func checkELF(data []byte, budget limits) error {
	if len(data) < 64 || data[4] != 2 || data[5] != 1 {
		return reject("unsupported or truncated ELF64 header")
	}
	order := binary.LittleEndian
	length := uint64(len(data))
	shoff, phoff := order.Uint64(data[40:48]), order.Uint64(data[32:40])
	shnum, phnum := int(order.Uint16(data[60:62])), int(order.Uint16(data[56:58]))
	if shnum == 0 || shnum > budget.MaxHeaders || phnum > budget.MaxHeaders || order.Uint16(data[58:60]) != 64 || (phnum > 0 && order.Uint16(data[54:56]) != 56) {
		return reject("unsupported ELF header count/entry size, including extended numbering")
	}
	if !within(shoff, uint64(shnum)*64, length) || !within(phoff, uint64(phnum)*56, length) {
		return reject("ELF headers exceed file size")
	}
	var decoded uint64
	for i := 0; i < shnum; i++ {
		header := data[shoff+uint64(i)*64 : shoff+uint64(i+1)*64]
		kind, flags := order.Uint32(header[4:8]), order.Uint64(header[8:16])
		offset, size := order.Uint64(header[24:32]), order.Uint64(header[32:40])
		if kind == 8 {
			if size > budget.MaxDecoded || decoded > budget.MaxDecoded-size {
				return reject("ELF zero-fill section budget exceeded")
			}
			decoded += size
			continue
		} // SHT_NOBITS occupies memory, not file bytes.
		if !within(offset, size, length) {
			return reject("ELF section exceeds file size")
		}
		if flags&0x800 != 0 {
			if size < 24 || order.Uint32(data[offset:offset+4]) != 1 {
				return reject("only ELF zlib compression is tested")
			}
			size = order.Uint64(data[offset+8 : offset+16])
		}
		if size > budget.MaxDecoded || decoded > budget.MaxDecoded-size {
			return reject("decoded section budget exceeded")
		}
		decoded += size
	}
	for i := 0; i < phnum; i++ {
		header := data[phoff+uint64(i)*56 : phoff+uint64(i+1)*56]
		offset, size := order.Uint64(header[8:16]), order.Uint64(header[32:40])
		if size > 0 && !within(offset, size, length) {
			return reject("ELF segment exceeds file size")
		}
	}
	return nil
}

func checkMachO(data []byte, budget limits) error {
	if len(data) < 32 {
		return reject("truncated Mach-O64 header")
	}
	order := binary.LittleEndian
	count, size := order.Uint32(data[16:20]), uint64(order.Uint32(data[20:24]))
	if uint64(count) > uint64(budget.MaxHeaders) || !within(32, size, uint64(len(data))) {
		return reject("Mach-O load commands exceed budget/file size")
	}
	end, offset := 32+size, uint64(32)
	var decoded, sectionCount uint64
	for i := uint32(0); i < count; i++ {
		if !within(offset, 8, end) {
			return reject("truncated Mach-O load command")
		}
		kind, commandSize := order.Uint32(data[offset:offset+4]), uint64(order.Uint32(data[offset+4:offset+8]))
		if commandSize < 8 || !within(offset, commandSize, end) {
			return reject("invalid Mach-O load command size")
		}
		command := data[offset : offset+commandSize]
		if err := checkMachOTables(kind, command, uint64(len(data)), budget); err != nil {
			return err
		}
		if kind == 0x19 {
			if err := checkMachOSegment(command, uint64(len(data)), budget, &decoded, &sectionCount); err != nil {
				return err
			}
		}
		offset += commandSize
	}
	if offset != end {
		return reject("Mach-O command count/size mismatch")
	}
	return nil
}

func checkMachOTables(kind uint32, command []byte, length uint64, budget limits) error {
	order := binary.LittleEndian
	if kind == 2 { // LC_SYMTAB: debug/macho allocates from nsyms during NewFile.
		if len(command) < 24 {
			return reject("truncated Mach-O symbol command")
		}
		offset, count := uint64(order.Uint32(command[8:12])), uint64(order.Uint32(command[12:16]))
		stringsOffset, size := uint64(order.Uint32(command[16:20])), uint64(order.Uint32(command[20:24]))
		if count > uint64(budget.MaxEntries) || !within(offset, count*16, length) || !within(stringsOffset, size, length) {
			return reject("Mach-O symbol table exceeds budget/file")
		}
	}
	if kind == 11 {
		if len(command) < 80 {
			return reject("truncated Mach-O dynamic symbol command")
		}
		offset, count := uint64(order.Uint32(command[56:60])), uint64(order.Uint32(command[60:64]))
		if count > uint64(budget.MaxEntries) || !within(offset, count*4, length) {
			return reject("Mach-O indirect symbols exceed budget/file")
		}
	}
	return nil
}

func checkMachOSegment(command []byte, length uint64, budget limits, decoded, sectionCount *uint64) error {
	order := binary.LittleEndian
	if len(command) < 72 {
		return reject("truncated Mach-O segment")
	}
	sections := uint64(order.Uint32(command[64:68]))
	if sections > uint64(budget.MaxHeaders) || *sectionCount > uint64(budget.MaxHeaders)-sections || !within(72, sections*80, uint64(len(command))) {
		return reject("Mach-O section count exceeds command/budget")
	}
	*sectionCount += sections
	for j := uint64(0); j < sections; j++ {
		header := command[72+j*80 : 72+(j+1)*80]
		name := strings.TrimRight(string(header[:16]), "\x00")
		if strings.HasPrefix(name, "__zdebug_") {
			return reject("compressed Mach-O is outside this experiment")
		}
		relocationOffset, count := uint64(order.Uint32(header[56:60])), uint64(order.Uint32(header[60:64]))
		if count > uint64(budget.MaxEntries) || !within(relocationOffset, count*8, length) {
			return reject("Mach-O relocations exceed budget/file")
		}
		size, offset := order.Uint64(header[40:48]), uint64(order.Uint32(header[48:52]))
		kind := order.Uint32(header[64:68]) & 0xff
		if size > budget.MaxDecoded || *decoded > budget.MaxDecoded-size {
			return reject("Mach-O section budget exceeded")
		}
		*decoded += size
		if kind == 1 || kind == 12 || kind == 18 {
			continue
		}
		if !within(offset, size, length) {
			return reject("Mach-O section exceeds file size")
		}
	}
	return nil
}
