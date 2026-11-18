---
"@akanjs/devkit": patch
---

No route downloads more dictionary than the whole file any more. A route that shows nearly every text could be handed up to four files that together came out larger than the whole dictionary, because several files compress worse than one. Such a route now loads the whole file, and it no longer decides how the other routes' files are cut, so light pages stop paying for it: in a large app with 20 such routes the lightest page's dictionary went from 115 KB back to 96 KB.
