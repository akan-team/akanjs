---
"akanjs": minor
---

A page switched in place (a tab, any move with `transition: "none"`) is now drawn before it shows, and an Android app's back button closes an open dialog before it leaves the page.

A page that draws later (an async render, or a guard on it or on a layout above it) used to swap in at once and show its loading fallbacks, so every tab switch flashed a shell. Such a page is now mounted out of sight and takes the screen once its layers are drawn, or after 300ms with whatever it has, so a slow page still answers the tap. A page that draws in the commit it mounts in, and one the stack already holds (a tab kept by `cache`, the page under the current one), switch at once as before. The page left under the current one stays asleep through that wait, so its effects do not run again for a page nobody sees.

Android's back button and back swipe now close the newest open surface (a modal, a sheet, a confirm) and only leave the page once none is open: Escape and back share the one stack `useEscapeKey` registers on. `useEscapeKey(active, onEscape, { back: false })` keeps the back button for the page, which `Tooltip` uses: a tap focuses a button on Android, so its tooltip would otherwise swallow the next back press. The third argument is optional, so no upgrade step is needed.
