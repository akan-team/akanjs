---
"akanjs": patch
---

A toast shown with a `duration` of 0 or less, such as `msg.loading(key, { key, duration: 0 })`, stays until a toast with its `key` replaces it or the user closes it. It used to disappear at once.
