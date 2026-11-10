---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan preview` and the code agent's page preview give a browser that died or was closed the full `startTimeoutMs` (120 s by default) for its next start. Before, after one page had run out of the start bound, a browser that then died while another page waited for it stayed marked as slow to start. The next page started a fresh browser within only its own `timeoutMs` (60 s for `akan preview`, 30 s for the code agent's check).
