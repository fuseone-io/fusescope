#!/usr/bin/env bash
set -euo pipefail
experiment_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
output_dir=${1:?usage: generate-cpp.sh OUTPUT_DIRECTORY}
mkdir -p -- "$output_dir"
output_dir=$(cd -- "$output_dir" && pwd)
python3 - "$experiment_dir/testdata/native.cpp" "$output_dir/large-native.cpp" <<'PY'
from pathlib import Path
import sys
source = Path(sys.argv[1]).read_text()
source += "\n".join(f"template int native_extra<{index}>(int);" for index in range(10000))
Path(sys.argv[2]).write_text(source + "\n")
PY
for optimization in 0 2; do
  g++ -shared -fPIC "-O$optimization" -g -gdwarf-5 -Wl,--build-id=sha1 \
    -Wl,-Ttext-segment=0x200000 -o "$output_dir/cpp-o$optimization.so" "$output_dir/large-native.cpp"
  objcopy --compress-debug-sections=zlib "$output_dir/cpp-o$optimization.so" "$output_dir/cpp-o$optimization-zlib.so"
done
GOTOOLCHAIN=go1.26.10 go build -o "$output_dir/inspect" "$experiment_dir"
{
  g++ --version | head -n 1
  objcopy --version | head -n 1
  GOTOOLCHAIN=go1.26.10 go version
  uname -srmo
} > "$output_dir/toolchain.txt"
