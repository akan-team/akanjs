---
"@akanjs/devkit": patch
---

`akan build` bakes into its page and CSR bundles the `AKAN_PUBLIC_REPO_NAME` and `AKAN_PUBLIC_SERVE_DOMAIN` its Dockerfile carries, read from the workspace `.env` as `AKAN_PUBLIC_ENV` already was. A shell that exported a different value used to win in the bundles alone, so a cloud CSR bundle or native app dialed `<app>-<env>.<the shell's domain>` while the image served the `.env`'s. When the `.env` outranks a value the shell exported for one of the three, the build now says which ones and what it used (`AKAN_PUBLIC_ENV` from `--env` excepted).
