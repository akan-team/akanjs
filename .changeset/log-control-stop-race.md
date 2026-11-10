---
"akanjs": patch
---

A server stopped while its log control socket was still starting no longer leaves that socket listening. `akan logs` then found a socket nothing owned, and it kept serving a closed log hub until the process exited. Starts and stops on one control socket path now take turns, so a start whose log hub was closed meanwhile binds nothing or closes what it bound before a restart's open looks, and the restarted server gets its own socket. A socket that fails after binding is closed before the error surfaces. Stopping a control socket that never bound no longer unlinks the live socket of another server in the same runtime folder.
