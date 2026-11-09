---
"akanjs": patch
---

A dev server now answers only the host names it can be reached under locally. Under `akan start`, or on a local dev runtime, with `AKAN_ALLOWED_HOSTS` unset, it answers `localhost` and `*.localhost`, IPv4 and IPv6 addresses (a phone on the LAN included), and the app's own hosts: its route domains and `<app>-<environment>.<serveDomain>`. A request under any other `Host`, the HMR socket and the `/_akan/*` dev routes included, gets a 403 that names `AKAN_ALLOWED_HOSTS`. To open a dev server under another name, such as a container's service name or a forwarded editor URL, list every `host:port` it should answer there; a set list replaces the default, as before. A deployed server with the variable unset still answers every `Host`.

`akan tunnel` and `akan start --share` keep working: the tunnel agent now dials the local app under the app's own address and leaves the public host name in `x-forwarded-host`, which is where the app already reads it. A redirect a page raises during SSR now sends a same-origin target as a relative `Location`, so a tunnel or proxy caller lands on the host it used rather than the one the server was dialed as; a target on another origin stays absolute.
