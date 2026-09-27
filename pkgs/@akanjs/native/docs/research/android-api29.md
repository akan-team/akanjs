# Android minSdk 29 조사: API 30 이후 기능의 프레임워크 대체 경로 (akanjs 준비 O1-1)

> 2026-09-26. 레퍼런스(Capacitor, capacitor-plugins, React Native, Lynx, Tauri, wry)와 SDK 소스를 읽고 정리한 조사 원본(영문)이다. 반영 결과는 architecture.md "최소 OS: iOS 16, Android 10"에 있다. 줄 번호는 조사할 때의 akan-native 트리 기준이라, 그 뒤 수정으로 달라졌다.

Research only; no akan-native file was changed. The akan-native tree was being edited while I read it (2026-09-26, about 22:35–22:55 KST).
- `packages/cli/src/platforms/android.ts` now has `MIN_SDK = 29` (:28).
- `native/android/src/com/akanjs/runtime/AkanNativeCompat.kt` is new.
- `packages/cli/src/lib/apilevel.ts` is new: a NewApi-style bytecode check.
- `AkanNativePlugin.kt` swapped `Cleaner` for `AkanNativeReaper` (:66-86).
- `ScreenOrientationPlugin.kt` and `SharePlugin.kt` now call `AkanNativeCompat`.
- `plugins/sqlite/native-plugin.json` has `"minSdk": 35`.

Line numbers are the ones I read. Files that were not modified (such as `AkanNativeActivity.kt`) are stable.

**How the levels were found**
- API levels come from `~/Library/Android/sdk/platforms/android-36.1/data/api-versions.xml`, the file lint reads.
- `examples/sample/.akan/native/build/android/obj/classes.jar` (built 21:50) was disassembled with `javap`. Every referenced framework member was then resolved through its supertypes against that file. This is a mini NewApi check; results are in §0 and §14.
- A separate source scan found compile-time constants, which kotlinc inlines and bytecode cannot show (§15).

**Legend**
- **[K]** means from knowledge (for example AndroidX internals or Chromium versions), not verified in the reference clones or the SDK sources.
- `ref:` paths are relative to `/Users/kangminseon/github/study/`.

---

## 0. What breaks on an API 29 device today, in the order it hits

| # | Where | API | Effect on 29 |
|---|---|---|---|
| 1 | `AkanNativeActivity.kt:499`: `private val backCallback = OnBackInvokedCallback { … }`, a field initializer, compiled to `invokedynamic`. d8 desugars it into a class that implements `android.window.OnBackInvokedCallback`. | 33 | `NoClassDefFoundError` while the activity is **constructed**, before `onCreate`. |
| 2 | `AkanNativeActivity.kt:94`: `isAlgorithmicDarkeningAllowed = false` | 33 | `NoSuchMethodError` in `onCreate` (also on 30-32). |
| 3 | `AkanNativeActivity.kt:183`: `window.insetsController` in `applyBackground()` | 30 | `NoSuchMethodError` in `onCreate`. |
| 4 | Plugin constructors in `AkanNativeActivity.kt:112-118`, wrapped in `catch (e: Exception)`, which does **not** catch `LinkageError`:<br>- `HapticsPlugin.kt:25-26`: `VibratorManager` (31), `VibrationAttributes.createForUsage` (33)<br>- `AppearancePlugin.kt:40`: `setApplicationNightMode` (31), inside `catch (RuntimeException)`<br>- `LocalNotificationsPlugin.kt:46-47` → `LocalNotifications.restore` → `arm` → `canScheduleExactAlarms()` (`LocalNotifications.kt:174`, 31), whenever an item is pending | 31/33 | App crash in `onCreate`. The haptics crash also happens on 30-32. |
| 5 | `AkanNativeActivity.kt:441-462`: `WindowInsets.Type.*`, `getInsets`, `isVisible`, `Builder.setInsets` | 30 | Crash in `installInsets()` (`Type.*`) and in the first inset dispatch. |
| 6 | `AkanNativeActivity.kt:433`: `splashScreen.setOnExitAnimationListener` | 31 | Crash in `holdSplash()`. |
| 7 | First bridge call: `AkanNativeCall` used `java.lang.ref.Cleaner` | 33 | **Already fixed in the tree** (`AkanNativeReaper`, AkanNativePlugin.kt:66-86). |
| 8 | Runtime paths:<br>- back: `AkanNativeActivity.kt:511-512`, 33<br>- fullscreen: `AkanNativeActivity.kt:354-357`, `:485`, 30<br>- keyboard hide: 30<br>- biometric: 30<br>- geolocation: 31<br>- share receiver: 33, now via `AkanNativeCompat`<br>- `pickImages`: 33, R-ext 2<br>- orientation: 30, now via `AkanNativeCompat`<br>- dialog action sheet: `TypedArray.use`, 31, §14.3<br>- sqlite: 35, now gated as UNSUPPORTED<br>- updates: Ed25519, 33, §14.2 | various | Crashes or silent failures, per item below. |

Defence in depth (§14.5): catch `LinkageError` (or `Throwable`) wherever plugins are created, dispatched and notified (`AkanNativeActivity.kt:113-117`, `AkanNativeBridge.kt:193-198` and `safely` at :262-268). A missed gate then degrades to `UNSUPPORTED`/`INTERNAL` instead of killing the app. Keep every >29 call in `ApiN` holder objects (the AndroidX `ApiNNImpl` pattern, now enforced by apilevel.ts). This also spares ART soft verification failures of the calling class [K].

---

## 1. AkanNativeActivity: insets, system bars, edge-to-edge, display, splash, back, darkening

### 1a. Key finding: edge-to-edge is not automatic on 29–34

At minSdk 35, target 36 forces edge-to-edge. On devices running 29–34 it is **not** forced.
- RN encodes the rule in `react-native/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/view/WindowUtil.kt:45-69`: forced only when target ≥ 35 **and** device ≥ 35, unless the theme opts out; always on 36+.
- Below that, `DecorView` lays the content out between the bars and consumes the bar insets.
- So akan-native's `root` listener (`AkanNativeActivity.kt:443`) would see bar insets of 0, and the page would never draw under the bars.
- `setDecorFitsSystemWindows(false)` is a no-op when edge-to-edge is already enforced (SDK sources android-36.1 `com/android/internal/policy/PhoneWindow.java:4151-4157`), so it is safe on every version.

Recommended call in `onCreate`, before `setContentView` (framework only; mirrors RN `WindowUtil.kt:166-210` and androidx `EdgeToEdge` [K]):
```kotlin
@Suppress("DEPRECATION")
private fun edgeToEdge() {
    val w = window
    if (Build.VERSION.SDK_INT >= 30) Api30.decorFitsSystemWindows(w, false)   // no-op when enforced (35+)
    else w.decorView.systemUiVisibility = w.decorView.systemUiVisibility or
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    w.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS or WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION)
    w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)              // API 21
    if (Build.VERSION.SDK_INT < 35) { w.statusBarColor = Color.TRANSPARENT; w.navigationBarColor = Color.TRANSPARENT }
    w.isStatusBarContrastEnforced = false                                                 // API 29
    // leave isNavigationBarContrastEnforced = true (API 29): 3-button nav gets a scrim, gesture nav none
    w.attributes = w.attributes.apply {
        layoutInDisplayCutoutMode = if (Build.VERSION.SDK_INT >= 30) WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS // 30
                                    else WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES                   // 28
    }
}
```
- To avoid a first-frame flash, the CLI theme (`packages/cli/src/lib/icons.ts:220-231`) can add `values-v29` items: `android:statusBarColor` and `android:navigationBarColor` = `@android:color/transparent`, `android:enforceStatusBarContrast` = false, `android:windowLayoutInDisplayCutoutMode` = `shortEdges`.
- Add `values-v30` with `always`.
- The `SYSTEM_UI_FLAG_LAYOUT_*` flags can only be set in code.

**References**
- Capacitor core never calls `setDecorFitsSystemWindows`. It puts a `ViewCompat.setOnApplyWindowInsetsListener` on the **DecorView** itself, which replaces the decor's own inset handling (`capacitor/android/capacitor/src/main/java/com/getcapacitor/plugin/SystemBars.java:191-239`).
- Capacitor's changelog records the pain: "make safe-area-inset-x available on API <= 34" and "avoid extra view padding on API <= 34" (`capacitor/android/CHANGELOG.md:38`, `:57`).
- capacitor-plugins status-bar overlay mode: `SYSTEM_UI_FLAG_LAYOUT_STABLE | SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN` plus a transparent `statusBarColor` (`capacitor-plugins/status-bar/android/src/main/java/com/capacitorjs/plugins/statusbar/StatusBar.java:102-119`, `:220-228`).
- Tauri only calls `androidx.activity.enableEdgeToEdge()` in its template `MainActivity.kt:4-8`, and has no inset code.

### 1b. Safe-area insets and IME on 29 (`installInsets`, AkanNativeActivity.kt:440-463)

With `adjustResize` (`android.ts:127`) plus the layout flags, the IME arrives in `systemWindowInsets.bottom`. `androidx.core` `WindowInsetsCompat` Impl20/28/29 does the following on 29 [K]:
- `statusBars` = `systemWindowInsets.top`.
- `navigationBars.bottom` = min(systemWindow.bottom, root **stable** bottom).
- `displayCutout` = `DisplayCutout.safeInset*` (API 28).
- `ime` = `Insets.of(0,0,0, systemWindow.bottom)` if systemWindow.bottom > rootStable.bottom, else NONE.
- `isVisible(ime)` = "ime insets are not NONE".
- For adjustPan it also reads the hidden `View.mAttachInfo.mVisibleInsets` by reflection. akan-native should not copy that.

