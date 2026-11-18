// @id: output-flood
// @title: Endless output
// @expect: Output Limit Exceeded
// @sr: SR-11
// @summary: Prints forever as fast as possible. Output is capped, the process is killed, and the platform stays healthy.
#include <cstdio>

int main() {
    for (unsigned long long i = 0;; i++) {
        std::printf("line %llu: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n", i);
    }
}
