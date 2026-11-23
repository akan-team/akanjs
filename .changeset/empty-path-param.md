---
"akanjs": patch
---

A query or mutation called with an empty or missing path argument (`fetch.revokeDevice("")`) now fails before
anything is sent, with `base.error.requiredArgument` naming the argument. The call used to reach a path no endpoint
serves and come back as the HTML page, which the client could not read as an answer. On the server, a path under the
API prefix that names no endpoint now answers a JSON 404 (`code: "routeNotFound"`) instead of rendering the page; a
web proxy still sees the path first and may answer or rewrite it as before.
