---
"@akanjs/native": patch
---

On Linux, an `external-view` `sendKey` Tab past the page's last element no longer moves the window's keyboard focus: the focus leaves the page's last element as in a browser, but the user's next key still goes to the view or the app's page, whichever had it. A Tab the user presses still moves the focus as before, and `sendKey` now resolves once the page has taken the key.
