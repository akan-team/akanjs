---
"akanjs": minor
"@akanjs/cli": minor
"@akanjs/devkit": minor
---

An app and a lib ship native plugins of their own from a `native/` folder

A plugin the runtime has no builtin for sits in `apps/<app>/native/<id>/` (or `libs/<lib>/native/<id>/`), the folder
named after the id in its `native-plugin.json`. It is listed nowhere: every mobile and desktop target of the app
ships it, and its manifest says what runs on each platform. A lib's plugins reach only the apps that depend on it; an
app's own plugin wins an id a lib also uses, and two libs claiming one id stop the build. `akan sync`, `akan doctor`
and `akan quality scan` accept the folder.

The page API is written with `definePlugin` from `akanjs/client/native` (which also exports `defineWebPlugin`,
`createLiveValue`, `useLiveValue` and `usePluginEvent`), and the desktop part with `defineDesktopPlugin` from the new
`akanjs/native/desktop`. A `native/` folder is out of the scope of `no-throw-raw-error` (a plugin throws
`AkanNativeError`) and of `no-web-only-api-outside-webkit`. A plugin a target names by folder in `native.plugins` is now
granted by its id instead of its path, and ships once when it is also the app's own `native/<id>`. A desktop plugin's
`ctx.launch.exit(code)` after its setup ran past the launch phase's 3 s quits the app, since its window exists by then.
