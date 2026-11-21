#!/usr/bin/env bash
set -euo pipefail

experiment_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
experiment_root=$(cd -- "$experiment_dir/../../.." && pwd)
output_dir=${1:?usage: generate.sh OUTPUT_DIRECTORY}
mkdir -p -- "$output_dir"
output_dir=$(cd -- "$output_dir" && pwd)
cd -- "$experiment_root"

gcc -shared -fPIC -O0 -g -gdwarf-4 -Wl,--build-id=sha1 -Wl,-Ttext-segment=0x200000 \
  -o "$output_dir/native.so" "$experiment_dir/testdata/native.c"
objcopy --only-keep-debug "$output_dir/native.so" "$output_dir/native.debug"
objcopy --strip-debug "$output_dir/native.so" "$output_dir/native-stripped.so"
objcopy --compress-debug-sections=zlib "$output_dir/native.so" "$output_dir/native-zlib.so"
gcc -shared -fPIC -O0 -g -gdwarf-5 -Wl,--build-id=sha1 -Wl,-Ttext-segment=0x200000 \
  -o "$output_dir/native-dwarf5.so" "$experiment_dir/testdata/native.c"

python3 - "$output_dir/large-native.c" <<'PY'
import sys
with open(sys.argv[1], "w", encoding="utf-8") as source:
    source.write("int native_leaf(int value) { return value + 7; }\n")
    for index in range(10000):
        source.write(f"int native_extra_{index}(int value) {{\n int result = value + {index};\n return result;\n}}\n")
PY
gcc -shared -fPIC -O0 -g -gdwarf-5 -Wl,--build-id=sha1 -Wl,-Ttext-segment=0x200000 \
  -o "$output_dir/native-large.so" "$output_dir/large-native.c"

GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 GOTOOLCHAIN=go1.26.10 \
  go build -gcflags='all=-N -l' -ldflags='-compressdwarf=false' \
  -o "$output_dir/macho-arm64" "$experiment_dir/testdata/macho/main.go"
GOTOOLCHAIN=go1.26.10 go build -o "$output_dir/inspect" ./docs/adr/0011-experiments

printf 'ELF native_leaf: '
nm -D --defined-only "$output_dir/native.so" | awk '$3=="native_leaf" { address=$1 } END { print "0x"address }'
printf 'Mach-O main.probe: '
GOTOOLCHAIN=go1.26.10 go tool nm "$output_dir/macho-arm64" | awk '$3=="main.probe" { address=$1 } END { print "0x"address }'
