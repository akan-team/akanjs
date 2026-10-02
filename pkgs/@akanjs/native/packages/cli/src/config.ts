// Public API for akan-native.config.ts (CLI-5).

/** A scope entry (PL-11): field → glob, e.g. { base: "documents", path: "exports/**" } or { url: "https://example.com/*" }. */
export type ScopeEntry = Record<string, string>;

/** A permission with scopes: the plugin enforces them for the calls this permission allows. */
export interface CapabilityPermission {
  identifier: string;
  allow?: ScopeEntry[];
  deny?: ScopeEntry[];
}

/**
 * Plugin permissions for some windows and platforms (PL-11, Tauri capability style). Identifiers:
 * "<plugin>:default", "<plugin>:all", "<plugin>:allow-<method>", "<plugin>:deny-<method>",
 * "<plugin>:allow-listen-<event>", "<plugin>:deny-listen-<event>", "<plugin>:<set>" (from the
 * plugin's manifest), and "core:deny-print". Anything not granted is refused with NOT_ALLOWED;
 * a deny wins over every grant, in every window.
 */
export interface Capability {
  /** Lowercase letters, digits and "-", unique. */
  identifier: string;
  description?: string;
  /** Desktop windows: "main" (the first window), window ids, or "*". Default every window. */
  windows?: ("main" | number | "*")[];
  /** Default every platform. */
  platforms?: ("web" | "macos" | "windows" | "linux" | "ios" | "android")[];
  permissions: (string | CapabilityPermission)[];
}

/** A value of an Info.plist or entitlements entry. */
export type NativeValue = string | number | boolean | NativeValue[] | { [key: string]: NativeValue };

