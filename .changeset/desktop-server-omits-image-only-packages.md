---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`desktop.server: { omit }` carries the desktop app's server without packages only the image needs

`native: { desktop: { server: { omit: ["rclnodejs"] } } }` carries the server as `server: true` does, minus the named
packages and whatever only they pull in: an addon tied to the image's system (a ROS install), or code only a process
the desktop app never starts loads. The image's `package.json` keeps them, `externalLibs` included; the desktop
server's `package.json`, its `bun install --production` and the addon check do not see them. A package another
dependency still installs stops the build, naming the dependents, and the targets that carry one build's server must
omit the same packages.
