---
"akanjs": minor
---

A desktop build stops on a server addon that would not load on a user's computer

Before it copies the server, a desktop build reads every `.node` file in it by package. A package with no binary for the
target OS and CPU, a binary that links a library by an absolute path outside the system (a ROS install under `/opt`,
Homebrew's prefix) or names such an rpath, and a package with a `binding.gyp` that its install never compiled (Bun runs
no install script of an untrusted package: add it to `trustedDependencies`) are listed and stop the build, instead of
failing at the first `require` on the user's computer. An addon node-gyp compiled on the build machine only warns.
