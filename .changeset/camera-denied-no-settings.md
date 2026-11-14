---
"akanjs": minor
---

`useCamera` and `useGeoLocation` no longer send the user to the Settings app after a permission is denied. App Store review rejects that under Guideline 5.1.1(iv) ("The user is redirected to the Settings app to grant access after tapping 'Don't Allow'").

- A denied photo, library pick or position (`getPhoto`, `pickImage`, `getPosition`) resolves `undefined`. The camera hook also sets `permissions.camera` to `"denied"`.
- `checkPermission()` returns the state and does nothing else.
- When `getPhoto` uses the camera and the camera was already denied before the tap, so no system prompt could appear, a notice explains that camera access is off. Settings open only when the user taps its "Open Settings" button. The four strings are `base.cameraDenied*` entries in the base dictionary.

No upgrade step is needed. The API report changes only because the base dictionary's key union gains the four `cameraDenied*` keys.
