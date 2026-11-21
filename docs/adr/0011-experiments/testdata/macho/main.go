package main

//go:noinline
func probe(value int) int {
	result := value + 11
	return result
}

func main() { println(probe(3)) }
