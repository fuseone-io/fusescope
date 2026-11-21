package main

import (
	"debug/dwarf"
	"io"
	"path/filepath"
	"sort"
)

type functionRange struct {
	Low, High uint64
	Name      string
}
type sourceRange struct {
	Low, High uint64
	File      string
	Line      int
}
type symbolIndex struct {
	Functions []functionRange
	Lines     []sourceRange
}

func makeIndex(data *dwarf.Data, budget limits) (*symbolIndex, error) {
	index := &symbolIndex{}
	reader := data.Reader()
	entries := 0
	for {
		entry, err := reader.Next()
		if err != nil {
			return nil, err
		}
		if entry == nil {
			break
		}
		entries++
		if entries > budget.MaxEntries {
			return nil, reject("DWARF entry budget exceeded")
		}
		if entry.Tag == dwarf.TagSubprogram {
			name, _ := entry.Val(dwarf.AttrName).(string)
			ranges, err := data.Ranges(entry)
			if err != nil {
				return nil, err
			}
			for _, span := range ranges {
				if len(index.Functions) >= budget.MaxEntries {
					return nil, reject("function index budget exceeded")
				}
				index.Functions = append(index.Functions, functionRange{Low: span[0], High: span[1], Name: name})
			}
		}
		if entry.Tag == dwarf.TagCompileUnit {
			if err := index.addLines(data, entry, budget); err != nil {
				return nil, err
			}
		}
	}
	sort.Slice(index.Functions, func(i, j int) bool { return index.Functions[i].Low < index.Functions[j].Low })
	sort.Slice(index.Lines, func(i, j int) bool { return index.Lines[i].Low < index.Lines[j].Low })
	return index, nil
}

func (index *symbolIndex) addLines(data *dwarf.Data, unit *dwarf.Entry, budget limits) error {
	reader, err := data.LineReader(unit)
	if err != nil || reader == nil {
		return err
	}
	var previous *dwarf.LineEntry
	for {
		var entry dwarf.LineEntry
		err := reader.Next(&entry)
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if previous != nil && previous.File != nil && entry.Address > previous.Address {
			if len(index.Lines) >= budget.MaxEntries {
				return reject("line index budget exceeded")
			}
			index.Lines = append(index.Lines, sourceRange{Low: previous.Address, High: entry.Address, File: filepath.Base(previous.File.Name), Line: previous.Line})
		}
		if entry.EndSequence {
			previous = nil
		} else {
			previous = &entry
		}
	}
	return nil
}

func (index *symbolIndex) lookup(address uint64, result *result) {
	for _, function := range index.Functions {
		if function.Low <= address && address < function.High {
			result.Function = function.Name
			break
		}
	}
	for _, line := range index.Lines {
		if line.Low <= address && address < line.High {
			result.File, result.Line = line.File, line.Line
			break
		}
	}
}
