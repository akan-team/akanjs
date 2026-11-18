---
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

The generated image starts the server under an init, and the runtime guide covers a device on a LAN.

The Dockerfile `akan build` writes now installs `tini` and ends in `ENTRYPOINT ["tini","-s","--"]` before its `CMD`. With `bun` as PID 1, a process whose parent died first (the `ffmpeg` of a killed `sh -c '… | ffmpeg'`) was re-parented to it and stayed `<defunct>` for the life of the container, because Bun never waits for a child it did not start. tini reaps them, passes signals on to the server and exits with its code; `-s` keeps that working under `docker run --init` or a shared process namespace. `docker.command` is still the `CMD`, and `docker run <image> bun main.js ops …` runs as before. An app whose `docker` is a whole Dockerfile is not changed and adds an init itself.

The runtime guide gains two things. The image section says a device node needs its group as well as `--device` (`--group-add` with the host's numeric gid, or `supplementalGroups` in a pod), since the server is uid 1000 with no other group. A new section, "An Image On A Device", is the recipe for a board reached by IP with no domain: build `--env main` rather than `local`, what the serve domain is for when nothing resolves it, `AKAN_PUBLIC_OPERATION_MODE=edge`, the secrets to hand over, the two directories to put on volumes (`/workspace/sqlite`, `/workspace/local`), and that a browser session needs HTTPS outside operation mode `local`.

The guide's `runtimeRule-2.md` reference is 3987 bytes larger, and its budget is raised to match.
