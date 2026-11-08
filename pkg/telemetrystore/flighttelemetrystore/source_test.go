package flighttelemetrystore

import "github.com/apache/arrow-go/v18/arrow"

// sliceSource streams the batches it was given, failing after the first when fail is set, and
// counts its releases.
type sliceSource struct {
	batches  []arrow.RecordBatch
	next     int
	fail     error
	err      error
	released int
}

func newSliceSource(batches ...arrow.RecordBatch) *sliceSource {
	return &sliceSource{batches: batches}
}

func (s *sliceSource) Schema() *arrow.Schema { return s.batches[0].Schema() }

func (s *sliceSource) Next() bool {
	if s.fail != nil && s.next == 1 {
		s.err = s.fail
		return false
	}
	if s.next >= len(s.batches) {
		return false
	}
	s.next++
	return true
}

func (s *sliceSource) RecordBatch() arrow.RecordBatch { return s.batches[s.next-1] }

func (s *sliceSource) Err() error { return s.err }

func (s *sliceSource) Release() {
	s.released++
	for _, batch := range s.batches {
		batch.Release()
	}
	s.batches = s.batches[:1]
}