export interface AkanNativeConfig {
  app: {
    /** Reverse-DNS id, used as bundle id / application id. */
    id: string;
    /**
     * Display name: the .app folder, the Windows install folder and shortcuts, CFBundleDisplayName,
     * the Android label. Any language; no control characters, no / \ : * ? " < > |, no leading or
     * trailing spaces or trailing dot, not a Windows device name (CON, NUL, COM1 …).
     */
    name: string;
    /**
     * File name for executables, the Swift module and archives: letters, digits, ".", "_" and "-".
     * Default: the last part of `id` ("com.example.notes" → "notes"). Identifiers (data folders,
     * the Windows uninstall key and AUMID, the Linux desktop file) always come from `id`.
     */
    fileName?: string;
    /** Marketing version, e.g. "1.2.0". */
    version: string;
    /** Integer build number. Default 1. `akan-native build --build <n>` or AKAN_NATIVE_BUILD overrides it for one build. */
    build?: number;
  };
  web: {
    /** Folder with the built SPA: index.html (JS inlined) plus any static files such as public/ assets. */
    dir: string;
    /** Command that produces `dir`, run by `akan-native build` in the app folder. Optional. */
    build?: string;
    /** Path prefix for web deployments under a sub-path. Default "/". Apps always use "/". */
    base?: string;
    /**
     * The source HTML that `akan-native dev <platform> --hmr` hands to Bun's dev server (React Fast
     * Refresh), relative to the app folder: the file whose `<script type="module" src>` points at
     * the app's entry, like the one `web.build` bundles. Default "index.html".
     */
    devEntry?: string;
  };
  /** Plugin packages (or relative folders) that contain an native-plugin.json (PL-3). */
  plugins?: string[];
  /**
   * What the plugins may do, per window and platform (PL-11). Without it every plugin listed in
   * `plugins` gets its default permissions (usually everything it offers).
   */
  capabilities?: Capability[];
  env?: {
    /** Lowest-precedence values. Only PUBLIC_ keys are passed to the app. */
    defaults?: Record<string, string>;
    /**
     * Per-platform values (ENV-6), e.g. { android: { PUBLIC_API_URL: "http://10.0.2.2:8787" } }.
     * They win over every shared value; .env.<platform> and .env.<mode>.<platform> win over them.
     */
    platforms?: Partial<Record<"web" | "macos" | "windows" | "linux" | "ios" | "android", Record<string, string>>>;
  };
  shell?: {
    /** Painted before the page loads, to avoid a white flash (SH-3). */
    backgroundColor?: string;
    backgroundColorDark?: string;
  };
  /** Overrides for permission usage texts, e.g. { NSCameraUsageDescription: "..." }. */
  usageDescriptions?: Record<string, string>;
  /**
   * The app's part of the iOS privacy manifest (PrivacyInfo.xcprivacy, required for App Store
   * uploads). The Required Reason APIs of akan-native's shell and plugins are added by the build; list here
   * what the app's own data practices are.
   */
  privacy?: {
    /** NSPrivacyTracking. Default false. */
    tracking?: boolean;
    /** NSPrivacyTrackingDomains. */
    trackingDomains?: string[];
    /** NSPrivacyCollectedDataTypes, as Apple's dictionaries (NSPrivacyCollectedDataType, …Linked, …Tracking, …Purposes). */
    collectedDataTypes?: Record<string, string | boolean | string[]>[];
    /** Extra Required Reason APIs the app's own native code calls, e.g. { "DiskSpace": ["E174.1"] }. */
    accessedApis?: Record<string, string[]>;
  };
  /**
   * Permissions for web APIs used without a plugin (plugins.md C8): getUserMedia needs camera or
   * microphone, navigator.geolocation needs location. `true` or the usage text iOS/macOS show,
   * e.g. { microphone: "Record voice notes." }. Adds the Info.plist texts and Android permissions.
   */
  permissions?: { camera?: string | true; microphone?: string | true; location?: string | true };
  /**
   * Over-the-air updates (UP-2 web bundles on iOS / Android, UP-1 app updates on macOS), used by
   * @akanjs/native/plugins/updates. `akan-native update keygen` makes the signing key and prints `publicKey`;
   * `akan-native update publish <platform>` writes signed releases for `url`.
   */
  updates?: { url: string; publicKey: string; channel?: string; readyTimeout?: number };
  /** Links that open the app, delivered through the app plugin's urlOpen (and getLaunchUrl). */
  deepLinks?: {
    /** Custom URL schemes (myapp://...). */
    schemes?: string[];
    /**
     * https links of these hosts (akanjs readiness O5-2): iOS universal links (associated-domains
     * "applinks:<host>") and Android app links (a verified intent filter per host). The site must
     * serve /.well-known/apple-app-site-association and /.well-known/assetlinks.json for the app;
     * Android debug builds carry android.debugAppIdSuffix in their id. pathPrefixes limit Android's
     * filter (iOS takes the paths from the site's file).
     */
    domains?: (string | { host: string; pathPrefixes?: string[] })[];
  };
  /**
   * Native settings beyond what plugins declare (akanjs readiness O5, architecture review F): merged
   * last, over the shell's and the plugins' (arrays union, dictionaries merged, the app's values win).
   */
  native?: {
    ios?: {
      /** Info.plist entries. Keys akan-native owns (bundle id, executable, versions, minimum OS) cannot be set. */
      infoPlist?: Record<string, NativeValue>;
      /** Entitlements (e.g. keychain-access-groups). associated-domains comes from deepLinks.domains. */
      entitlements?: Record<string, NativeValue>;
    };
    macos?: {
      /**
       * Entitlements of the main executable, over the hardened runtime's (allow-jit, allow-unsigned-executable-memory)
       * and those the usage texts ask for (the camera's, the microphone's). Read when the app is signed with a team.
       */
      entitlements?: Record<string, NativeValue>;
    };
    android?: {
      /** XML at the <manifest> level (uses-permission, queries, …). ${applicationId} is replaced. */
      manifest?: string[];
      /** XML inside <application> (meta-data, services, receivers, providers). */
      application?: string[];
      /** XML inside the app's activity (intent filters). */
      activity?: string[];
    };
    /**
     * Files copied into the app. `to` is a logical place: "ios/<path>" (the app bundle), "android/res/<type>/<file>"
     * (a resource, e.g. android/res/raw/chime.mp3), or "android/assets/<path>". `from` is relative to the app folder.
     */
    resources?: { from: string; to: string }[];
  };
  security?: {
    /**
     * Content-Security-Policy for index.html (SEC-4). "strict" is akan-native's recommended policy
     * (`STRICT_CSP` in packages/cli/src/lib/csp.ts: same origin only, plus blob:/data: images and
     * media); a string or a directive map is used as given, e.g. `{ "default-src": "'self'", "connect-src":
     * ["'self'", "https://api.example.com"] }`. The build adds the hashes of index.html's inline scripts and
     * styles and puts the policy in a <meta> tag. Default: no policy.
     */
    csp?: "strict" | string | Record<string, string | string[]>;
    /** The shell's own policy (L0, docs/architecture.md "보안 계층"). */
    shell?: {
      /**
       * Schemes, besides http, https, mailto and tel, that links, window.open and the opener may
       * hand to the OS (e.g. "sms", another app's "otherapp"). javascript, file, data, blob, about,
       * content, intent and app can never be added.
       */
      externalSchemes?: string[];
    };
  };
  android?: {
    /**
     * The oldest WebView (Chromium major) the page runs on. On an older one the shell shows its own
     * "update Android System WebView" screen instead of a page that cannot parse. Default 94, what
     * akan-native's runtime and unlowered ES2022 syntax (class static blocks) need; raise it for newer syntax
     * or APIs the bundle uses. Android 10+ devices with Google Play update WebView themselves.
     */
    minWebViewVersion?: number;
    /**
     * Media plays with sound without a tap first, as it does on iOS and the desktop (WebView's
     * mediaPlaybackRequiresUserGesture off): an app nobody taps, such as a signage screen. Default false.
     */
    autoplay?: boolean;
    /**
     * Appended to app.id in debug builds (e.g. ".debug"), so a debug build installs next to the
     * release app. Deep links and app links must list the suffixed id for debug builds.
     */
    debugAppIdSuffix?: string;
    /**
     * The Firebase project's google-services.json (relative to the app folder), for the push plugin's
     * FCM module: its values become the string resources Firebase initializes from, as the
     * google-services Gradle plugin makes them (google_app_id, gcm_defaultSenderId, google_api_key, …).
     */
    googleServices?: string;
  };
  /** Remote notifications (the push plugin). */
  push?: {
    android?: {
      /**
       * The channel pushes arrive in: Firebase's default channel for messages that name none (while
       * the app is not in front) and the plugin's own notifications in front. Default: Firebase's
       * "Miscellaneous" channel in the background and "Notifications" in front.
       */
      channel?: { id: string; name: string; importance?: "min" | "low" | "default" | "high"; description?: string };
      /**
       * The status bar icon: a white-on-transparent PNG (Android shows only its alpha), ideally
       * 96×96. Default: the app icon, which shows as a gray square.
       */
      smallIcon?: string;
      /** The notification's accent color, e.g. "#1a73e8". */
      color?: string;
    };
  };
  /**
   * What the soft keyboard does to the page from the first frame (akanjs readiness O6-1): "resize"
   * (default) shrinks the page by the keyboard, "none" lets it cover the page. keyboard.setResizeMode()
   * changes it at run time.
   */
  keyboard?: { resize?: "resize" | "none" };
  ios?: {
    /** Hide the bar with previous / next / Done above the keyboard for form fields. Default false. */
    hideFormAccessoryBar?: boolean;
  };
  desktop?: {
    /**
     * Closing the window quits the app (after app.onBeforeQuit handlers). With false, closing only
     * hides the window: the app keeps running, a Dock click shows it again, Cmd+Q quits. Default true.
     */
    quitOnLastWindowClosed?: boolean;
    /**
     * What a window does when its page's web process ends: a crash, a hang, out of memory. "errorPage"
     * (default) loads the page again once and shows an error page when it ends again within a minute, so a
     * page that crashes on load does not loop; the app quits when the webview's browser process ends
     * (Windows). "reload" loads it again every time, waiting longer after each end in a row (1 s, doubling
     * to a minute), and relaunches the app when the browser process ends: an app nobody attends, such as a
     * kiosk or a signage screen. iOS and Android always start the page over.
     */
    recovery?: "errorPage" | "reload";
    /**
     * The main window from its first frame: `fullscreen` (borderless, on the display the window opens on)
     * and `skipTaskbar` (no taskbar button; Windows and Linux). A plugin's launch phase may still decide
     * otherwise (DesktopContext.launch.setWindow). Default false for both.
     */
    window?: { fullscreen?: boolean; skipTaskbar?: boolean };
    /**
     * Windows: "auto" answers the page's getDisplayMedia() with the first screen at once, without the picker or a
     * user gesture: a remote-support session on an unattended screen. It is Chromium's switch for automated media
     * tests (--use-fake-ui-for-media-stream), made for every media request, so keep it to an app whose pages ask
     * for no camera or microphone. Default "picker". WebView2's choice by title follows the UI language, so none is
     * offered. macOS and Linux ignore it.
     */
    screenCapture?: "picker" | "auto";
    /**
     * A server the app starts beside its window (akanjs `native.desktop.server`). `dir` is copied to
     * the app's resources (`server/`), and `entry` there runs on the app's own Bun with `env`, bound to
     * a loopback port picked at launch; the page reads its URL as PUBLIC_AKAN_SERVER_URL. The launcher
     * sets PORT, JWT_SECRET, the data folders (`<app local data>/server`) and the listen host itself.
     */
    server?: { dir: string; entry: string; env?: Record<string, string> };
    /**
     * A folder of executables the app carries (akanjs `bin`): copied to the app's resources (`bin/`) and put
     * first on the app's PATH at launch, so its plugins and its server find them by name before the computer's.
     * macOS builds sign every Mach-O file in it.
     */
    bin?: string;
  };
  /**
   * App icon for every platform, generated from one square PNG, ideally 1024×1024 (CLI-8).
   * Full-bleed icons work best: iOS and Android mask the corners, macOS gets its rounded grid.
   * `backgroundColor` fills transparent areas where a platform needs an opaque icon (iOS, the
   * Android adaptive icon background). Default: the top-left pixel of an opaque icon, else white.
   * Without an icon the platforms show their placeholder icon.
   */
  icon?: string | { image: string; backgroundColor?: string };
  /** Launch screen on iOS and Android (SH-6). Desktop windows stay hidden until the first page load instead. */
  splash?: {
    /** Default: shell.backgroundColor / shell.backgroundColorDark. */
    backgroundColor?: string | { light: string; dark: string };
    /**
     * PNG shown centered, fitted into 136×136 pt (iOS) / dp (Android). Without it Android shows
     * the app icon (the platform default) and iOS only the color.
     */
    image?: string;
    /** Hide when the first page load finishes. With false, call splash.hide() (@akanjs/native/plugins/splash-screen). Default true. */
    autoHide?: boolean;
    /** Hide after this many milliseconds at the latest, with a warning. Default 10000. */
    timeout?: number;
  };
}

export function defineConfig(config: AkanNativeConfig): AkanNativeConfig {
  return config;
}
