package main

import "encoding/binary"

type elfLayout struct {
	phoff, shoff, phnum, shnum                          int
	wordSize, sectionSize, programSize, compressionSize uint64
	sectionOffset, programOffset, programFileSize       uint64
}

func elfLayoutFor(data []byte) (elfLayout, error) {
	if len(data) < 16 || data[5] != 1 {
		return elfLayout{}, reject("unsupported or truncated little-endian ELF header")
	}
	switch data[4] {
	case 1:
		if len(data) >= 52 {
			return elfLayout{28, 32, 44, 48, 4, 40, 32, 12, 16, 4, 16}, nil
		}
	case 2:
		if len(data) >= 64 {
			return elfLayout{32, 40, 56, 60, 8, 64, 56, 24, 24, 8, 32}, nil
		}
	}
	return elfLayout{}, reject("unsupported or truncated ELF class")
}

func (layout elfLayout) word(data []byte) uint64 {
	if layout.wordSize == 4 {
		return uint64(binary.LittleEndian.Uint32(data))
	}
	return binary.LittleEndian.Uint64(data)
}
