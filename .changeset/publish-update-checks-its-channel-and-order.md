---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan publish-update` refuses a channel no app could take, and keeps each release newer than the last

A `--channel` outside the names `updates.channel` accepts (lowercase letters, digits, `.`, `_`, `-`) stops before the
build instead of writing `Pilot.json`, which no app is configured for, or a path outside the updates folder. A release
is numbered past the one its channel already has in the updates folder, so a publishing computer whose clock is
behind no longer publishes a release every app ignores as older; it warns instead. Apps still compare against the time
their own build was made, so keep the building and the publishing computers' clocks in step.
