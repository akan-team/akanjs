---
"@akanjs/native": patch
---

`single-instance` on Windows no longer hands a launch's arguments to a pipe another account created. The pipe's name is a hash of the account and the app id, so another account on a shared PC or Remote Desktop host could create it first, receive a second launch's arguments (a magic-link or OAuth deep link among them) and keep the app from starting. A launch that finds the name taken now reads the pipe's owner before it sends anything, and connects for that at the anonymous impersonation level: it hands over only to a pipe its own account or an elevated launch owns. A pipe another account owns, or one that cannot be opened within 1.5 s to see whose it is, gets nothing, and the app starts without the instance lock and logs why. One side effect: once a frozen instance has no free pipe instance left (from the third launch on), a later launch starts a second copy instead of exiting.
