---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": patch
---

`docker.variants.<name>.profile` lets one `akan build` serve two images that run on different server env files.
The build carries `env/env.server.<env>.<profile>.ts` beside the environment's own env file, held to the checks a
`--profile` build runs (no secret value, before any build phase), and writes `ENV AKAN_ENV_PROFILE=<profile>` into
that variant's Dockerfile in place of `AKAN_ENV_NAMES`. A server started with `AKAN_ENV_PROFILE` loads the profile's
env, never evaluates the other file, and starts without the secret env values the image's own Dockerfile lists; a
profile the build did not carry stops the boot with the new `envProfileUnbuilt` code. Nothing changes for an app
that names no profile, and `--profile` builds are as before.

`DockerVariantOption` gains `profile?: string`. `docker.env` and a variant's `env` refuse `AKAN_ENV_PROFILE`, which
the build has to know: name it as the variant's `profile`.
