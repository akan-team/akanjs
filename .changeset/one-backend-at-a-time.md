---
"akanjs": patch
"@akanjs/devkit": patch
---

`akan start` replaces its backend one restart at a time, so saves in quick succession can no longer leave a second
gateway holding the port.

- A save whose restart came due while the previous one still waited for the old backend to exit used to signal the
  same process again and then spawn a second backend beside the first. The host kept the one that lost the port,
  restarted it on every save, and the untracked one went on answering. A restart that comes due now runs after the
  one in flight, and a config or metadata recycle and `akan start`'s shutdown wait for it too.
- A gateway that cannot bind its port no longer reports itself ready while it waits for its replicas to exit.
