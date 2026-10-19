---
"akanjs": patch
---

`Image` and `CsrImage` no longer write `placeholder` and `blurDataURL` onto the `<img>`. A file with `abstractData`, or a caller passing either prop, used to make React log "React does not recognize the `blurDataURL` prop on a DOM element" on every render; neither attribute ever drew a blur, so nothing on screen changes. Both props are still accepted for next/image compatibility.
