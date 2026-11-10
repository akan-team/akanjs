---
"akanjs": patch
---

An error an endpoint declares in `errors` and throws with that status under 500 is now logged at debug, as a returned call is, rather than as an ERROR line. A public endpoint that answers a bad token with a declared 404 no longer sends every probe, token scan or mistyped webhook URL to real-error alerts. Undeclared errors, a declared key thrown with another status, and every 5xx still log as errors.
