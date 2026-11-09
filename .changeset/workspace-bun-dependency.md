---
"create-akan-workspace": patch
"@akanjs/cli": patch
---

`create-akan-workspace` run through `npx -y bun@<version> x …` leaves no Bun on PATH, so `akan` could not start afterwards. In that case the creator now passes `--bun-dependency=<version>` to `akan create-workspace`, which lists `bun` in the workspace's `dependencies` before installing and writes `build` (`akan build <app>`) and `start` (`cd dist/apps/<app> && bun main.js`) scripts. Both closing messages say to use `npm run build`, `npm start` or `npx akan …` instead of `akan`. With Bun on PATH, nothing changes.
