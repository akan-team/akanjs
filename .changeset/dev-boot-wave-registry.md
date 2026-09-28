---
"@akanjs/cli": patch
"@akanjs/devkit": patch
"akanjs": patch
---

fix(dev): `akan start` budgets an app's boot at 1.8GB, and starts the next wave once its boot builds settle

- The default boot wave divides half the memory budget by 1.8GB per app: the SSR registry's boot build adds a build
  worker to every boot, and apps/akan's whole dev host peaks at about 1.76GB. A small container staggers its apps
  instead of overlapping more peaks than it holds.
- The next wave starts once each app of the previous one serves and its builder's boot builds have settled — the SSR
  registry's, and CSR's when `AKAN_DEV_CSR_REBUILD=1` arms it — or 30 seconds after it serves. The app shows as ready,
  and `--open` opens it, as soon as it serves.
