---
"akanjs": minor
---

feat(native): Android back belongs to the page only while it has somewhere to go, a back swipe moves the page, and
memory warnings release hidden pages

- **`app.setBackEnabled({ enabled })`** (Android) tells the shell whether a listening page wants back right now. The
  CSR frame reports it after every navigation: enabled while there is history, the keyboard is up, or the index is
  still to come. At the index with nothing under it the shell no longer registers its back callback, so the system
  shows its back-to-home animation and the app stays warm. Before, the page caught that back and called
  `app.exit()`, which finished the task. A new listener starts enabled, so a page that never reports behaves as before.
- **`app` event `backProgress`** (Android 14+, `OnBackAnimationCallback`) carries `{ phase, progress, swipeEdge }` for
  a back the page will take. The frame drives the current transition's spring with it: a `stack` or `bottomUp` page
  follows the finger, a fade or `scaleOut` page moves half as far, and a cancelled swipe springs back. The commit
  still arrives as `backButton`, and the back animation finishes from wherever the finger let go.
- **`app-state` event `memoryWarning`** `{ level: "moderate" | "critical" }`: iOS `didReceiveMemoryWarning`, Android
  `onTrimMemory` (the `RUNNING_LOW` / `RUNNING_CRITICAL` levels Android 13 and earlier still send, `BACKGROUND` and
  above) and `onLowMemory`. The frame releases its hidden pages on one; each mounts again when visited.
- The runtime's plugin host gained `setBackEnabled` and `setBackProgressListener`; the desktop `app` implementation
  answers both as no-ops.

Checked on an Android 16 emulator: at a fresh index, back went to the system and the process survived. A left-edge
swipe on a stack page moved it by the finger (translateX ~76px mid-swipe) and snapped back on cancel; a committed swipe
went back through `router.back`. `am send-trim-memory RUNNING_CRITICAL` left only the current and previous pages. On an
iOS 26.5 simulator, Simulate Memory Warning reached the page, and killing the WebContent process reloaded the page onto
its restored stack.
