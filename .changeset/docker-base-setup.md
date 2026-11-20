---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

feat(devkit): `docker.baseSetup: false` leaves the image's base step to a prepared base image

Every generated Dockerfile runs `apt-get update`, `upgrade` and `install` for `ca-certificates`, `tzdata` and `tini`,
then sets the time zone. A builder with no layer cache (buildah on `vfs`) repeated that on every build, and a CI that
wanted to skip it had to rewrite the `base` section and match the `apt-get` line as text, which went stale without a
sign when `tini` joined the list.

- `docker.baseSetup: false` writes the `base` section without those two steps. `docker.image` then has to name the
  prepared image, for every architecture when it is an object, or the config is refused: the pinned default has no
  `tini`, which the entrypoint runs. A variant takes it too.
- `@akanjs/devkit/akanConfig` exports `DOCKER_BASE_RUNS`, the steps themselves, and `DOCKER_BASE_PACKAGES`, the
  package list, so the prepared image is built from what the generator would have run.

**Upgrading.** Nothing changes without the option: the generated Dockerfile is the same text. A tool that edited the
`base` section to swap in a prepared image can set `image` and `baseSetup: false` instead, and should tag that image by
`DOCKER_BASE_RUNS` so a release that changes the step builds a new one.
