---
"@akanjs/native": patch
---

On Linux, an `external-view` `sendKey` Tab past the page's last element no longer moves the window's keyboard focus: the focus leaves the page's last element as in a browser, but the user's next key still goes to the view or the app's page, whichever had it. A Tab the user presses still moves the focus as before, and `sendKey` now resolves once the page has taken the key.

**Upgrading.** On Linux `sendKey` used to resolve at once; it now resolves after the page takes the key, as on Windows. A page that is busy or looping, or that opens an `alert()` in its keydown handler, makes `sendKey` reject with `TIMEOUT` after 30 s, and closing the view meanwhile makes it reject with `CANCELLED`.
