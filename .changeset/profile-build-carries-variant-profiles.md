---
"@akanjs/devkit": patch
---

`akan build --profile <name>` carries the env profiles its `docker.variants` name, beside its own. In 3.3.0-rc.71 such
a build carried only `--profile`'s file while `Dockerfile.<variant>` still set `AKAN_ENV_PROFILE`, so the variant's
image refused to boot with `envProfileUnbuilt`. With no `AKAN_ENV_PROFILE`, or with the `--profile` name, the server
starts on `--profile`'s env file as before.
