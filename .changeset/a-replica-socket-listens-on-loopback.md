---
"akanjs": patch
---

fix: a gateway's replica takes the websocket relay on 127.0.0.1, the address it reports

Behind the gateway a replica listens for relayed sockets on a TCP port of its own, and its ready message names
127.0.0.1, where the gateway dials. It bound that port on every interface; it now binds 127.0.0.1 only, whatever
`AKAN_LISTEN_HOST` names.
