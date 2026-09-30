---
"akanjs": patch
---

fix: a desktop app's server that cannot start fails on this computer, and a stopped one takes its tools with it

- A server that exits before its first ready is started again on a fresh port while the page does not have its URL
  yet, so another program taking the port picked no longer costs five crashes and the app's server. A server that gave
  up opens the window at once instead of after the full 8 s.
- A server that could not start at all (an unreadable `jwt.secret`, a data folder that cannot be made) still hands
  the page a loopback URL and shows the same alert as one that kept crashing. The page used to fall back to the
  backend its bundle was built for, so a desktop app could read and write another copy's data.
- A restart that throws (the data folder removed meanwhile) counts as one failure; it used to stop the restarts for
  good, silently.
- On macOS and Linux the server leads its own process group: whatever it started and left running (a `bin` tool) ends
  with it, and a server still there after the grace is killed, not asked again.
- An update of an app that carries a server is confirmed only once that server answered ready, so a release whose
  server never comes up is rolled back like one whose page never renders.
- A debug build that carries a server grants the files the user picks the way a release build does; its carried
  server runs in edge mode and refused the dev build's grant.
