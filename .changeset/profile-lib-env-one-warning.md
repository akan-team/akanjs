---
"@akanjs/devkit": patch
---

fix(devkit): a profile build names the lib env values it leaves out in one warning

`akan build <app> --profile <name>` warned once per lib whose `env.server.testing.ts` holds a secret-named default,
each line repeating the same remedy for values a profile is built to go without. The build now says it once, after
the server bundles are written: every lib env file, with the keys it lost, in one line.
