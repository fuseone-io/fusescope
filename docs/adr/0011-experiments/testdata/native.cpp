template <int N> __attribute__((noinline)) int native_extra(int value) {
    int adjusted = value + N;
    return adjusted * 3;
}

inline __attribute__((always_inline)) int native_inline(int value) {
    return value + 17;
}

extern "C" __attribute__((noinline)) int native_leaf(int value) {
    return native_inline(value);
}