Framework-only equivalent (the `Insets`-typed getters and `WindowInsets.Builder` are API 29):
```kotlin
@Suppress("DEPRECATION")
private fun legacyInsets(insets: WindowInsets): Triple<Insets, Int, Boolean> { // bars∪cutout, imeBottomPx, imeVisible
    val sw = insets.systemWindowInsets          // API 29 (Insets), deprecated 30
    val st = insets.stableInsets                // API 29
    val c = insets.displayCutout                // API 28
    val imeVisible = sw.bottom > st.bottom      // androidx Impl20 rule
    val bars = Insets.of(
        maxOf(sw.left, c?.safeInsetLeft ?: 0), maxOf(sw.top, c?.safeInsetTop ?: 0),
        maxOf(sw.right, c?.safeInsetRight ?: 0), maxOf(minOf(sw.bottom, st.bottom), c?.safeInsetBottom ?: 0))
    return Triple(bars, if (imeVisible) sw.bottom else 0, imeVisible)
}
// keyboard height (dp) = max(0, sw.bottom - st.bottom) / density  == akan-native's "ime.bottom - systemBars.bottom"
// returned insets on 29: WindowInsets.Builder(insets)
//     .setSystemWindowInsets(Insets.of(l, t, r, if (imeVisible) 0 else bars.bottom)).build()   // API 29, deprecated 30
```
- On 29, return `Builder.setSystemWindowInsets(...)` rather than `replaceSystemWindowInsets(...)`. The latter is API 20 and deprecated in 29; on Q+ it returns the insets unchanged if they were already consumed (SDK `WindowInsets.java:772-795`).
- Keep "do not consume, zero the bars": Capacitor `SystemBars.java:229-234` (crbug 461332423).

**CSS insets**
- Keep `injectCssInsets` for WebView below 140 (AkanNativeActivity.kt:98, `:465-473`). Capacitor gates `env()` passthrough on WebView version only, with no SDK check (`SystemBars.java:38-41`, `:194`, `:343-354`). That implies WebView 140+ fills `env(safe-area-inset-*)` on old OS versions too.
- **Verify on an API 29 emulator** with an updated WebView. Until then, consider also forcing the CSS variables when `SDK_INT < 30`.
- On WebView below 144, zero the bottom inset while the IME shows (`SystemBars.java:353-365`, crbug 457682720).

### 1c. Light or dark bar icons (`applyBackground`, AkanNativeActivity.kt:179-183)

```kotlin
@Suppress("DEPRECATION")
private fun lightBars(light: Boolean) {
    if (Build.VERSION.SDK_INT > 30) return Api30.lightBars(window, light)   // insetsController.setSystemBarsAppearance
    val v = window.decorView
    val bits = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR   // 23 / 26
    v.systemUiVisibility = if (light) v.systemUiVisibility or bits else v.systemUiVisibility and bits.inv()  // read-modify-write
}
```
- The boundary is `> 30`, not `>= 30`: RN uses `setSystemBarsAppearance` only when `SDK_INT > R` (`WindowUtil.kt:99-124`).
- androidx `WindowInsetsControllerCompat` Impl30 also toggles the legacy flags on API 30 [K]. On 30 the appearance API is unreliable when legacy flags or theme attributes are in play [K].
- Capacitor does the same through the compat class (`SystemBars.java:283-301`) and the framework path in `StatusBar.java:66-80`.

### 1d. Hiding and showing system bars (fullscreen video, AkanNativeActivity.kt:354-357, :485)

Below 30:
- To hide, OR in `SYSTEM_UI_FLAG_FULLSCREEN | SYSTEM_UI_FLAG_HIDE_NAVIGATION | SYSTEM_UI_FLAG_IMMERSIVE_STICKY`, keeping the `LAYOUT_*` flags.
- To show, clear them.
- `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` maps to `IMMERSIVE_STICKY` (androidx Impl20 [K]).
- Never use the window `FLAG_FULLSCREEN`: it disables adjustResize. RN's non-edge-to-edge `statusBarHide` falls into that (`WindowUtil.kt:141`); Lynx clears it (`lynx/.../behavior/KeyboardMonitor.java:42-49`).
- The system clears FULLSCREEN and HIDE_NAVIGATION after a focus loss (dialogs, permission prompts). Re-apply them in `onWindowFocusChanged(true)` while `fullscreenView != null` [K].

### 1e. `Activity.getDisplay` (30)

Use `if (SDK_INT >= 30) activity.display else @Suppress("DEPRECATION") activity.windowManager.defaultDisplay`.
- **Already done** in `AkanNativeCompat.display` (AkanNativeCompat.kt:14-15), and ScreenOrientationPlugin uses it.
- Through the Activity's WindowManager this returns the activity's own display (SDK `WindowManager.java:702-718`).
- References:
  - Capacitor `capacitor-plugins/screen-orientation/android/src/main/java/com/capacitorjs/plugins/screenorientation/ScreenOrientation.java:19-25`, `:75-78`
  - RN `ReactRootView.java:987-992`
  - Lynx `KeyboardMonitor.java:84`
- Avoid `DisplayManager.getDisplay(DEFAULT_DISPLAY)`, which is wrong on multi-display devices, and `View.getDisplay()`, which is null before attach.

### 1f. Splash screen (`android.window.SplashScreen`/`SplashScreenView`, 31; AkanNativeActivity.kt:428-436)

**Current state**
- The theme (`icons.ts:225-231`) puts `windowSplashScreenBackground` and `windowSplashScreenAnimatedIcon` (API 31 attributes) into `values/`.
- `aapt2 link` runs without `--no-auto-version`, so aapt2 moves those attributes into a synthesized `-v31` style [K]. Resources are fine, but 29/30 get only `windowBackground`, a plain color.

**Capacitor**
- The launch theme is androidx `Theme.SplashScreen` with a full-bleed `@drawable/splash` (`capacitor/android-template/app/src/main/res/values/styles.xml:19-21`). `BridgeActivity.onCreate` swaps to the app theme before `setContentView` (`capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java:25-26`).
- The splash-screen plugin tries androidx `installSplashScreen` + `setKeepOnScreenCondition` + a pre-draw listener first (`capacitor-plugins/splash-screen/android/src/main/java/com/capacitorjs/plugins/splashscreen/SplashScreen.java:71-78`, `:95-157`).
- If that throws, it falls back to a `Dialog` (`:175-194`) or an `ImageView` added through `WindowManager.addView` (`:420-432`).
- `clearOnExitAnimationListener` is gated at `SDK_INT >= S` (`:117-118`).

**androidx core-splashscreen below 31 [K]**
- `windowBackground` is a layer-list (color plus centered icon), drawn by the system starting window.
- `setKeepOnScreenCondition` is the same "pre-draw returns false" trick akan-native uses, and it works on every level.
- For the exit animation it adds a look-alike view to the decor.

**Recommended for akan-native**
1. Below 31: `values/themes.xml` with `android:windowBackground=@drawable/akan_native_launch`:
   ```xml
   <layer-list xmlns:android="http://schemas.android.com/apk/res/android">
     <item android:drawable="@color/akan_native_splash_background"/>
     <item android:gravity="center"><bitmap android:gravity="center" android:src="@drawable/akan_native_splash"/></item>
   </layer-list>
   ```
2. Add an explicit `values-v31/themes.xml` that keeps `windowBackground=@color/akan_native_background` plus the `windowSplashScreen*` attributes, so 31+ does not also show the image as a window background.
3. `applyBackground()` already replaces the window background in `onCreate` (AkanNativeActivity.kt:177), so the layer-list only lives in the starting window. The pre-draw hold works unchanged on 29/30.
4. Gate the `splashScreen.setOnExitAnimationListener` call on `SDK_INT >= 31`, in an `Api31` holder.
5. Below 31 the system removes the starting window with its own animation. For `hide({fadeOutDuration})` below 31, add an overlay to `window.decorView`: a `FrameLayout` with the color plus a centered `ImageView`. Animate its alpha, as core-splashscreen and Capacitor's `ImageView` path do.

### 1g. Back (OnBackInvokedDispatcher, 33; AkanNativeActivity.kt:497-514)

**Platform rule [K]**
- On 33+ with `android:enableOnBackInvokedCallback="true"` (`android.ts:121`), `onBackPressed()` is never called and `KEYCODE_BACK` is not dispatched to the app.
- Below 33 the attribute is ignored, and `Activity.onKeyUp(KEYCODE_BACK)` calls `onBackPressed()`.
- **Default `onBackPressed()` on 29/30 finishes a root activity**: `onDestroy`, `webView.destroy()`, page lost. From 31 on, a root launcher activity is moved to the back instead. So `docs/research/android.md:19` ("the system sends the task back and keeps the process") only holds on 31+.

**References**
- Capacitor app plugin `OnBackPressedCallback`: emits `backButton` if the page listens, else `goBack()` (`capacitor-plugins/app/android/src/main/java/com/capacitorjs/plugins/app/AppPlugin.java:46-62`). capacitor-plugins-next adds a predictive `OnBackAnimationCallback` on 34+ (`AppPlugin.java:42`, `:237-332`).
- RN `ReactActivity.java:29-38` and `:123-130`.
- wry `WryActivity.kt:57-70`: `goBack()` else disable the callback and call `onBackPressed()`.
- Tauri `tauri/crates/tauri/mobile/android/src/main/java/app/tauri/AppPlugin.kt:28-46`.
- androidx `ComponentActivity` overrides `onBackPressed()` to run its dispatcher. On 33+ it registers one platform callback only while one of its callbacks is enabled [K].

**Recommended for akan-native**
```kotlin
// create the platform callback lazily and only on 33+ (see §0 #1)
private var backCallback: Any? = null   // OnBackInvokedCallback on 33+
private fun updateBackCallback() {
    if (Build.VERSION.SDK_INT < 33) return          // onBackPressed() handles it
    Api33.update(this, want = fullscreenView != null || backInterceptor != null || webView.canGoBack())
}
@Deprecated("platform <33 only") @Suppress("DEPRECATION")
override fun onBackPressed() {                     // reached only below 33 (or with the flag off)
    when {
        fullscreenView != null -> exitFullscreen()
        backInterceptor != null -> backInterceptor!!.invoke()
        webView.canGoBack() -> webView.goBack()
        Build.VERSION.SDK_INT < 31 -> moveTaskToBack(true)   // keep the page alive, like 31+
        else -> super.onBackPressed()
    }
}
```

