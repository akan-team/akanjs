---
"akanjs": patch
---

A CSR app — a native app's bundle — no longer leaves a blank page when a route guard refuses a page that slides in. Until such a page shows, a newer navigation takes its place, so a guard's redirect lands where the page would have, and the page never appears. A navigation made while a page slides in now runs once it has settled; before, it was dropped. Before, a redirect to a page with a transition was dropped and the refused page stayed blank, and a redirect to one without a transition still had the refused page pushed on top of it. A back while a page is being prepared now cancels that page, and an animated replace no longer leaves the replaced page under the new one.
