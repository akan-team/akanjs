---
"akanjs": patch
---

Disposing a pubsub subscription or a message listener now removes that subscription's own listener. When one handler function served two subscriptions, such as two rooms or a re-subscribe before the previous cleanup ran, disposing the first one removed nothing: the first room stayed subscribed on the server and kept calling the handler after unmount. Each dispose now removes exactly one listener, and a room is unsubscribed on the socket once its last listener leaves.