### 1h. WebView darkening (AkanNativeActivity.kt:94)

```kotlin
if (Build.VERSION.SDK_INT >= 33) Api33.noAlgorithmicDarkening(settings)
else @Suppress("DEPRECATION") { settings.forceDark = WebSettings.FORCE_DARK_OFF }   // API 29, deprecated 33
```
- For target ≥ 33, `setForceDark` is a documented no-op, and WebView derives `prefers-color-scheme` from the theme's `isLightTheme` (SDK `WebSettings.java:1610-1617`, `:1636-1660`). This is decided by the WebView APK from the app's targetSdk, so the default on a 29 device with a current WebView is already "no darkening" [K, verify].
- `FORCE_DARK_OFF` also covers stale WebViews that still use the legacy model.
- No reference touches WebView darkening. The only "ForceDark" hits are Lynx's own renderer (`lynx/.../LynxContext.java:1685-1699`).
- `android:forceDarkAllowed="false"` (29) on the theme is an extra belt against the system Force Dark.

### 1: pitfalls
- `setSystemUiVisibility` replaces the whole word. Always read-modify-write, or a light-icon change drops the `LAYOUT_*` or immersive flags.
- `FLAG_LAYOUT_NO_LIMITS` breaks insets completely [K]. Use the `SYSTEM_UI_FLAG_LAYOUT_*` flags.
- `statusBarColor`/`navigationBarColor` are ignored on 35+ when edge-to-edge is enforced (Capacitor `StatusBar.java:121-142` gates them below 35).
- Cutout on 28-29: landscape is letterboxed without `SHORT_EDGES`. The cutout comes separately from `getDisplayCutout()`, so take the per-side max.
- `getRootWindowInsets()` is null before attach (Capacitor `StatusBar.java:182-186`, RN `ReactRootView.java:939-942`). akan-native's listener-driven `currentInsets` stays at zero until the first dispatch.

---

## 2. Keyboard (plugins/keyboard/android/KeyboardPlugin.kt)

**akan-native usage**
- `:37` `window.insetsController?.hide(WindowInsets.Type.ime())` (30).
- The state comes from the shell's IME insets (§1b).

**Fallback**
- Guard `:37` with `SDK_INT >= 30`. On 29, `imm.hideSoftInputFromWindow(webView.windowToken, 0)` at `:36` (API 3) is exactly what androidx `WindowInsetsControllerCompat.hide(ime())` does [K], as does RN `ReactEditText.kt:979`.
- Height and visibility come from §1b (`sw.bottom - st.bottom`).

**What the references do**
- **RN** `ReactRootView.java:914-986` (`CustomGlobalLayoutListener.checkForKeyboardEvents`), an `OnGlobalLayoutListener` on every level:
  - reads `WindowInsetsCompat` `isVisible(ime())`;
  - height = `ime.bottom − systemBars.bottom` (`:944-949`);
  - `SOFT_INPUT_ADJUST_NOTHING` special case for screenY (`:958-964`);
  - early return when root insets are null (`:939-942`).
  - Older RN had a `checkForKeyboardEventsLegacy()` below 30: `heightDiff = displayMetrics.heightPixels − visibleFrame.bottom + cutout.safeInsetTop`, with a 60 dp minimum [K; not in this clone].
- **Lynx**, framework-only:
  - Below 30 it measures with an invisible 2 px `Dialog` using `SOFT_INPUT_ADJUST_RESIZE` and `FLAG_NOT_FOCUSABLE | FLAG_ALT_FOCUSABLE_IM | FLAG_NOT_TOUCH_MODAL`. It clears FULLSCREEN, TRANSLUCENT_* and LAYOUT_IN_SCREEN, so its `getWindowVisibleDisplayFrame` shrinks whatever the host does (`lynx/platform/android/lynx_android/.../behavior/KeyboardMonitor.java:24-49`, `:82-107`).
  - It uses thresholds of 0.4 and 0.9 (`KeyboardEvent.java:52-53`, `:142-190`).
  - On 30+ it uses `max(0, ime.bottom − navigationBars.bottom)` (`:622-633`, `:850-857`).
- **Capacitor keyboard plugin**: not in the clones (it lives in ionic-team/capacitor-keyboard).
  - v5+ uses `WindowInsetsAnimationCompat` with `isVisible(ime())` and reports the raw `getInsets(ime()).bottom`, which includes the nav bar [K].
  - Older versions used a `getWindowVisibleDisplayFrame` diff with a >100 px threshold [K].
  - `resizeOnFullScreen` is the AndroidBug5497 workaround. Capacitor core now warns against it (`SystemBars.java:65-74`).

**Pitfalls**
- **Before 30 the IME only shows up in the insets with adjustResize.**
  - With adjustPan only the hidden visible insets change.
  - With adjustNothing nothing is reported at all, which is why Lynx uses a separate adjustResize window.
  - akan-native's manifest uses adjustResize (`android.ts:127`), which is correct. Never switch to adjustNothing or adjustPan on 29.
- Once the `LAYOUT_*` flags are set, adjustResize **stops resizing the window**. The IME only arrives as insets, so the root must pad itself, which akan-native already does at AkanNativeActivity.kt:458. The window `FLAG_FULLSCREEN` makes adjustResize ignored altogether (SDK `WindowManager.java:3852-3854`).
- Clamp `sw.bottom - st.bottom` at 0: hidden bars can make it negative.
- The height definitions differ: RN and akan-native use `ime − systemBars`, Lynx `ime − navigationBars`, the Capacitor plugin raw `ime` [K]. Document akan-native's choice.

---

## 3. Haptics (plugins/haptics/android/HapticsPlugin.kt)

