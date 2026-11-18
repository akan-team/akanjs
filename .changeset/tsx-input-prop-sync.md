---
"@akanjs/cli": patch
---

The `tsx` rule says never to copy a prop into an input's `useState` in an effect. React 19 keeps text typed into a server-rendered input before hydration in the field, but not in state, so the render that effect causes clears it; and when the input sends its text to the URL, the page rendered for an older query arrives after newer keystrokes and the effect puts the older text back. Run `akan agent install` in a workspace to pick up the new line.
