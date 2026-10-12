---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A desktop app's carried server takes `desktop.server: { env, restart, watchdog }`: variables over the image's (secret-named ones and the stage's own refused at build), `restart: "forever"` or a count of crashes before giving up, and a health-route watchdog that restarts a hung server. `desktop.webview2: "standalone"` embeds the whole WebView2 Runtime in the Windows setup. `updates.setChannel({ channel })` moves an installed desktop app to another manifest, and `akan publish-update --upload s3://<bucket>/<prefix>` uploads the release, its manifests last. `st.tool(name, { label })` names an action for a person, which `Agent.useScreenActions()` returns. Fixes: `Model.New` opens under its own `modal`; two `Model.New`s of one model on different slices open only the pressed one's form; the top inset slots clip at a 0 inset and follow iOS's keyboard pan; `Layout.BottomTab` matches tabs by segment with per-tab `exact` and `match`, keeps the badge under `renderTab` and marks the current tab `aria-current="page"`; a multipart mutation's other body args arrive typed as in a JSON body.