**akan-native usage, with API levels**
- `VibratorManager.defaultVibrator` (31): `:25`
- `VibrationAttributes.createForUsage(USAGE_TOUCH)` (class 30, method **33**): `:26`. Both are field initializers, so they crash plugin construction (§0 #4).
- `vibrate(VibrationEffect, VibrationAttributes)` (33): `:77`
- `areAllPrimitivesSupported` (30): `:64`
- `startComposition` / `addPrimitive` / `compose` (30): `:65-67`
- `PRIMITIVE_CLICK` and `PRIMITIVE_TICK` (30) and `PRIMITIVE_LOW_TICK` (**31**) are inlined constants: `:85-87`
- Already fine on 29: `createPredefined` and every `EFFECT_*` (29), `createOneShot` / `createWaveform` (26), `hasAmplitudeControl` (26).

**References**
- RN `react-native/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/vibration/VibrationModule.kt:54-63` and Tauri `tauri-plugins-workspace/plugins/haptics/android/src/main/java/HapticsPlugin.kt:90-96` (v3 identical) both gate `VibratorManager` at `SDK_INT >= S`, else `getSystemService(VIBRATOR_SERVICE)`.
- Tauri plays only amplitude waveforms (`HapticsPlugin.kt:136-142`, `patterns/Impact.kt:7-35`, `patterns/Notification.kt:7-23`).
- Capacitor Haptics is not in the clones (`capacitor-plugins/README.md:52`).
- No reference uses `View.performHapticFeedback`.

**The touch-feedback setting before 33**
- `Settings.System.HAPTIC_FEEDBACK_ENABLED` (API 3, deprecated 33) carries this javadoc: "Replaced by using VibrationAttributes#USAGE_TOUCH… User settings are applied automatically by the service" (SDK `Settings.java:6150-6160`).
- So on 29-32 the app has to honor the toggle itself.
- On 30+ `AudioAttributes.USAGE_ASSISTANCE_SONIFICATION` maps to `VibrationAttributes.USAGE_TOUCH` (SDK `VibrationAttributes.java:458-482`, `Builder(AudioAttributes)`). That makes it the right pre-33 stand-in.

**Fallback**
```kotlin
private val vibrator: Vibrator? =
    if (Build.VERSION.SDK_INT >= 31) Api31.defaultVibrator(activity)
    else @Suppress("DEPRECATION") activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
private val sonification = AudioAttributes.Builder()                                   // API 21
    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
private fun touchAllowed() = Build.VERSION.SDK_INT >= 33 ||
    @Suppress("DEPRECATION") Settings.System.getInt(activity.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) != 0
private fun playTouch(v: Vibrator, e: VibrationEffect) {
    if (!touchAllowed()) return
    if (Build.VERSION.SDK_INT >= 33) Api33.vibrateTouch(v, e)          // VibrationAttributes.createForUsage(USAGE_TOUCH)
    else @Suppress("DEPRECATION") v.vibrate(e, sonification)           // API 26, deprecated 33
}
private fun compose(vararg steps: Step): VibrationEffect? {
    if (Build.VERSION.SDK_INT < 30) return null                        // → createPredefined(EFFECT_*) path
    if (Build.VERSION.SDK_INT < 31 && steps.any { it.primitive == PRIMITIVE_LOW_TICK }) return null
    return Api30.compose(vibrator ?: return null, steps)               // areAllPrimitivesSupported + startComposition
}
```

**Alternative with no VIBRATE permission**
- `webView.performHapticFeedback(HapticFeedbackConstants.X)` (API 3) always honors the toggle.
- Vocabulary on 29: `VIRTUAL_KEY` 5, `KEYBOARD_TAP` 8, `LONG_PRESS` 3, `CLOCK_TICK` 21, `CONTEXT_CLICK` 23, `TEXT_HANDLE_MOVE` 27.
- `CONFIRM`, `REJECT` and `GESTURE_START` are 30. `SEGMENT_TICK` is 34.
- A sensible use is selection → `CLOCK_TICK` on 29-32.
- It returns false when the view is detached or haptics are off.

**Pitfalls**
- Without amplitude control, waveforms turn into plain buzzes. Pick a timings-only pattern when `hasAmplitudeControl()` is false.
- `createPredefined` falls back to an OEM pattern when the hardware lacks the effect [K].
- Do not keep `VibrationAttributes` in a field.

---

## 4. Biometric (plugins/biometric/android/BiometricPlugin.kt)

**akan-native usage**
- `canAuthenticate(int)` (30): `:53`, `:75`
- `setAllowedAuthenticators` (30): `:85`
- `Authenticators.BIOMETRIC_WEAK` / `DEVICE_CREDENTIAL` (class 30) are inlined.
- `BIOMETRIC_ERROR_NOT_ENABLED_FOR_APPS` is **API 36** in both classes (`:58`, `:120`, `:128`). It is inlined and simply never returned below 36.
- Fine on 29: the `BiometricManager` class and `canAuthenticate()` (29, deprecated 30), `BiometricPrompt` / `setNegativeButton` (28), `setDeviceCredentialAllowed` (29, deprecated 30), `setConfirmationRequired` (29), `BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL` (29), `FEATURE_FACE` / `FEATURE_IRIS` (29).
- `BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED` is 30.

**References**
Tauri (androidx.biometric; v3 identical):
- `tauri-plugins-workspace/plugins/biometric/android/src/main/java/BiometricPlugin.kt:115-120`: `canAuthenticate(BIOMETRIC_WEAK)` on R+, else `canAuthenticate()`.
- `BiometricActivity.kt:56-65`: `setAllowedAuthenticators` on R+, else `setDeviceCredentialAllowed`.
- `:42-49`: credential only when `KeyguardManager.isDeviceSecure`.
- `:70-75`: no negative button together with credential.
- SDK javadoc `BiometricManager.java:571-587`: on 30+, `canAuthenticate()` is equivalent to `canAuthenticate(BIOMETRIC_WEAK)`. On 29 it has one tier ("strong biometrics").

**Fallback**
```kotlin
private fun code(allowCredential: Boolean): Int {
    val m = manager ?: return BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE
    if (Build.VERSION.SDK_INT >= 30) return Api30.canAuthenticate(m, if (allowCredential) WEAK or CRED else WEAK)
    @Suppress("DEPRECATION") val bio = m.canAuthenticate()                 // biometrics only on 29
    return if (bio != BiometricManager.BIOMETRIC_SUCCESS && allowCredential && deviceSecure()) BiometricManager.BIOMETRIC_SUCCESS else bio
}
// builder
if (Build.VERSION.SDK_INT >= 30) Api30.allow(builder, authenticators)
else @Suppress("DEPRECATION") builder.setDeviceCredentialAllowed(allowCredential)
builder.setConfirmationRequired(false)                                        // API 29: face without an extra tap
// 29 + credential allowed + (no usable biometric, or no biometric hardware feature): KeyguardManager path
@Suppress("DEPRECATION") val i = activity.getSystemService(KeyguardManager::class.java)
    ?.createConfirmDeviceCredentialIntent(title ?: reason, if (title != null) reason else null)     // API 21
    ?: return reply.reject(AkanNativeErrorCode.PERMISSION_DENIED, "no screen lock is set up")
context.startActivityForResult("credential", i) { rc, _ -> if (rc == Activity.RESULT_OK) reply.resolve() else reply.reject(AkanNativeErrorCode.CANCELLED, "authentication was cancelled") }
```

**Pitfalls**
- On 29, `canAuthenticate()` ignores the device credential. Use `isDeviceSecure` for "credential only" availability.
- On 29 only OEM-integrated (strong) biometrics count. Many face unlocks are invisible to apps, so `FEATURE_FACE` can be present while `canAuthenticate()` says NONE_ENROLLED or HW_UNAVAILABLE. Derive `type` from `canAuthenticate()`, not from the feature flag alone.
- androidx 1.1 avoids BiometricPrompt on API 29 when there is no biometric hardware feature ("BiometricPrompt fails to launch the confirm device credential Settings activity") and, for biometric plus credential, on vendors outside its exclude list. It calls `createConfirmDeviceCredentialIntent` instead [K]. Do the same.
- `setDeviceCredentialAllowed(true)` with `setNegativeButton` makes `build()` throw, as on 30+.

---

## 5. Geolocation (plugins/geolocation/android/GeolocationPlugin.kt)

**akan-native usage**
- `LocationRequest.Builder` and `QUALITY_*` (31): `:152-155`, `:238-241`
- `getCurrentLocation(String, LocationRequest, CancellationSignal, Executor, Consumer)` (31): `:174`
- `hasProvider` (31): `:188`, `:195`
- `requestLocationUpdates(String, LocationRequest, Executor, LocationListener)` (31): `:243`
- `FUSED_PROVIDER` (31, the inlined string `"fused"`): `:197`, `:285`

**The ladder**

| API | getCurrentPosition | watch |
|---|---|---|
| 31+ | as today | as today |
| 30 | `getCurrentLocation(String, CancellationSignal, Executor, Consumer)` (30) | `requestLocationUpdates(String, long, float, Executor, LocationListener)` (30) |
| 29 | `requestLocationUpdates(String, long, float, LocationListener, Looper)` (API 1) as a one-shot | same call with minTime 1000 or 5000 ms |

Avoid `requestSingleUpdate` (9, deprecated 30).

**References**
- Tauri (v3 identical) uses Play services `FusedLocationProviderClient` and fails when it is missing (`tauri-plugins-workspace/plugins/geolocation/android/src/main/java/Geolocation.kt:36-68`, `:73-116`). It has no LocationManager fallback.
- Its last-known cache (`:127-143`) actually keeps the oldest fix within maximumAge (`:136`). akan-native's `maxByOrNull` is right.
- Capacitor Geolocation is not cloned (`capacitor-plugins/README.md:50`). It is Play services fused too [K].
- RN core, Lynx and wry have no location code.
- androidx `LocationManagerCompat` [K]:
  - `hasProvider` below 31 = `getAllProviders().contains(p) || getProvider(p) != null` (try/catch).
  - `getCurrentLocation` below 30 = `getLastKnownLocation` if it is under 10 s old, else `requestLocationUpdates(p, 0, 0, listener, mainLooper)`, with `onProviderDisabled` giving null and a 30 s timeout.

**Fallback**
```kotlin
private fun has(lm: LocationManager, p: String): Boolean =
    if (Build.VERSION.SDK_INT >= 31) Api31.hasProvider(lm, p)
    else p in lm.allProviders || runCatching { @Suppress("DEPRECATION") lm.getProvider(p) != null }.getOrDefault(false)
// provider(): only consider FUSED_PROVIDER when SDK_INT >= 31; on 29/30: GPS (fine+high) / NETWORK / GPS.

private fun current(lm: LocationManager, provider: String, high: Boolean, timeout: Long, signal: CancellationSignal, done: (Location?) -> Unit) {
    when {
        Build.VERSION.SDK_INT >= 31 -> Api31.getCurrentLocation(lm, provider, high, timeout, signal, activity.mainExecutor, done)
        Build.VERSION.SDK_INT >= 30 -> Api30.getCurrentLocation(lm, provider, signal, activity.mainExecutor, done)
        else -> {
            var finished = false
            lateinit var listener: LocationListener
            val finish = { l: Location? -> if (!finished) { finished = true; lm.removeUpdates(listener); done(l) } }
            listener = object : LocationListener {
                override fun onLocationChanged(location: Location) = finish(location)
                override fun onProviderDisabled(provider: String) = finish(null)
                override fun onProviderEnabled(provider: String) {}
                @Deprecated("abstract before API 30") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            }
            signal.setOnCancelListener { if (!finished) { finished = true; lm.removeUpdates(listener) } }
            lm.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())   // API 1
        }
    }
}
```
akan-native's own timer (`:158-165`) keeps enforcing the timeout. On 29 there is no platform 30 s cap on a one-shot.

**Pitfalls**
- **`LocationListener`**: `onStatusChanged`, `onProviderEnabled` and `onProviderDisabled` only have default implementations **from API 30**. The SDK javadoc `LocationListener.java:79-112` says they "must still be overridden in order to run successfully on Android versions below R."
  - akan-native's watch listener (`:225-237`) doesn't override `onStatusChanged`.
  - The same javadoc says Q+ never calls it, so this is low risk on 29, but it costs one line. Override all three in every listener.
- `"fused"` is hidden before 31: `getAllProviders()` filters it out, though `getProvider("fused")` may return it [K]. Use GPS or network below 31.
- A coarse-only app gets `SecurityException` for GPS before 31 (only 31+ coarsens GPS fixes). akan-native already avoids GPS without fine permission, and `runCatching` covers `getLastKnownLocation`.
- The permission dialog has no precise/approximate choice before 31 and no "only this time" before 30. The KDoc at `:27-29` describes 12+ behaviour.

---

## 6. Appearance (plugins/appearance/android/AppearancePlugin.kt)

**akan-native usage**
- `UiModeManager.setApplicationNightMode` (31) at `:40`, in the constructor (crashes the plugin build on 29/30; `catch (RuntimeException)` does not help), and at `:50`.
- `UiModeManager.setNightMode` (8) is system-wide car/desk mode (SDK `UiModeManager.java:1126-1143`), so it is not an option.

**References**
- RN uses `AppCompatDelegate.setDefaultNightMode` (`react-native/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/appearance/AppearanceModule.kt:85-95`, `ReactHostImpl.kt:448-457`) and reads the Activity `uiMode` (`AppearanceModule.kt:77-83`).
- Lynx stores a preference for its own renderer (`ExplorerAppearance.kt:14-44`).
- Capacitor only reads `uiMode` (`SystemBars.java:328-329`).
- AppCompat below 31 [K]:
  - With `uiMode` in `configChanges` (akan-native has it, `android.ts:97`): `Resources.updateConfiguration` with new night bits, then a theme rebase, then `onConfigurationChanged`.
  - Otherwise: `recreate()`.
  - Since 1.2 it also applies an override configuration in `attachBaseContext2`.

**What decides the WebView's scheme**
- For target ≥ 33, WebView always sets `prefers-color-scheme` from the theme's `isLightTheme` (SDK `WebSettings.java:1636-1660`). This is WebView-APK behaviour, so it also applies on 29 devices with an updated WebView.
- So the lever is the Activity theme's night bits. `Theme.DeviceDefault.DayNight` and `isLightTheme` are both API 29.

**Fallback (29/30; keep `setApplicationNightMode` on 31+)**
```kotlin
// AkanNativeActivity
override fun attachBaseContext(newBase: Context) {
    super.attachBaseContext(newBase)
    if (Build.VERSION.SDK_INT < 31) storedNight(newBase)?.let { night ->         // prefs "akan-native.appearance"/"setting"
        applyOverrideConfiguration(Configuration().apply {                       // a delta: only the night bits are defined
            uiMode = if (night) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
        })
    }
}
// AppearancePlugin.set on < 31
prefs.edit().putString(KEY, args.mode.json).commit()           // commit: attachBaseContext reads it next
reply.resolve()
if (Build.VERSION.SDK_INT < 31 && schemeChanges) main.post { context.activity.recreate() }   // "system": clear, recreate
```

**Why it works**
- `Configuration()` starts undefined, so `updateFrom` replaces only the night bits (SDK `Configuration.java:1756-1767`).
- `applyOverrideConfiguration` must run once, before `getResources()` (`ContextThemeWrapper.java:95-113`).
- The override becomes part of the ResourcesKey [K]. It therefore survives rotations, system dark-mode switches, and the ResourcesImpl rebuild caused by WebView's first initialization appending its asset path. That rebuild is the known "WebView resets the app locale" bug, which drops plain `updateConfiguration` changes.

**Alternatives and pitfalls**
- **No-reload alternative (unverified):** `resources.updateConfiguration(...)` (deprecated), then `theme.rebase()` (29), then `applyBackground()`, then `webView.dispatchConfigurationChanged(cfg)`. It has to be re-applied in every `onConfigurationChanged`. Whether WebView re-reads `isLightTheme` on that path needs testing on 29/30, so `recreate()` is the safe default.
- `recreate()` reloads the page and loses WebView history. Document that `set()` below 31 reloads.

---

## 7. Local notifications (plugins/local-notifications/android/*.kt)

**akan-native usage**
- `LocalNotifications.kt:174` `canScheduleExactAlarms()` (31). `NoSuchMethodError` is not a `SecurityException`, and the call runs from plugin init through RESTORE (`LocalNotificationsPlugin.kt:46-47`).
- `POST_NOTIFICATIONS` (33 constant) is requested and checked at `LocalNotificationsPlugin.kt:83` and `:91`.

**References**
- **Capacitor local-notifications** (`capacitor-plugins/local-notifications/android/src/main/java/com/capacitorjs/plugins/localnotifications/`):
  - `LocalNotificationManager.java:374-397`: inexact only when `SDK_INT >= S && !canScheduleExactAlarms()`. The same gate is in `TimedNotificationPublisher.java:74-81`.
  - `LocalNotificationManager.java:130-137`: schedule rejects when `!areNotificationsEnabled()`.
  - `LocalNotificationsPlugin.java:207-226`, `:262-268`: below TIRAMISU, check and request never touch `POST_NOTIFICATIONS` and answer `areNotificationsEnabled() ? granted : denied`.
  - `:229-239`, `:270-281`: exact-alarm settings only on S+, and "granted" below.
- **Capacitor push-notifications** answers "granted" below 33 unconditionally (`capacitor-plugins/push-notifications/android/src/main/java/com/capacitorjs/plugins/pushnotifications/PushNotificationsPlugin.java:91-110`).
- **Tauri**: same `setExactIfPossible` (`tauri-plugins-workspace/plugins/notification/android/src/main/java/TauriNotificationManager.kt:365-384`) and a TIRAMISU gate (`NotificationPlugin.kt:244-263`, `:279-285`).
  - Its `requestPermissions` never resolves on 33+ when already granted (`:259-261`, v3 `:255-257`). akan-native's early return avoids that.

**Fallback**
```kotlin
// LocalNotifications.arm
val exact = Build.VERSION.SDK_INT < 31 || Api31.canScheduleExactAlarms(alarms)   // 29/30: always allowed
if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, pi)   // API 23
else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, pi)
// LocalNotificationsPlugin
private fun display(): LocalNotificationsPermissionState {
    if (manager.areNotificationsEnabled()) return LocalNotificationsPermissionState.GRANTED   // API 24
    if (Build.VERSION.SDK_INT < 33) return LocalNotificationsPermissionState.DENIED         // blocked in Settings; no runtime prompt exists
    /* existing 33+ logic */
}
override fun requestPermission(...) {
    val state = display()
    if (Build.VERSION.SDK_INT < 33 || state == GRANTED || state == DENIED) return reply.resolve(...(state))
    context.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) { ... }
}
```
Optionally open `Settings.ACTION_APP_NOTIFICATION_SETTINGS` + `EXTRA_APP_PACKAGE` (26) for the "denied below 33" case.

**Pitfalls**
- **Requesting `POST_NOTIFICATIONS` below 33 poisons the permission history.**
  - The platform does not know the permission. `requestPermissions` answers DENIED at once with no UI [K], and akan-native's `AkanNativePermissionHistory.record` (AkanNativePlugin.kt `AkanNativePermissionHistory`, via `AkanNativeActivity.kt:535`) stores it as refused.
  - After an OS upgrade to 13, `permissionState` would say "denied" (permanent) although the user was never asked.
  - Gate the **request**, not only the state. As defence, `AkanNativeActivity.requestPermissions` could drop permissions unknown to the platform (`packageManager.getPermissionInfo` throws `NameNotFoundException`).
- A channel set to `IMPORTANCE_NONE` blocks while `areNotificationsEnabled()` stays true, on every level.

---

## 8. Share (plugins/share/android/SharePlugin.kt)

**akan-native usage**
- `:66` typed `getParcelableExtra` (33). Now goes through `AkanNativeCompat.parcelableExtra`, which gates at **33**.
- `:86` `registerReceiver(…, RECEIVER_NOT_EXPORTED)` (flag 33; the 3-arg method is 26).
- `:173` `FLAG_MUTABLE` (31 constant) without a gate.

**References**
- **Capacitor share** (`capacitor-plugins/share/android/src/main/java/com/capacitorjs/plugins/share/SharePlugin.java`; next identical):
  - A dynamic receiver with a per-share UUID nonce, "prevent spoofing from other apps" (`:38-62`).
  - Registered deliberately **exported** (`ContextCompat.RECEIVER_EXPORTED`, `:63-68`), with an **implicit** callback intent, so the nonce is the only protection.
  - Typed getter on T+ (`:50-54`, `:72-74`).
  - `FLAG_MUTABLE` only on S+, plus `FLAG_ALLOW_UNSAFE_IMPLICIT_INTENT` on 34+ (`:141-156`).
- RN `ShareModule.kt:31-58` has no result tracking.
- RN `DevSupportManagerBase.kt:968-986` (`compatRegisterReceiver`) and Lynx `LynxNativeMemoryTracer.java:66-74` / `TraceController.java:270-280` pass receiver flags only on 34+ (or 33+).
- SDK-gated Parcelable getters: Tauri `NfcPlugin.kt:231-236`, `TauriNotificationManager.kt:476-482`.

**Facts**
- `createChooser(Intent, CharSequence, IntentSender)` and `EXTRA_CHOSEN_COMPONENT` are API 22.
- Below 33 the system only looks at `RECEIVER_VISIBLE_TO_INSTANT_APPS` in the flags [K]. `0x4` is ignored, so **akan-native's dynamic receiver is exported on 29-32**.
- The `setPackage` PendingIntent still only delivers to akan-native, but any app can send the custom action to the exported receiver. The nonce is what protects it, as in Capacitor. The current comment at `:84-85` says exactly this.
- A PendingIntent broadcast is sent with its **creator's** identity, even when the chooser calls `send()` [K].

**Recommended hardening: nonce + signature permission** (what androidx `ContextCompat.registerReceiver(…, RECEIVER_NOT_EXPORTED)` does below 33 with `<pkg>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` [K]):
```xml
<!-- plugins/share/native-plugin.json "manifestXml" (applicationId is substituted, android.ts:113 and :147) -->
<permission android:name="${applicationId}.AKAN_NATIVE_INTERNAL_BROADCAST" android:protectionLevel="signature" />
<uses-permission android:name="${applicationId}.AKAN_NATIVE_INTERNAL_BROADCAST" />
```
```kotlin
private val internal = activity.packageName + ".AKAN_NATIVE_INTERNAL_BROADCAST"
init {
    val filter = IntentFilter(action)
    if (Build.VERSION.SDK_INT >= 33) Api33.register(activity, receiver, filter, internal)   // flags RECEIVER_NOT_EXPORTED
    else activity.registerReceiver(receiver, filter, internal, null)                        // API 1: the sender must hold `internal`
}
val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
```

**Alternatives**
- (a) Nonce only. This is Capacitor's shipped approach and acceptable.
- (b) A static `exported="false"` receiver in `applicationXml`, the pattern `LocalNotificationReceiver` already uses, handing off to the plugin through a static field.
- (c) `Activity.createPendingResult` [K, untested ordering with the chooser result].

**Pitfalls**
- **Gate the typed Parcelable getter at 34, not 33.** androidx `IntentCompat`/`BundleCompat` use the typed getters only on 34+ because of an Android 13 bug in them [K]. Change `AkanNativeCompat.parcelableExtra` (AkanNativeCompat.kt:19) to `>= 34`.
- A missing `<permission>` does not throw. Broadcasts just never arrive, so `target` is always null. Test on a 29-32 emulator.
- Keep the permission name per-app (`${applicationId}`): a shared name makes installs fail with `INSTALL_FAILED_DUPLICATE_PERMISSION` next to a differently signed app.
- Below 31 a PendingIntent without `FLAG_IMMUTABLE` is mutable anyway. The unknown `1<<25` bit is ignored [K], but gate it like every reference does.

---

## 9. Camera: photo picker (plugins/camera/android/CameraPlugin.kt)

**akan-native usage**
- `:120` and `:146` `MediaStore.ACTION_PICK_IMAGES` (a 33 String constant, inlined). On 29 there is no activity, so it throws `ActivityNotFoundException`, and the user gets "no photo picker" (UNSUPPORTED). That is a feature loss, not a crash.
- `:147` `MediaStore.getPickImagesMaxLimit()`: 33, or 30+ with R-extension ≥ 2 (`api-versions.xml`: `sdks="30:2,31:2,33:2,0:33"`). `NoSuchMethodError` on 29 and on 30-32 without the extension.

**References**
- **Capacitor camera** (minSdk 24): library picks go through androidx `PickVisualMedia` / `PickMultipleVisualMedia(limit)` (`capacitor-plugins/camera/android/src/main/java/com/capacitorjs/plugins/camera/CameraPlugin.java:342-402`).
  - Picking requests no storage permission. READ/WRITE_EXTERNAL_STORAGE are only for saving on ≤ 28 (`:70-85`, `:200-238`; comment at `:208`).
  - Saving on Q+ is a MediaStore insert with `RELATIVE_PATH=DCIM` (`:615-650`).
- **Tauri dialog**: `ACTION_GET_CONTENT` + `CATEGORY_OPENABLE` + `EXTRA_ALLOW_MULTIPLE` (`tauri-plugins-workspace/plugins/dialog/android/src/main/java/DialogPlugin.kt:55-86`, with a "TODO: ACTION_OPEN_DOCUMENT ??" at `:62`).
- **androidx `PickVisualMedia` internals** [K]:
  - `isSystemPickerAvailable = SDK_INT >= 33 || (SDK_INT >= 30 && SdkExtensions.getExtensionVersion(R) >= 2)`.
  - Otherwise the Play-services backport, resolved with `MATCH_DEFAULT_ONLY | MATCH_SYSTEM_ONLY` and made explicit with `setClassName`: first `androidx.activity.result.contract.action.PICK_IMAGES` (extra `…extra.PICK_IMAGES_MAX`), then `com.google.android.gms.provider.action.PICK_IMAGES` (extra `…extra.PICK_IMAGES_MAX`).
  - Otherwise `ACTION_OPEN_DOCUMENT` with `image/*` plus `EXTRA_ALLOW_MULTIPLE`, with no maximum.
  - The backport module is installed on 19-29 when the manifest declares the `com.google.android.gms.metadata.ModuleDependencies` service (`enabled="false"`, `exported="false"`) with a `MODULE_DEPENDENCIES` intent filter and `<meta-data android:name="photopicker_activity:0:required" android:value=""/>`. That is manifest only, with no library, so akan-native can use it.

**Fallback**
```kotlin
private fun systemPicker() = Build.VERSION.SDK_INT >= 33 ||
    (Build.VERSION.SDK_INT >= 30 && Api30.rExtension() >= 2)     // SdkExtensions.getExtensionVersion(R), API 30

private fun pickIntent(limit: Int): Intent {
    if (systemPicker()) return Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*").apply {
        if (limit > 1) putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, minOf(limit, ApiR2.pickImagesMaxLimit()))  // name it so apilevel.ts accepts it (§14.9)
    }
    val pm = context.activity.packageManager
    for ((action, max) in BACKPORTS) {
        val info = pm.resolveActivity(Intent(action), PackageManager.MATCH_DEFAULT_ONLY or PackageManager.MATCH_SYSTEM_ONLY)?.activityInfo ?: continue
        return Intent(action).setClassName(info.packageName, info.name).setType("image/*").apply { if (limit > 1) putExtra(max, limit) }
    }
    return Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*").apply {  // API 19
        if (limit > 1) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)                                               // API 18
    }
}
```

**Pitfalls**
- `ACTION_OPEN_DOCUMENT` and `ACTION_GET_CONTENT` need **no storage permission**: the grant is per URI and temporary, so copy right away. akan-native already copies on a thread.
- SAF cannot cap the count. Keep `uris.take(limit)`.
- Prefer `ACTION_OPEN_DOCUMENT`: only DocumentsUI answers it. Any app can answer GET_CONTENT and return `file://` or this app's own provider URIs.
  - `AkanNativeActivity.chosenFiles` (:399-410) filters those for `<input type=file>`, but `CameraPlugin.pick` / `pickImages` do not. Reuse that filter.
- SAF results may be cloud documents, where `openInputStream` blocks or fails.
- `saveToGallery` (:189-210) is fine on 29: `RELATIVE_PATH`, `IS_PENDING` and `VOLUME_EXTERNAL_PRIMARY` are API 29, and no WRITE permission is needed under scoped storage (Capacitor gates at `SDK_INT >= Q`, `CameraPlugin.java:208`, `:615`).

---

## 10. `java.lang.ref.Cleaner` (33): AkanNativeCall

**Already replaced** by `AkanNativeReaper` (AkanNativePlugin.kt:66-86; used at `:103`).

**References**
- **Lynx** `lynx/platform/android/lynx_android/src/main/java/com/lynx/tasm/base/CleanupReference.java` (from Chromium):
  - `PhantomReference` subclass (`:31`)
  - static `ReferenceQueue` (`:40`)
  - daemon reaper thread blocking on `remove()` (`:43-77`)
  - static sets that "Keep a strong reference … so that it will actually get enqueued" (`:136-149`)
  - `runCleanupTaskInternal` removes and `clear()`s (`:206-218`)
  - `cleanupNow()` for explicit release (`:178-190`)
  - Usage in `TemplateBundle.java:53-89`: the task is a static nested class, so it never captures the referent.
- **RN** uses fbjni's `DestructorThread`, which is not in the clone (`react-native/packages/react-native/gradle/libs.versions.toml:25`, `:71`). It keeps a `PhantomReference` subclass in a lock-free stack and a doubly linked list, with a daemon thread on `queue.remove()` [K].

**Review of AkanNativeReaper**
- It is correct: static queue, live set, daemon thread, and a lambda that copies locals so it never captures `this`.
- Suggested improvement (Lynx `cleanupNow`/`clear()`): return a handle and drop the reference when the call completes normally. The `send` closure is then released without waiting for GC, and the live set stops growing with finished calls until they are collected.
```kotlin
class Handle internal constructor(private val ref: Ref) { fun dismiss() { if (live.remove(ref)) ref.clear() } }
fun register(referent: Any, action: () -> Unit): Handle = Ref(referent, action).also { live.add(it) }.let(::Handle)
// AkanNativeCall.complete(): if (finished.compareAndSet(false, true)) { reaper.dismiss(); finish(body) }
```

**Pitfalls**
- An unreachable Reference is collected without ever being enqueued, which is why the live set exists.
- A Kotlin lambda that touches a constructor property captures `this`. Keep the local copies.
- Enqueueing depends on GC timing. A dropped call may be rejected late, or never before the process dies.
- `finalize()` runs on the FinalizerDaemon with a 10 s watchdog (a slow action crashes the app) and is deprecated [K].
- `sun.misc.Cleaner` and `NativeAllocationRegistry` are hidden APIs.

---

## 11. Screen orientation: `Activity.getDisplay` (30)

**Already fixed**: ScreenOrientationPlugin.kt:69 and :93 now call `AkanNativeCompat.display` (see §1e).

**References**
- Capacitor `ScreenOrientation.java:19-25`, `:75-78` (R+ → `getDisplay()`, else `getWindowManager().getDefaultDisplay()`).
- RN `ReactRootView.java:988-998` and `DisplayMetricsHolder.kt:50-62`. The latter comments that non-visual contexts throw on 30+.

**Other facts**
- `Display.getMode()` and `Mode.getPhysicalWidth()` are API 23; `DisplayListener` is 17.
- Use the **Activity's** WindowManager: an Application-context WindowManager returns the primary display.

---

## 12. Minimum WebView version

**Capacitor** (`capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java`)
- `DEFAULT_ANDROID_WEBVIEW_VERSION = 60`, `MINIMUM_ANDROID_WEBVIEW_VERSION = 55`, Huawei 10/10 (`:105-108`). capacitor-next is the same (`capacitor-next/android/capacitor/src/main/java/com/getcapacitor/Bridge.java:92-95`); **neither line raised it**.
- Config keys `android.minWebViewVersion` and `minHuaweiWebViewVersion` are clamped to the minimum with a warning (`capacitor-next/.../CapConfig.java:261-262`, `:384-399`; docs in `capacitor-next/cli/src/declarations.ts:218-244`).
- Detection (`Bridge.java:329-372`): API 26+ uses `WebView.getCurrentWebViewPackage()` and takes the first digit run of `versionName`, with a separate scale for `com.huawei.webview`. Below 26 it uses `getPackageInfo` of `com.android.chrome`, then `com.android.webview`, then `com.amazon.webview.chromium`.
- Enforcement (`:305-313`): if `server.errorPath` is set, load that page from the same local server (`getErrorUrl`, `:553-563`); **otherwise only log** "System WebView is not supported" and load the app anyway.

**Others**
- wry exposes the version only (`wry/src/android/kotlin/WryActivity.kt:76-102`, `wry/src/android/mod.rs:502`). Tauri re-exports it (`tauri/crates/tauri-runtime-wry/src/lib.rs:99`, `:2799`).
- Neither has a minimum gate. Tauri's default minSdk is 24 (`tauri/crates/tauri-utils/src/config.rs:3677-3679`).
- RN core has no WebView host. Lynx renders natively.

**akan-native today**
- No minimum is enforced.
- `AkanNativeActivity.kt:98` parses the `versionName` major only to choose CSS-variable injection below 140. A Huawei "12.x" reads as 12, which harmlessly injects.
- `engineVersion` goes to the page (`:207-208`).

**Chromium versions per feature** (all [K], from memory):

| Chromium | Feature |
|---|---|
| 72 | public and static class fields |
| 74 | private fields `#x` |
| 75 | numeric separators |
| 80 | `?.` and `??` |
| 84 | private methods and accessors, WeakRef |
| 85 | `??=` `||=` `&&=`, `String.replaceAll`, `Promise.any` |
| 89 | top-level await (module scripts only) |
| 90 | RegExp `/d` |
| 91 | `#x in obj` |
| 92 | `Array.prototype.at` |
| 93 | `Object.hasOwn`, Error `cause` |
| **94** | **class static blocks** |
| 97 | `findLast` |
| 98 | `structuredClone` |
| 105 | CSS `:has()` and container queries |
| 108 | `dvh` |
| 140 | WebView `env(safe-area-inset-*)` works (Capacitor `SystemBars.java:39`, not [K]) |

- Android 10 emulator images reportedly ship WebView ~74 [K, uncertain]. A `google_apis` image without Play cannot update it, so an ES2020+ bundle fails to **parse**, and the inlined single-file bundle shows a white screen.
- Test on `google_apis_playstore` images and update "Android System WebView", or `adb install` a newer WebView and pick it under Developer options → WebView implementation.

**Recommendation**
- **Hard syntax floor for unlowered ES2022: Chromium 94.** One static block anywhere makes the whole inlined bundle fail to parse. Bun does not downlevel syntax.
- **Default minimum: 107**, configurable down to 94. That is about the "baseline widely available" level of late 2022 [K].
- Note: Safari only gets class static blocks in 16.4 [K]. The iOS 16.0 floor (akanjs decision) has the same exposure: either transpile static blocks away or raise iOS to 16.4.
- Detect via `WebSettings.getDefaultUserAgent(ctx)` (API 17) with the regex `Chrome/(\d+)`. It covers Google, AOSP, Huawei and Amazon WebViews and avoids Capacitor's Huawei scale. Fall back to the `versionName` digits.
- Check in `onCreate` before `loadUrl`. When too old, show a **shell-owned** ES5 page (or native views): "Update Android System WebView", with a button to `market://details?id=com.google.android.webview`. Do not load the app anyway, as Capacitor's default does.
- Expose the version through `engineVersion` (already done).

---

## 13. Other minSdk 29 pitfalls for WebView apps

- **MessagePort bridge is fine.** `createWebMessageChannel`, `postWebMessage` and `WebMessagePort.setWebMessageCallback(cb, handler)` are API 23 (AkanNativeBridge.kt:85-98). Capacitor instead needs the androidx `WEB_MESSAGE_LISTENER` feature (`capacitor/android/capacitor/src/main/java/com/getcapacitor/MessageHandler.java:26-36`).
- **Fine on 29:** `RenderProcessGoneDetail` (26), `WebViewRenderProcessClient` (29), `shouldInterceptRequest` and `WebResourceResponse(status, reason, headers)` (21), `getCurrentWebViewPackage` (26), `setDataDirectorySuffix` (28, only for multi-process).
- `WebResourceResponse` rejects 3xx status codes on every level. akan-native's dev proxy maps 3xx to 502 (AkanNativeAssetServer.kt:200), which is fine.
- **Scoped storage on 29.**
  - With target ≥ 29, apps get scoped storage unless they set `requestLegacyExternalStorage`, which only 29 honours and 30+ ignores for target ≥ 30.
  - akan-native uses neither the flag nor public paths.
  - `MediaStore` `RELATIVE_PATH` / `IS_PENDING` / `VOLUME_EXTERNAL_PRIMARY` are API 29, so `CameraPlugin.saveToGallery` works with no permission. `getExternalFilesDir(DOCUMENTS)` (FilesystemPlugin.kt:69) needs none either.
- **PendingIntent.**
  - `FLAG_IMMUTABLE` is 23.
  - `FLAG_MUTABLE` is a 31 constant. Old systems ignore the bit, and below 31 a PendingIntent without IMMUTABLE is mutable anyway [K].
  - Every reference gates it: Capacitor `SharePlugin.java:146-152`, `LocalNotificationManager.java:250-253` and `:290-293`, `TimedNotificationPublisher.java:69-72`; Tauri `TauriNotificationManager.kt:233-236`, `NfcPlugin.kt:484`.
  - akan-native `SharePlugin.kt:173` doesn't gate it. It works, but gate it.
- **Foreground services.** The manifest `foregroundServiceType` is 29, `startForeground(id, n, type)` is 29, and the `FOREGROUND_SERVICE_*` permissions and type enforcement are 34. No akan-native plugin uses one yet.
- **Notification trampolines** (31): not an issue, because akan-native's tap PendingIntent targets the activity directly (LocalNotifications.kt:248-251).
- **Package visibility** (30): `<queries>` in auth-session and browser `manifestXml` is ignored on 29, where every package is visible. aapt2 accepts it because it links against android-36.
- **`android:exported`** (required on 31+): akan-native sets it everywhere.
- **Backup.** `allowBackup="false"` covers 29/30. On 31+ it does not stop device-to-device transfer without `dataExtractionRules` [K]. That is not a 29 issue but worth noting for secure-storage keys.
- **Cleartext.** Blocked by default at target ≥ 28. akan-native dev builds use a network security config (24).
- **`getPackageInfo(String, PackageInfoFlags)`** is 33. akan-native uses the int overload (AkanNativeActivity.kt:541, CameraPlugin.kt:62), which is fine. capacitor-next and wry gate the typed one (`capacitor-next/.../util/InternalUtils.java:15-19`, `wry/src/android/kotlin/PermissionHelper.kt:78`).
- **Clipboard** (29): reads only while focused. akan-native already checks `hasWindowFocus()` (ClipboardPlugin.kt:34).
- **Background activity starts** (29): auth-session and browser only start while resumed, which is fine.
- **Location permissions on 29:** background location is a separate permission. akan-native requests only fine and coarse, so the 29 dialog offers "while using / deny".
- **Class verification on old ART** [K]:
  - A class whose methods reference missing APIs is soft-failed. It is re-verified at runtime and runs slower, even if the code never executes.
  - A class that **implements** a missing interface, including d8's synthetic lambda classes, fails to load.
  - Hence the `ApiN` holders, and never a >29 SAM lambda in a field initializer.

---

## 14. Findings the spike missed

### 14.1 `SQLiteRawStatement` (API 35): the whole sqlite plugin
**The problem**
- `plugins/sqlite/android/SqlitePlugin.kt` uses `createRawStatement` and `SQLiteRawStatement.*` (`:149-165`, `:182`, `:211-219`, `:249-263`, and constants at `:253-257`).
- The tree now sets `"minSdk": 35` in `plugins/sqlite/native-plugin.json`, so Android 10-14 get UNSUPPORTED through `AkanNativeUnsupportedPlugin`.
- If akanjs needs sqlite on 29-34, a legacy path is needed. It is all framework API, and **not** in the refs (none has a JVM sqlite layer) [K]. androidx `FrameworkSQLiteDatabase.query(SupportSQLiteQuery)` uses the same trick.
- There is also `SQLiteDatabase.beginTransactionReadOnly` (35), which akan-native does not use.

**Legacy design**
- **Typed binds**: `db.rawQueryWithFactory(factory, sql, null, null)` (API 1). The `SQLiteDatabase.CursorFactory { _, driver, editTable, query -> bindAll(query /* SQLiteQuery : SQLiteProgram */); SQLiteCursor(driver, editTable, query) }` binds with `bindLong`/`bindDouble`/`bindString`/`bindBlob`/`bindNull`. `SQLiteCursor(driver, editTable, query)` is API 11.
  - Plain `rawQuery(sql, String[])` binds everything as TEXT, which is wrong for comparisons and affinity.
- **Parameter count**: probe `bindNull(i)` until `IllegalArgumentException`, as akan-native already does for `SQLiteProgram` (`:225-246`).
- **Column types**: `Cursor.getType(i)` (11) per cell, then `getLong`/`getDouble`/`getString`/`getBlob`. Names come from `cursor.columnNames`.
- **Window size**: the default `CursorWindow` is about 2 MB. Set a larger one with `(cursor as AbstractWindowedCursor).setWindow(CursorWindow(null, bytes))` (the 2-argument constructor is API 28) before the first move. A single row larger than the window throws `SQLiteBlobTooBigException`.
- **Pitfall: re-execution.** When rows overflow the window, `SQLiteCursor` refills by **re-executing the statement from the start**. The first fill also steps through all rows to count them. For `INSERT/UPDATE/DELETE … RETURNING` that means duplicate side effects.
  - Run DML without RETURNING through `compileStatement(...)` (`executeUpdateDelete` 11, `executeInsert`, `execute`).
  - Run RETURNING and SELECT through the cursor inside a transaction. If `cursor.window.numRows < cursor.count` for a non-SELECT, roll back and reject.
- **Counters**: `changes` and `lastInsertId` via `DatabaseUtils.longForQuery(db, "SELECT total_changes()", null)` (API 1) on the same single connection. akan-native's DELETE journal mode ensures a single connection.
- **Structure**: keep the 35+ path in an `Api35` holder.

### 14.2 Ed25519 (Conscrypt, API 33): OTA update signatures
**The problem**
- `native/android/src/com/akanjs/runtime/AkanNativeUpdates.kt:132-143` uses `Signature.getInstance("Ed25519")` / `KeyFactory.getInstance("Ed25519")`. Its KDoc even says "the platform's, API 33+".
- On 29-32 `NoSuchAlgorithmException` is caught and `signed()` returns false. `UpdatesPlugin.kt:185` then fails **every** release with the misleading "the release signature does not match updates.publicKey".
- No bytecode check can see this, because the algorithm is a string.

**Options**
- (1) **Recommended**: a pure-Kotlin Ed25519 *verify* on 29-32, for example a TweetNaCl `crypto_sign_open` port, public domain, about 250 lines.
  - SHA-512 comes from `MessageDigest.getInstance("SHA-512")`, available on all levels.
  - Verification handles only public data, so it needs no constant-time care.
  - Test it with the RFC 8032 vectors in akan-native's shared vectors.
- (2) Sign releases with ECDSA P-256 as well (`SHA256withECDSA`, all levels). This changes the update protocol.
- (3) Give the updates plugin `"minSdk": 33`, which drops OTA updates on 10-12.

At least make the failure message say "Ed25519 not available on this Android" instead of "does not match".

### 14.3 `TypedArray.use {}`: TypedArray is `AutoCloseable` only from API 31
**The problem**
- `plugins/dialog/android/DialogPlugin.kt:207`: `themed.obtainStyledAttributes(intArrayOf(attr)).use { … }`.
- It compiles to `kotlin.jdk7.AutoCloseableKt.closeFinally(AutoCloseable, …)` (confirmed in the bytecode). api-versions.xml line 17907 has `<implements name="java/lang/AutoCloseable" since="31"/>`.
- On 29/30, `close()` goes through `invokeinterface` on a class that does not implement the interface, so `IncompatibleClassChangeError` [K]. This is lint's "implicit cast to AutoCloseable requires API 31".
- It is reached from `actionSheet` (`color(themed, colorError)`) and `header()` (`textColorSecondary`).

**Fix**: `val a = themed.obtainStyledAttributes(...); try { … } finally { a.recycle() }`.

The only other `AutoCloseable` `use` sites are `Files.walk` (Stream, BaseStream 24; fine) and `SQLiteRawStatement` (35, gated). The rest use `Closeable` types that have been `Closeable` since API 1.

### 14.4 SAM lambda in a field initializer
- `AkanNativeActivity.kt:499` (see §0 #1 and §1g).
- Confirmed in bytecode: `invokedynamic … onBackInvoked:(Lcom/akanjs/runtime/AkanNativeActivity;)Landroid/window/OnBackInvokedCallback;` runs in `AkanNativeActivity.<init>`, then `putfield backCallback`.
- apilevel.ts reports "lambda type" references, so it will flag this once it runs. The fix must also move the creation out of `<init>`.

### 14.5 `catch (e: Exception)` does not catch `LinkageError`
These catch sites let `NoSuchMethodError` and `NoClassDefFoundError` through:
- `AkanNativeActivity.kt:113-117` (plugin construction)
- `AkanNativeBridge.kt:193-198` (`plugin.handle`)
- `AkanNativeBridge.kt:262-268` (`safely`)
- `AppearancePlugin.kt:39-43` (`catch RuntimeException`)
- `LocalNotificationReceiver.kt:32` (`catch RuntimeException`)

Add `catch (e: LinkageError)`. Report it as `UNSUPPORTED` with the message, and log it loudly in debug builds, so a missed gate becomes a rejected call instead of a crash loop.

### 14.6 `LocationListener` methods abstract before API 30
See §5. Low risk on 29 (onStatusChanged is never invoked on Q+), but override all three.

### 14.7 Back at the root finishes the activity on 29/30
See §1g. This is a behaviour difference, not a missing API: `moveTaskToBack(true)` below 31.

### 14.8 `POST_NOTIFICATIONS` request below 33 poisons the permission history
See §7.

### 14.9 Blind spots of `packages/cli/src/lib/apilevel.ts` (new in the tree)
1. **Compile-time constants.** This is acknowledged in its header (:13-14). See §15 for the list that has to be reviewed by hand or by a source grep.
2. **Interfaces a framework class gains later.** `loadApiVersions` (:37-49) drops `since` on `<implements … since="31">` lines and still adds the supertype. Implicit casts, such as Kotlin `use` passing a `TypedArray` to `closeFinally(AutoCloseable)`, are not member references of TypedArray at all. §14.3 would therefore pass.
3. **Framework-to-app calls.** App classes implementing framework interfaces whose methods were abstract on older APIs (`LocationListener`, §5) are not checked.
4. **String-named features**: crypto algorithms (`"Ed25519"`, §14.2) and intent actions (`ACTION_PICK_IMAGES`, which becomes `ActivityNotFoundException`).
5. **SDK-extension availability.** `MediaStore.getPickImagesMaxLimit` is `sdks="30:2,31:2,33:2,0:33"`. The checker treats it as 33, so a correctly gated R-ext-2 path must live in an `Api33`-named object or it is flagged. Consider a naming rule for extension holders (for example `ApiR2`).
6. **Decimal levels.** The class regex `since="(\d+)"` (:38) and member regex (:46) do not match `since="36.1"`. Classes added in 36.1 are skipped, and 36.1-only members inherit the class level. This is harmless at compileSdk 36, but it will matter once akan-native compiles against 36.1+.
7. **Behaviour differences** (§1a edge-to-edge, §1g back, §2 adjustResize, §6 dark mode, §7 permissions) are invisible to any static check. They need an API 29 emulator run: `system-images;android-29;google_apis_playstore;arm64-v8a`, plus a no-Play image for the stale-WebView case.

---

## 15. Constant-level findings (inlined by kotlinc, so bytecode checks cannot see them)

Source scan of `native/android/src/com/akanjs/runtime/*.kt` and `plugins/*/android/*.kt` against api-versions.xml (field `since` > 29):

| file:line | constant | API | consequence on 29 |
|---|---|---|---|
| AkanNativeActivity.kt:182 | `WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS`, `APPEARANCE_LIGHT_NAVIGATION_BARS` | 30 | Harmless by itself; used only with the 30 API (§1c). |
| AkanNativeActivity.kt:356 | `WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` | 30 | Same; below 30 use `SYSTEM_UI_FLAG_IMMERSIVE_STICKY` (§1d). |
| AkanNativeActivity.kt:511 | `OnBackInvokedDispatcher.PRIORITY_DEFAULT` | 33 | Same (§1g). |
| BiometricPlugin.kt:6-7 (imports), :53, :74 | `BiometricManager.Authenticators.BIOMETRIC_WEAK`, `DEVICE_CREDENTIAL` | 30 | Values only; the 29 path uses `canAuthenticate()` / `setDeviceCredentialAllowed` (§4). |
| BiometricPlugin.kt:58, :120 | `BiometricManager.BIOMETRIC_ERROR_NOT_ENABLED_FOR_APPS` | **36** | Never returned below 36; harmless. |
| BiometricPlugin.kt:128 | `BiometricPrompt.BIOMETRIC_ERROR_NOT_ENABLED_FOR_APPS` | **36** | Same. |
| CameraPlugin.kt:120, :146 | `MediaStore.ACTION_PICK_IMAGES` | 33 | `ActivityNotFoundException`, so "no photo picker" (§9). |
| CameraPlugin.kt:147 | `MediaStore.EXTRA_PICK_IMAGES_MAX` | 33 | Ignored by other pickers; use the backport's own extra (§9). |
| DevicePlugin.kt:60 | `Context.RECEIVER_NOT_EXPORTED` | 33 | Ignored below 33. Harmless here: the receiver is null and `ACTION_BATTERY_CHANGED` is a protected sticky broadcast. Gating is only for clarity. |
| SharePlugin.kt:86 | `Context.RECEIVER_NOT_EXPORTED` | 33 | **Ignored, so the receiver is exported on 29-32** (§8). |
| SharePlugin.kt:173 | `PendingIntent.FLAG_MUTABLE` | 31 | Unknown bit ignored; gate it (§8, §13). |
| GeolocationPlugin.kt:153, :239 | `LocationRequest.QUALITY_HIGH_ACCURACY`, `QUALITY_BALANCED_POWER_ACCURACY` | 31 | Values only; the 29 path has no quality (§5). |
| GeolocationPlugin.kt:197, :285 | `LocationManager.FUSED_PROVIDER` (`"fused"`) | 31 | Hidden provider before 31. Drop it from `PROVIDERS` and `provider()` below 31 (§5). |
| HapticsPlugin.kt:26 | `VibrationAttributes.USAGE_TOUCH` | 30 | Used only with the 33 API (§3). |
| HapticsPlugin.kt:85-86 | `VibrationEffect.Composition.PRIMITIVE_CLICK`, `PRIMITIVE_TICK` | 30 | Composition is 30 (§3). |
| HapticsPlugin.kt:87 | `VibrationEffect.Composition.PRIMITIVE_LOW_TICK` | **31** | Also skip it on 30 (§3). |
| LocalNotificationsPlugin.kt:83, :91 | `Manifest.permission.POST_NOTIFICATIONS` | 33 | Requesting it below 33 is an instant DENIED with no UI and poisons the history (§7). |
| SqlitePlugin.kt:253-257 | `SQLiteRawStatement.SQLITE_DATA_TYPE_*` | 35 | With the class (§14.1); the legacy path uses `Cursor.FIELD_TYPE_*` (11). |
| ScreenOrientationPlugin.kt:51 | literal `36` (`SDK_INT >= 36`) | n/a | Correctly gated. |

**No hits** for these, so none of them need attention:
- `Build.VERSION_CODES.*` (akan-native uses integer literals)
- `ServiceInfo.FOREGROUND_SERVICE_TYPE_*`
- `READ_MEDIA_*`
- `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`
- `Intent.FLAG_ACTIVITY_REQUIRE_NON_BROWSER`
- `LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS`
- `WindowInsets.Type` constants (they are methods)

Every `Manifest.permission.*` used other than `POST_NOTIFICATIONS` (CAMERA, RECORD_AUDIO, ACCESS_FINE/COARSE_LOCATION) is API 1.

**Manifest and resource level** (compiled into bits or strings that older systems ignore):
- `android.ts:121`: `android:enableOnBackInvokedCallback` (33) is ignored below 33, which is why `onBackPressed()` is needed (§1g).
- `android.ts:97` `CONFIG_CHANGES`: `fontWeightAdjustment` (31) and `grammaticalGender` (34) are unknown bits below 31/34. Harmless.
- `plugins/auth-session/native-plugin.json:17`, `plugins/browser/native-plugin.json:33`: `<queries>` (30) is ignored on 29.
- `plugins/local-notifications/native-plugin.json:42`: `<uses-permission POST_NOTIFICATIONS>` (33) is ignored below 33.
- `icons.ts:229-230`: `windowSplashScreenBackground` / `windowSplashScreenAnimatedIcon` (31). aapt2 auto-versions them into `-v31` [K], so 29/30 get only the color window background (§1f).
- `icons.ts:225`: parent `Theme.DeviceDefault.DayNight` (29). OK at minSdk 29.
- `icons.ts:243`: `mipmap-anydpi` adaptive icon (26). OK.
