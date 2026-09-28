---
"akanjs": patch
---

fix(dev): a route that failed because of a shared module is built again once a newer build goes green, so its overlay clears in every tab without reopening the route
