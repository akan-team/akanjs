---
"@akanjs/devkit": patch
---

A root layout whose own route level fails after the page has started streaming now draws the route-level notice ("This page could not be loaded." with "Try again") instead of blanking the page. That covers an app's `page/_layout.tsx`, or a grouped root layout, that fails below its own `.loading()`, and a component in it that suspends and then fails.

- The generated root layout renders the boundary inside `System.Provider`, around the app's root layout. The provider stays, with the bridge that starts the router, so "Try again" refreshes the page. The notice takes the place of the whole root layout, its header and navigation included.
- Only a server render gets it. A CSR bundle renders the root layout as before, and an MCP App view does not render the root layout's body.
- A failure before the first byte is answered as before, since the server runs no error boundary. So is a redirect or not-found the root layout raises; after the first byte the boundary draws no notice for one.
- The page's markup and its `useId` values are unchanged. Its inline payload gains one wrapper.
