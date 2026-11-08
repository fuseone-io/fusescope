package flighttelemetrystore

import (
	"io"

	"github.com/apache/arrow-go/v18/arrow/flight"
)

// actionStream reads the results of an engine action as one byte stream: the action splits an
// Arrow IPC stream in order across its result bodies.
type actionStream struct {
	results flight.FlightService_DoActionClient
	pending []byte
}

func (s *actionStream) Read(p []byte) (int, error) {
	for len(s.pending) == 0 {
		result, err := s.results.Recv()
		if err != nil {
			return 0, err
		}
		s.pending = result.GetBody()
	}
	n := copy(p, s.pending)
	s.pending = s.pending[n:]
	return n, nil
}

var _ io.Reader = (*actionStream)(nil)
