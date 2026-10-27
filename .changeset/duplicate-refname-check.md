---
"akanjs": patch
---

An app now fails to boot when two of its declarations give one refName different shapes, instead of quietly serving one of them. The check covers scalars (two libs each declaring `inviteRequest` with different fields), enums (two `enumOf` classes exported under one name with different values), and database models (an app or lib declaring a model under a lib's refName without building it on the lib's model). The error lists every such refName with both declarations, the app or lib and the module path, and the fields or values each has that the other lacks. A field's kind is part of its shape, so a `secret`, `hidden` or `visual` field differs from a plain field of the same type. To fix it, rename one side. For a model, an app may still extend a lib's model through `lib/__lib/lib.constant.ts`, as before. Declarations with the same fields or values under two libs stay legal, and so does a module that is evaluated again, as during a dev reload.

When a lib and the app both declare a refName, the app's declaration now wins in every registry. Before, the constant registry kept the first scalar while dependency injection used the last, so a lib's endpoint could parse its payload with another lib's class and fail at runtime.
