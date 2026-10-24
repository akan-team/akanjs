---
"akanjs": patch
---

`Tab.Panel` now reads its `loading` prop on every render, so a change applies at once, even while another menu is shown. Switching to `"every"` while hidden unmounts the panel, along with its agent tools. Switching to `"eager"` mounts it. Switching to `"lazy"` keeps whatever is mounted. A `"lazy"` or `"every"` panel is now on screen in the same commit that selects its menu; before, there was one commit with the panel still empty.
