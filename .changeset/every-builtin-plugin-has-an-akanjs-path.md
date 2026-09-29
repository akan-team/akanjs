---
"akanjs": minor
---

Every builtin native plugin's page API is `akanjs/client/native/<plugin id>`

`akanjs/client/native` carries the plugins every page uses, and the rest — `window`, `screen`, `global-shortcut`,
`keep-awake`, `autostart`, `single-instance`, `screen-orientation`, `clipboard`, `network` and every other builtin — had
no path an app outside this repository could import, since the runtime's own package ships only inside akanjs. Each is
now `akanjs/client/native/<id>`, for example `import { appWindow } from "akanjs/client/native/window"`.
