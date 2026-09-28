---
"@akanjs/cli": patch
"@akanjs/devkit": patch
"akanjs": patch
---

fix(dev): `akan start` budgets an app's boot at 1.8GB and waits for its SSR registry before the next wave

- The default boot wave divides half the memory budget by 1.8GB per app, up from 900MB: the SSR registry's boot build
  added a build worker to every boot, and apps/akan's whole dev host now peaks at about 1.76GB. A small container
  staggers its apps again instead of overlapping more peaks than it holds.
- An app reports ready once its SSR registry's boot build has settled (at most 30 seconds after its backend answers),
  so the next wave no longer boots beside that build, and `--open` opens a page that hydrates at once.
