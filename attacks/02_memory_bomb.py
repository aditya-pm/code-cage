# @id: memory-bomb
# @title: Memory exhaustion
# @expect: Memory Limit Exceeded
# @sr: SR-4
# @summary: Allocates 50 MB chunks and touches every page until the cgroup memory limit stops it.
hoard = []
mb = 0
while True:
    block = bytearray(50 * 1024 * 1024)   # 50 MB
    for i in range(0, len(block), 4096):  # touch every page so it is really resident
        block[i] = 1
    hoard.append(block)
    mb += 50
    print(f"holding {mb} MB", flush=True)
