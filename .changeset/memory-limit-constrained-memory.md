---
"akanjs": patch
---

The memory ceilings Akan.js derives from a container's limit (the RSC worker's recycle threshold, the dev host's builder ceiling, `akan start`'s boot concurrency) now read it with `process.constrainedMemory()`, which follows the process's own cgroup. A container started with `--cgroupns=host`, or a server under a systemd unit with `MemoryMax=`, used to report no limit; `/sys/fs/cgroup/memory.max` is read only when Bun finds none.
