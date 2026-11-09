---
"akanjs": patch
---

A dev page no longer loses its styles after a stylesheet change arrives together with a pages rebuild. The most common case was the first save after `akan start` released its builder for being idle: the waking builder announces a new pages bundle and a new stylesheet at once, and the SSR worker that had started importing the bundle put the old stylesheet back when the import finished. Pages kept linking that stylesheet, whose file the dev server had already deleted, so they rendered unstyled with a 404 until `akan start` was restarted. The same update also reaches an SSR worker that is still booting after a recycle, which used to keep the stylesheet it was started with.
