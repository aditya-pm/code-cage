// @id: infinite-loop
// @title: Infinite loop
// @expect: Time Limit Exceeded
// @sr: SR-7, SR-5
// @summary: Spins forever at 100% CPU. The wall-clock limit must kill it, and the CPU quota keeps the host responsive meanwhile.
#include <cstdio>

int main() {
    std::puts("Spinning forever... try and stop me.");
    std::fflush(stdout);
    volatile unsigned long long n = 0;
    while (true) { n++; }
}
