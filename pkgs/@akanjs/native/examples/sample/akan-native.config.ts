import { defineConfig } from "@akanjs/native/config";

const PLUGINS = [
  "app-state",
  "preferences",
  "keyboard",
  "camera",
  "app",
  "window",
  "clipboard",
  "opener",
  "share",
  "haptics",
  "device",
  "network",
  "dialog",
  "keep-awake",
  "screen-orientation",
  "appearance",
  "browser",
  "auth-session",
  "filesystem",
  "file-picker",
  "secure-storage",
  "biometric",
  "geolocation",
  "contacts",
  "local-notifications",
  "splash-screen",
  "window-state",
  "single-instance",
  "menu",
  "tray",
  "global-shortcut",
  "updates",
  "dock",
  "screen",
  "volume",
  "autostart",
  "toast",
  "badge",
  "accessibility",
  "sqlite",
  "http",
];

export default defineConfig({
  app: {
    id: "com.akanjs.sample",
    name: "Akan Native Sample",
    version: "0.1.0",
  },
  web: {
    // build.ts writes a single index.html (JS and CSS inlined) plus public/ into dist/.
    dir: "dist",
    build: "bun build.ts",
  },
  plugins: PLUGINS,
  // PL-11: every plugin the sample uses gets its default permissions, with two deliberate limits
  // that the self-test checks (the denied call and the scope must fail with NOT_ALLOWED).
  capabilities: [
    {
      identifier: "app",
      description: "Everything the sample uses, minus preferences.clear, the data/private folder and one blocked host.",
      permissions: [
        ...PLUGINS.filter((spec) => spec !== "filesystem" && spec !== "http").map((spec) => `${spec}:default`),
        // filesystem:default covers the app's own folders (data, cache, temp); documents is asked for.
        {
          identifier: "filesystem:default",
          allow: [{ base: "data" }, { base: "cache" }, { base: "temp" }, { base: "documents" }],
          deny: [{ base: "data", path: "private/**" }],
        },
        // http:default reaches no URL until the app lists them: the self-test's hosts, and the web
        // dev server (any port: an allow without a port means the default port only).
        {
          identifier: "http:default",
          allow: [
            { url: "https://example.com/*" },
            { url: "https://127.0.0.1:*/*" },
            { url: "http://localhost:*/*" },
            { url: "http://127.0.0.1:*/*" },
          ],
          deny: [{ url: "*://blocked.example/*" }],
        },
        "preferences:deny-clear",
      ],
    },
  ],
  deepLinks: {
    schemes: ["akansample"],
  },
  // UP-2: web bundle updates, signed with ~/.akan/native/keys/com.akanjs.sample.update.key (akan-native update keygen).
  // `akan-native update publish ios|android` + `akan-native update serve` make them; the Android emulator reaches
  // 127.0.0.1 through `adb reverse tcp:8790 tcp:8790`. A real app uses an https URL.
  updates: {
    url: "http://127.0.0.1:8790",
    publicKey: "DDALEO6toESqRwi9K3+Kz2+PeKqIffL7xEu8oIeLub4=",
    readyTimeout: 5000,
  },
  env: {
    defaults: {
      PUBLIC_GREETING: "Hello from akan-native.config.ts",
    },
    // ENV-6: a platform value wins over .env and .env.<mode>; .env.<mode>.<platform> wins over it.
    platforms: {
      android: { PUBLIC_GREETING: "Hello from akan-native.config.ts (android)" },
    },
  },
  // SEC-4: akan-native's strict Content-Security-Policy; the build adds the inline bundle's hashes.
  security: {
    csp: "strict",
  },
  shell: {
    backgroundColor: "#f6f7f9",
    backgroundColorDark: "#15171a",
  },
  // Both drawn by scripts/make-icons.ts. The splash color follows shell.backgroundColor.
  icon: "./icon.png",
  splash: {
    image: "./splash.png",
    autoHide: true,
  },
});
