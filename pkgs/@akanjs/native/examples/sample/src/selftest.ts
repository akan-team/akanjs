// Platform self-test (NF-3): the same checks run on every host. Enabled with the runtime env
// PUBLIC_SELFTEST=1, e.g. `AKAN_NATIVE_PUBLIC_SELFTEST=1` on desktop. The result is one console line
// that the CLI can read from the host log:  AKAN_NATIVE_SELFTEST_PART 1/2 <base64 of {"pass":true,...}>
import {
  env,
  fileBlob,
  isAkanNativeError,
  nativeApi,
  platform,
  releaseFile,
  runtimeVersion,
} from "@akanjs/native/core";
import { accessibility } from "@akanjs/native/plugins/accessibility";
import { app as appPlugin, onBeforeQuit } from "@akanjs/native/plugins/app";
import { appState } from "@akanjs/native/plugins/app-state";
import { appearance } from "@akanjs/native/plugins/appearance";
import { authSession } from "@akanjs/native/plugins/auth-session";
import { autostart } from "@akanjs/native/plugins/autostart";
import { badge } from "@akanjs/native/plugins/badge";
import { biometric } from "@akanjs/native/plugins/biometric";
import { browser } from "@akanjs/native/plugins/browser";
import { camera } from "@akanjs/native/plugins/camera";
import { clipboard } from "@akanjs/native/plugins/clipboard";
import { contacts } from "@akanjs/native/plugins/contacts";
import { device } from "@akanjs/native/plugins/device";
import { dialog } from "@akanjs/native/plugins/dialog";
import { dock } from "@akanjs/native/plugins/dock";
import { filePicker } from "@akanjs/native/plugins/file-picker";
import { type BaseDirectory, filesystem } from "@akanjs/native/plugins/filesystem";
import { geolocation } from "@akanjs/native/plugins/geolocation";
import { globalShortcut } from "@akanjs/native/plugins/global-shortcut";
import { haptics } from "@akanjs/native/plugins/haptics";
import { http } from "@akanjs/native/plugins/http";
import { keepAwake } from "@akanjs/native/plugins/keep-awake";
import { keyboard } from "@akanjs/native/plugins/keyboard";
import { localNotifications as ln } from "@akanjs/native/plugins/local-notifications";
import { type MenuClick, type MenuItem, menu } from "@akanjs/native/plugins/menu";
import { network } from "@akanjs/native/plugins/network";
import { opener } from "@akanjs/native/plugins/opener";
import { preferences } from "@akanjs/native/plugins/preferences";
import { displayAt, screen } from "@akanjs/native/plugins/screen";
import { screenOrientation } from "@akanjs/native/plugins/screen-orientation";
import { secureStorage } from "@akanjs/native/plugins/secure-storage";
import { share } from "@akanjs/native/plugins/share";
import { singleInstance } from "@akanjs/native/plugins/single-instance";
import { splashScreen } from "@akanjs/native/plugins/splash-screen";
import { sqlite } from "@akanjs/native/plugins/sqlite";
import { toast } from "@akanjs/native/plugins/toast";
import { tray } from "@akanjs/native/plugins/tray";
import { updates } from "@akanjs/native/plugins/updates";
import { volume } from "@akanjs/native/plugins/volume";
import {
  appWindow,
  createWindow,
  getAllWindows,
  getCurrentWindow,
  onCloseRequested,
} from "@akanjs/native/plugins/window";
import { windowState } from "@akanjs/native/plugins/window-state";

interface Result {
  name: string;
  ok: boolean;
  detail?: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** The desktop shell (TAO + WRY + the Bun plugin host) on macOS, Windows and Linux. */
const desktop = platform === "macos" || platform === "windows" || platform === "linux";

/** The page runtime's internals (the self-test reaches the hosts' dev-only $host methods through them). */
interface PageRuntime {
  transport: {
    send(request: object): Promise<{ ok: boolean; result?: any; error?: { code: string; message: string } }>;
    info?(): Record<string, unknown>;
  } | null;
  nextId: number;
  listeners: Map<string, Set<(data: any) => void>>;
}
const pageRuntime = () => (window.__AKAN_NATIVE__ as unknown as { __runtime: PageRuntime }).__runtime;

async function hostCall(method: string, args?: unknown): Promise<any> {
  const rt = pageRuntime();
  const response = await rt.transport!.send({ v: 1, id: ++rt.nextId, plugin: "$host", method, args });
  if (!response.ok) throw new Error(`$host.${method}: ${response.error?.code} ${response.error?.message}`);
  return response.result;
}

/** Set before $host.recreate: the check finishes in the page of the new window (App scope, plugins.md C11). */
const RECREATE_MARK = "akan-native.selftest.recreate";

export async function runSelftest(): Promise<{ pass: boolean; platform: string; results: Result[] }> {
  const results: Result[] = [];
  const check = async (name: string, fn: () => unknown) => {
    // When a platform times out, `akan-native test` shows the log tail: this names the check that hung.
    console.info(`selftest: ${name}`);
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail: detail === undefined ? undefined : String(detail) });
    } catch (error) {
      results.push({ name, ok: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  await check("boot", () => {
    assert(window.__AKAN_NATIVE__?.platform === platform, "init.js did not run before the bundle");
    return `${platform} ${runtimeVersion}`;
  });
  if (platform !== "web") {
    await check("the shell's origin and engine (init.js)", () => {
      const g = window.__AKAN_NATIVE__ as unknown as { origin?: string; engine?: string; engineVersion?: string };
      assert(g.origin === location.origin, `origin ${g.origin} vs ${location.origin}`);
      assert(typeof g.engine === "string" && g.engine !== "", "engine");
      return `${g.engine} ${g.engineVersion}`;
    });
  }
  // K13 (document churn, architecture review stage 3): the host's tables (documents, subscriptions,
  // running calls, owned resources, FileRefs, App-service listeners) are the same size after ten
  // page loads, and on mobile after the window is made again below. The first page records them and
  // reloads; the pages after it count down; the last one compares. Counts, not memory: deterministic.
  const K13 = "akan-native.selftest.k13";
  const RELOADS = 10;
  const recreated = localStorage.getItem(RECREATE_MARK) !== null; // this page belongs to a window made again
  let k13: { baseline: Record<string, number>; left: number; at: number; result?: string[] } | null = null;
  if (platform !== "web") {
    try {
      k13 = JSON.parse(localStorage.getItem(K13) ?? "null");
    } catch {}
    if (k13 && Date.now() - k13.at > 180_000) k13 = null;
    await new Promise((r) => setTimeout(r, 500)); // the page's own subscriptions settle
    const stats = (await hostCall("info")).stats as Record<string, number>;
    // A leak only grows a table. "running" counts the calls in flight when the stats are taken (this
    // one included), which a slow machine can catch one more of: it may shrink, the others stay equal.
    const changed = (now: Record<string, number>) =>
      Object.keys(k13!.baseline)
        .filter(
          (key) =>
            key !== "ended" &&
            (key === "running" ? (now[key] ?? 0) > (k13!.baseline[key] ?? 0) : now[key] !== k13!.baseline[key]),
        )
        .map((key) => `${key} ${k13!.baseline[key]} → ${now[key]}`);
    if (!k13 || k13.left > 0) {
      localStorage.setItem(
        K13,
        JSON.stringify(
          k13 ? { ...k13, left: k13.left - 1, at: Date.now() } : { baseline: stats, left: RELOADS, at: Date.now() },
        ),
      );
      location.reload();
      return new Promise(() => {}); // this page ends
    }
    if (!k13.result) {
      k13.result = changed(stats);
      localStorage.setItem(K13, JSON.stringify(k13));
    }
    const done = k13;
    await check(`host tables keep their size over ${RELOADS} page loads (K13)`, () => {
      assert(done.result!.length === 0, done.result!.join(", "));
      assert((done.baseline.ended ?? 0) <= 16 && (stats.ended ?? 0) <= 16, `ended documents kept: ${stats.ended}`);
      return Object.entries(done.baseline)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ");
    });
    if (recreated) {
      await check("host tables keep their size after the window was made again (K13)", () => {
        const now = changed(stats);
        assert(now.length === 0, now.join(", "));
      });
    }
  }

  if (platform === "ios" || platform === "android") {
    // A window made again in the same process (iOS: a scene that connects again; Android: an
    // activity recreated) keeps the process's web bundle choice and launch URL. The first page asks
    // for a new window and goes away with its window; the page of the new window compares.
    let mark: { info: any; launch: string | null; at: number } | null = null;
    try {
      mark = JSON.parse(localStorage.getItem(RECREATE_MARK) ?? "null");
    } catch {}
    localStorage.removeItem(RECREATE_MARK);
    if (!mark || Date.now() - mark.at > 30_000) {
      localStorage.setItem(
        RECREATE_MARK,
        JSON.stringify({ info: await hostCall("info"), launch: (await appPlugin.getLaunchUrl()).url, at: Date.now() }),
      );
      await hostCall("recreate");
      await new Promise((r) => setTimeout(r, 8000)); // this page ends with its window
      localStorage.removeItem(RECREATE_MARK);
    }
    await check("window made again keeps the App scope (C11)", async () => {
      assert(mark, "the window was not made again");
      const now = await hostCall("info");
      assert(now.instance === mark.info.instance, "another process");
      assert(now.bundleSelections === 1, `bundle chosen ${now.bundleSelections} times`);
      assert(now.windows === mark.info.windows + 1, `windows ${mark.info.windows} → ${now.windows}`);
      const launch = (await appPlugin.getLaunchUrl()).url;
      assert(launch === mark.launch, `launch URL ${mark.launch} → ${launch}`);
      return `window ${now.windows}, bundle chosen once`;
    });
  }
  if (platform === "macos" || platform === "linux") {
    // N2: when the page's web content process ends, the shell ends its document and loads the page
    // again. The first page ends its own process; the page loaded after it checks.
    const MARK = "akan-native.selftest.crash";
    let mark: { at: number } | null = null;
    try {
      mark = JSON.parse(localStorage.getItem(MARK) ?? "null");
    } catch {}
    localStorage.removeItem(MARK);
    if (!mark || Date.now() - mark.at > 30_000) {
      localStorage.setItem(MARK, JSON.stringify({ at: Date.now() }));
      await hostCall("crash");
      await new Promise((r) => setTimeout(r, 8000)); // this page ends with its process
      localStorage.removeItem(MARK);
    }
    await check("a page whose process ended loads again (N2)", async () => {
      assert(mark, "the page's process did not end");
      const { count } = await hostCall("gone");
      assert(count >= 1, `the host saw ${count} ended processes`);
      return `reloaded ${Math.round((Date.now() - mark.at) / 100) / 10} s after the crash`;
    });
  }
  if (platform !== "web") {
    await check("a cancelled call ends at once and its host side is told (v1.1 cancel)", async () => {
      const failure = (p: Promise<unknown>) =>
        p.then(
          () => null,
          (e: unknown) => e,
        );
      const rt = pageRuntime();
      const before = (await hostCall("info")).cancels as number;
      const id = ++rt.nextId;
      const hanging = rt.transport!.send({ v: 1, id, plugin: "$host", method: "hang" });
      await new Promise((r) => setTimeout(r, 50));
      const cancel = await rt.transport!.send({
        v: 1,
        id: ++rt.nextId,
        plugin: "$bridge",
        method: "cancel",
        args: { id, reason: "timeout" },
      });
      assert(cancel.ok && cancel.result?.cancelled === true, `cancel: ${JSON.stringify(cancel)}`);
      const answer = await hanging;
      assert(!answer.ok && answer.error?.code === "TIMEOUT", `the hanging call answered ${JSON.stringify(answer)}`);
      const after = (await hostCall("info")).cancels as number;
      assert(after === before + 1, `cancels ${before} → ${after}`);
      // The public surface, with a real dialog: rejected at the time limit and taken off the screen,
      // so a second one can be shown (a dialog left behind would block it on iOS and Android).
      for (const round of [1, 2]) {
        const error = await failure(
          dialog.confirm({ message: `cancel check ${round}` }, { signal: AbortSignal.timeout(150) }),
        );
        assert(
          isAkanNativeError(error, "TIMEOUT") && (error as Error).name === "TimeoutError",
          `dialog ${round}: ${String(error)}`,
        );
      }
      const aborted = await failure(preferences.get({ key: "selftest.key" }, { signal: AbortSignal.abort() }));
      assert(isAkanNativeError(aborted, "CANCELLED"), "an aborted signal");
      return "TIMEOUT, dialog dismissed twice";
    });

    await check("snapshot events: the latest of a burst, before the answer (coalesce)", async () => {
      const rt = pageRuntime();
      const key = "$host\u0000tick";
      const got: number[] = [];
      const listener = (data: { n: number }) => got.push(data.n);
      if (!rt.listeners.has(key)) rt.listeners.set(key, new Set());
      rt.listeners.get(key)!.add(listener);
      try {
        const result = await hostCall("burst", { count: 200 });
        const beforeAnswer = got.length;
        await new Promise((r) => setTimeout(r, 250));
        assert(result?.sent === 200, `burst answered ${JSON.stringify(result)}`);
        assert(got.length >= 1 && got.length < 20, `${got.length} ticks delivered for 200`);
        assert(got.at(-1) === 199, `the last tick was ${got.at(-1)}`);
        assert(beforeAnswer === got.length, `${got.length - beforeAnswer} ticks came after the answer`);
      } finally {
        rt.listeners.get(key)!.delete(listener);
      }
      return `${got.length} of 200 delivered, the last one`;
    });

    await check("bridge order: an event after a response, 1000 times (v1.1 seq)", async () => {
      const got: number[] = [];
      const seen = new Set<number>();
      const listener = (data: { n: number }) => (got.push(data.n), seen.add(data.n));
      const rt = pageRuntime();
      const key = "$host\u0000echo";
      if (!rt.listeners.has(key)) rt.listeners.set(key, new Set());
      rt.listeners.get(key)!.add(listener);
      // How often the host's event overtook its answer on the way (the runtime puts them back in order).
      const g = window.__AKAN_NATIVE__ as unknown as { receive(m: unknown): void };
      const receive = g.receive;
      const answered = new Set<number>();
      let overtook = 0;
      g.receive = (m) => {
        const msg = (typeof m === "string" ? JSON.parse(m) : m) as { plugin?: string; data?: { n?: number } };
        if (msg.plugin === "$host" && !answered.has(msg.data?.n ?? -1)) overtook++;
        receive(m);
      };
      const started = performance.now();
      let early = 0;
      try {
        for (let n = 0; n < 1000; n++) {
          const result = await hostCall("echo", { n });
          answered.add(n);
          assert(result?.n === n, `echo ${n}: ${JSON.stringify(result)}`);
          if (seen.has(n)) early++; // this answer's event reached the listener before the code awaiting the answer
        }
        for (let i = 0; i < 100 && got.length < 1000; i++) await new Promise((r) => setTimeout(r, 20));
      } finally {
        rt.listeners.get(key)!.delete(listener);
        g.receive = receive;
      }
      assert(early === 0, `${early} events reached the page before their response`);
      assert(
        got.length === 1000 && got.every((n, i) => n === i),
        `events ${got.length}, first out of order at ${got.findIndex((n, i) => n !== i)}`,
      );
      return `${Math.round(performance.now() - started)} ms; ${overtook} events overtook their answer`;
    });
  }
  if (platform !== "web") {
    await check("undeclared methods never reach a plugin (L2 declaration gate)", async () => {
      const rt = pageRuntime();
      const r = await rt.transport!.send({ v: 1, id: ++rt.nextId, plugin: "preferences", method: "dropEverything" });
      assert(!r.ok && r.error?.code === "NOT_FOUND" && /not declared/.test(r.error.message), JSON.stringify(r));
      const e = await rt.transport!.send({
        v: 1,
        id: ++rt.nextId,
        plugin: "preferences",
        method: "$listen",
        args: { event: "secretEvent" },
      });
      assert(!e.ok && e.error?.code === "NOT_FOUND", JSON.stringify(e));
      return r.error!.message;
    });
  }
  if (platform !== "web") {
    // N1 (Capacitor GHSA-rvm3-566m-v7fv): a FileRef holding someone's HTML must not run as a
    // document of the app's origin. It is served with CSP sandbox (an opaque origin) and nosniff.
    await check("a FileRef with HTML runs nothing in the app's origin (N1)", async () => {
      const marker = "akan-native.selftest.n1";
      await preferences.remove({ key: marker });
      const evil = `<!doctype html><script>
        try { parent.__n1 = "parent reached"; } catch {}
        try { parent.postMessage("n1 ran", "*"); } catch {}
        const req = JSON.stringify({ v: 1, id: 1, plugin: "preferences", method: "set", args: { key: "${marker}", value: "pwned" } });
        try { webkit.messageHandlers.akanNative.postMessage(req); } catch {}
        try { fetch("/__akan_native/ipc", { method: "POST", headers: { "content-type": "application/json", "x-akan-native-ipc": "1" }, body: req }); } catch {}
      </script>`;
      await filesystem.writeFile({ base: "data", path: "selftest-n1/evil.html", data: evil, recursive: true });
      const ref = (await filesystem.readFile({ base: "data", path: "selftest-n1/evil.html" })) as {
        url: string;
        mime: string;
      };
      const res = await fetch(ref.url);
      const csp = res.headers.get("content-security-policy");
      assert(
        csp === "sandbox" && res.headers.get("x-content-type-options") === "nosniff",
        `headers: csp ${csp}, nosniff ${res.headers.get("x-content-type-options")}`,
      );
      let ran = false;
      const onMessage = (e: MessageEvent) => {
        if (e.data === "n1 ran") ran = true;
      };
      window.addEventListener("message", onMessage);
      const frame = document.createElement("iframe");
      frame.style.display = "none";
      frame.src = ref.url;
      document.body.appendChild(frame);
      await new Promise((r) => setTimeout(r, 1500));
      frame.remove();
      window.removeEventListener("message", onMessage);
      const stored = (await preferences.get({ key: marker })).value;
      assert(
        !ran && (window as { __n1?: string }).__n1 === undefined && stored === null,
        `script ran ${ran}, parent ${(window as { __n1?: string }).__n1}, preference ${stored}`,
      );
      // PDF is not sandboxed: macOS WebKit draws nothing for a sandboxed PDF (kernel fileRefSandboxed).
      await filesystem.writeFile({ base: "data", path: "selftest-n1/doc.pdf", data: "%PDF-1.4\n%%EOF\n" });
      const pdf = (await filesystem.readFile({ base: "data", path: "selftest-n1/doc.pdf" })) as {
        url: string;
        mime: string;
      };
      const pdfRes = await fetch(pdf.url);
      await pdfRes.arrayBuffer();
      const pdfCsp = pdfRes.headers.get("content-security-policy");
      assert(
        pdf.mime === "application/pdf" && pdfCsp === null && pdfRes.headers.get("x-content-type-options") === "nosniff",
        `pdf: ${pdf.mime}, csp ${pdfCsp}`,
      );
      await filesystem.remove({ base: "data", path: "selftest-n1", recursive: true });
      return `${ref.mime}: sandboxed; pdf: not sandboxed`;
    });
  }
  if (platform === "ios" || platform === "android") {
    // The kernel's libraries on the device (Android's ICU, iOS's Foundation) are not the ones
    // scripts/native-vectors.ts ran on the Mac.
    await check("shared vectors on this device (architecture §5)", async () => {
      const { passed, expected, failures } = await hostCall("vectors");
      assert(failures.length === 0, `${failures.length} failed: ${failures.slice(0, 3).join(" | ")}`);
      assert(expected > 0 && passed === expected, `${passed} of ${expected} cases`);
      return `${passed}/${expected} cases`;
    });
  }
  if (platform === "android") {
    await check("bridge: another ring changes nothing (SEC-4)", async () => {
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(
        "",
      );
      await fetch(`/__akan_native/hello?n=${nonce}`, { referrerPolicy: "same-origin" });
      await new Promise((r) => setTimeout(r, 500));
      assert(
        (await preferences.get({ key: "akan-native.selftest.ring" })).value === null,
        "the bridge stopped answering",
      );
      const ports = pageRuntime().transport?.info?.().ports;
      assert(ports === 1, `ports ${ports}`);
      return "one port";
    });
  }
  await check("native API fingerprint (UP-3)", () => {
    if (platform === "web") {
      assert(nativeApi === null, `web has no native API, got ${nativeApi}`);
      return "none on the web";
    }
    assert(typeof nativeApi === "string" && /^[0-9a-f]{16}$/.test(nativeApi), `nativeApi ${nativeApi}`);
    return nativeApi;
  });
  await check("updates state (UP-2)", async () => {
    if (!updates.isSupported("getState")) return "UNSUPPORTED";
    const state = await updates.getState();
    assert(state.nativeApi === nativeApi, `nativeApi ${state.nativeApi} vs ${nativeApi}`);
    assert(state.channel === "production" && typeof state.trial === "boolean", JSON.stringify(state));
    return `${state.bundle ?? "embedded"} bundle, ${state.pending ?? "nothing"} pending`;
  });
  await check("env", () => {
    assert(typeof env.PUBLIC_API_URL === "string", "PUBLIC_API_URL missing");
    assert(!("SAMPLE_SECRET" in env), "non-PUBLIC key leaked");
    return env.PUBLIC_API_URL;
  });
  await check("env per platform (ENV-6)", () => {
    // akan-native.config.ts env.platforms.android and .env.development.android; `akan-native test` builds in development.
    const android = platform === "android";
    assert(
      env.PUBLIC_GREETING === (android ? "Hello from akan-native.config.ts (android)" : "Hello from .env"),
      `greeting ${env.PUBLIC_GREETING}`,
    );
    assert(
      env.PUBLIC_API_URL === (android ? "http://10.0.2.2:8787" : "http://localhost:8787"),
      `api ${env.PUBLIC_API_URL}`,
    );
    return `${env.PUBLIC_API_URL}`;
  });
  await check("preferences round trip", async () => {
    await preferences.set({ key: "selftest.key", value: "42 ✓" });
    assert((await preferences.get({ key: "selftest.key" })).value === "42 ✓", "get after set");
    assert((await preferences.keys()).keys.includes("selftest.key"), "keys");
    await preferences.remove({ key: "selftest.key" });
    assert((await preferences.get({ key: "selftest.key" })).value === null, "get after remove");
    return preferences.implementation("get");
  });
  await check("preferences rejects bad args", async () => {
    const error = await preferences.set({ key: "", value: "x" }).then(
      () => null,
      (e) => e,
    );
    assert(isAkanNativeError(error, "INVALID_ARGS"), `expected INVALID_ARGS, got ${error}`);
  });
  if (platform === "ios" || platform === "android") {
    await check("generated argument checks (PL-10)", async () => {
      // preferences and haptics use the bindings generated from their TypeScript spec: the message names the field.
      const reject = (p: Promise<unknown>) =>
        p.then(
          () => null,
          (e) => e,
        );
      const wrongType = await reject(preferences.set({ key: "k", value: 3 as unknown as string }));
      assert(
        isAkanNativeError(wrongType, "INVALID_ARGS") && wrongType.message === "value must be a string",
        `wrong type: ${wrongType?.message}`,
      );
      const missing = await reject(preferences.get({} as { key: string }));
      assert(
        isAkanNativeError(missing, "INVALID_ARGS") && missing.message === "key is required",
        `missing: ${missing?.message}`,
      );
      const badEnum = await reject(haptics.impact({ style: "loud" as "light" }));
      assert(
        isAkanNativeError(badEnum, "INVALID_ARGS") &&
          badEnum.message === "style must be one of light, medium, heavy, soft, rigid",
        `enum: ${badEnum?.message}`,
      );
      return "field paths in INVALID_ARGS";
    });
  }
  await check("app-state", async () => {
    const { state } = await appState.getState();
    assert(["active", "inactive", "background"].includes(state), `bad state ${state}`);
    const stop = appState.listen("change", () => {});
    stop();
    return `${state} (${appState.implementation("getState")})`;
  });
  await check("keyboard", async () => {
    if (!keyboard.isSupported("getState")) {
      const error = await keyboard.getState().then(
        () => null,
        (e) => e,
      );
      assert(isAkanNativeError(error, "UNSUPPORTED"), "unsupported call must reject UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const state = await keyboard.getState();
    assert(typeof state.visible === "boolean" && typeof state.height === "number", "bad state");
    return `${JSON.stringify(state)} (${keyboard.implementation("getState")})`;
  });
  if (platform === "ios" || platform === "android") {
    await check("safe area CSS variables (N14)", () => {
      // Set before the bundle ran (init.js) and on every change, with the same names on both.
      const style = document.documentElement.style;
      const sides = ["top", "right", "bottom", "left"].map((side) =>
        style.getPropertyValue(`--akan-native-safe-area-${side}`),
      );
      assert(
        sides.every((v) => /^\d+(\.\d+)?px$/.test(v)),
        `variables ${JSON.stringify(sides)}`,
      );
      return sides.join(" ");
    });
  }
  await check("camera.saveToGallery rejects foreign URLs", async () => {
    if (!camera.isSupported("saveToGallery")) return "UNSUPPORTED";
    assert(
      isAkanNativeError(
        await camera.saveToGallery({ url: "https://example.com/x.jpg" }).then(
          () => null,
          (e) => e,
        ),
        "INVALID_ARGS",
      ),
      "expected INVALID_ARGS",
    );
    return camera.implementation("saveToGallery");
  });
  await check("camera", async () => {
    const impl = camera.implementation("takePhoto");
    if (!camera.isSupported("checkPermission")) return impl;
    const permission = (await camera.checkPermission()).camera;
    // Linux has no camera permission for unsandboxed apps; on Windows WebView2 asks at getUserMedia.
    if (platform === "linux") assert(permission === "granted", `permission ${permission}`);
    if (platform === "windows") assert(permission !== "granted", `permission ${permission}`);
    return `${impl}, permission ${permission}`;
  });
  await check("public asset", async () => {
    const res = await fetch("/akan-native.svg");
    assert(res.ok, `status ${res.status}`);
    assert(res.headers.get("content-type")?.includes("svg"), `type ${res.headers.get("content-type")}`);
  });
  await check("missing asset is 404", async () => {
    assert((await fetch("/missing.png")).status === 404, "expected 404");
  });
  await check("SPA fallback", async () => {
    const res = await fetch("/some/deep/route");
    assert(res.ok && (await res.text()).includes('id="root"'), "expected index.html");
  });
  await check("reserved /__akan_native path is 404", async () => {
    assert((await fetch("/__akan_native/nope")).status === 404, "expected 404");
  });
  // Joining "C:/…" onto the app folder gives C:/… on Windows: such paths are never looked up.
  await check("drive-letter paths stay in the app folder", async () => {
    for (const path of ["/C:/Windows/win.ini", "/%43%3A/Windows/win.ini", "/C:/Windows/System32/drivers/etc/hosts"]) {
      const res = await fetch(path);
      const body = await res.text();
      assert(res.status === 404 || body.includes('id="root"'), `${path}: status ${res.status}, ${body.length} bytes`);
    }
  });

  await check("app info", async () => {
    const info = await appPlugin.getInfo();
    assert(info.id === "com.akanjs.sample", `id ${info.id}`);
    assert(typeof info.version === "string" && info.build >= 1, "version/build");
    const { url } = await appPlugin.getLaunchUrl();
    assert(url === null || typeof url === "string", "launch url");
    return `${info.name} ${info.version} (${info.build}), launch ${url ?? "none"}, exit ${appPlugin.implementation("exit")}`;
  });
  await check("window", async () => {
    if (!appWindow.isSupported("getState")) {
      const error = await appWindow.getState().then(
        () => null,
        (e) => e,
      );
      assert(isAkanNativeError(error, "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const before = await appWindow.getState();
    assert(typeof before.width === "number" && before.width > 0, "width");
    const renamed = await appWindow.setTitle({ title: `${before.title} ✓` });
    assert(renamed.title === `${before.title} ✓`, `title ${renamed.title}`);
    await appWindow.setTitle({ title: before.title });
    return `${Math.round(before.width)}×${Math.round(before.height)} (${appWindow.implementation("getState")})`;
  });
  await check("quit and close requests (D4)", async () => {
    const quit = appPlugin.eventImplementation("beforeQuit");
    const close = appWindow.eventImplementation("closeRequested");
    const expected = desktop ? "native" : "none";
    assert(quit === expected && close === expected, `beforeQuit ${quit}, closeRequested ${close}`);
    onBeforeQuit(() => {})(); // harmless everywhere; never fires during the test
    onCloseRequested(() => {})();
    if (quit === "native") {
      await appPlugin.answerBeforeQuit({ id: 0, allow: true }); // no such request: ignored
      const bad = await appPlugin.answerBeforeQuit({ id: "x" as never }).then(
        () => null,
        (e) => e,
      );
      assert(isAkanNativeError(bad, "INVALID_ARGS"), "expected INVALID_ARGS");
    }
    return `beforeQuit ${quit}, closeRequested ${close}`;
  });

  const rejects = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: unknown) => e,
    );
  const mobile = platform === "ios" || platform === "android"; // simulator / emulator in the MVP

  await check("windows (SH-6)", async () => {
    const current = getCurrentWindow();
    assert(current.id === 1 && current.isCurrent, `current window ${current.id}`);
    if (!appWindow.isSupported("create")) {
      assert((await getAllWindows()).length === 1, "one window");
      assert(isAkanNativeError(await rejects(createWindow({ path: "/" })), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "one window (UNSUPPORTED)";
    }
    const destroyed = new Promise<number>((resolve) => {
      const stop = appWindow.listen("destroyed", ({ id }) => {
        stop();
        resolve(id);
      });
      setTimeout(() => resolve(-1), 4000);
    });
    const child = await createWindow({
      path: "/?window=child",
      title: "akan-native selftest child",
      width: 420,
      height: 300,
    });
    const ids = (await getAllWindows()).map((w) => w.id);
    assert(ids.includes(1) && ids.includes(child.id), `windows ${ids.join(",")}`);
    assert((await child.setTitle("child ✓")).title === "child ✓", "child title");
    assert((await appWindow.getState()).title !== "child ✓", "the op reached the wrong window");
    assert(
      isAkanNativeError(await rejects(createWindow({ path: "https://example.com" })), "INVALID_ARGS"),
      "foreign path",
    );
    await child.close();
    assert((await destroyed) === child.id, "no destroyed event");
    assert(!(await getAllWindows()).some((w) => w.id === child.id), "still listed");
    assert(isAkanNativeError(await rejects(child.getState()), "NOT_FOUND"), "gone window answers NOT_FOUND");
    return `window ${child.id} opened, renamed and closed`;
  });

  await check("clipboard", async () => {
    assert(isAkanNativeError(await rejects(clipboard.writeText({ text: 1 as never })), "INVALID_ARGS"), "bad args");
    // The simulator and the emulator share their clipboard with the Mac: only write when asked to.
    if (env.PUBLIC_SELFTEST_CLIPBOARD === "1" && mobile) {
      const sample = `akan-native selftest ${Date.now()} ✓`;
      await clipboard.writeText({ text: sample });
      assert((await clipboard.readText()).text === sample, "round trip");
      return `round trip (${clipboard.implementation("readText")})`;
    }
    return `argument check (${clipboard.implementation("readText")})`;
  });
  await check("opener", async () => {
    for (const url of ["file:///etc/hosts", "javascript:alert(1)", "akansample://x"]) {
      assert(isAkanNativeError(await rejects(opener.openUrl({ url })), "INVALID_ARGS"), url);
    }
    if (!opener.isSupported("canOpenUrl")) return "canOpenUrl UNSUPPORTED";
    const https = (await opener.canOpenUrl({ url: "https://example.com" })).value;
    assert(https, "canOpenUrl(https)"); // the Linux test container registers a stand-in browser (scripts/vm/linux.ts)
    return `https ${https}, tel ${(await opener.canOpenUrl({ url: "tel:1" })).value} (${opener.implementation("openUrl")})`;
  });
  await check("share", async () => {
    assert(isAkanNativeError(await rejects(share.share({})), "INVALID_ARGS"), "empty share");
    assert(isAkanNativeError(await rejects(share.share({ url: "javascript:x" })), "INVALID_ARGS"), "javascript: url");
    const { value } = await share.canShare();
    // Linux has no share sheet: WebKitGTK has no navigator.share and desktops no share service.
    if (platform === "linux") assert(!value, "canShare() on Linux");
    else if (platform !== "web") assert(value, "canShare()");
    assert(!(await share.canShare({ files: ["/__akan_native/file/nope.jpg"] })).value, "unknown file");
    return `canShare ${value} (${share.implementation("share")})`;
  });
  await check("device.getInfo", async () => {
    const i = await device.getInfo();
    assert(i.platform === platform, `platform ${i.platform}`);
    for (const k of ["model", "manufacturer", "osName", "osVersion"] as const)
      assert(typeof i[k] === "string" && i[k] !== "", k);
    if (mobile) assert(i.isVirtual === true, "simulator/emulator must report isVirtual");
    if (desktop) assert(typeof i.webViewVersion === "string" && i.webViewVersion !== "", "webViewVersion");
    return `${i.osName} ${i.osVersion} ${i.model}, ${i.manufacturer}, WebView ${i.webViewVersion} (${device.implementation("getInfo")})`;
  });
  await check("device.getId is stable", async () => {
    const a = await device.getId();
    const b = await device.getId();
    assert(a.identifier !== "" && a.identifier === b.identifier, "id changed");
  });
  await check("device.getLanguage", async () => {
    const { tag, code } = await device.getLanguage();
    assert(/^[a-z]{2,3}$/.test(code) && tag.toLowerCase().startsWith(code), `${tag}/${code}`);
    return `${tag} (navigator ${navigator.language})`;
  });
  await check("device.getBattery", async () => {
    const b = await device.getBattery().catch((e) => (isAkanNativeError(e, "UNSUPPORTED") ? null : Promise.reject(e)));
    assert(b || !desktop, "UNSUPPORTED on the desktop");
    if (!b) return "UNSUPPORTED";
    assert(b.level === null || (b.level >= 0 && b.level <= 1), `level ${b.level}`);
    assert(b.charging === null || typeof b.charging === "boolean", "charging");
    return JSON.stringify(b);
  });
  await check("network.getStatus", async () => {
    const s = await network.getStatus();
    assert(
      typeof s.connected === "boolean" && ["wifi", "cellular", "ethernet", "none", "unknown"].includes(s.type),
      JSON.stringify(s),
    );
    const stop = network.listen("change", () => {});
    await network.getStatus();
    stop();
    return `${JSON.stringify(s)} (${network.implementation("getStatus")})`;
  });
  await check("haptics", async () => {
    const settle = (p: Promise<void>) =>
      p.then(
        () => "resolved",
        (e) => (isAkanNativeError(e, "UNSUPPORTED") ? "UNSUPPORTED" : Promise.reject(e)),
      );
    const out: string[] = [];
    for (const run of [
      () => haptics.impact({ style: "light" }),
      () => haptics.notification(),
      () => haptics.selection(),
      () => haptics.vibrate({ duration: 20 }),
    ]) {
      out.push(await settle(run()));
    }
    assert(new Set(out).size === 1, out.join(","));
    if (mobile) assert(out[0] === "resolved", "native haptics must resolve");
    if (platform === "macos") assert(out[0] === "UNSUPPORTED", "no macOS implementation");
    return `${out[0]} (${haptics.implementation("impact")})`;
  });

  await check("dialog (validation only, dialogs need a user)", async () => {
    assert(isAkanNativeError(await rejects(dialog.actionSheet({ options: [] })), "INVALID_ARGS"), "empty action sheet");
    assert(isAkanNativeError(await rejects(dialog.confirm({ message: "" })), "INVALID_ARGS"), "empty confirm");
    assert(isAkanNativeError(await rejects(dialog.alert({ message: 1 as never })), "INVALID_ARGS"), "bad alert");
    return dialog.implementation("alert");
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn: () => boolean, ms: number, what: string) => {
    const end = Date.now() + ms;
    while (!fn()) {
      if (Date.now() > end) throw new Error(`timeout: ${what}`);
      await sleep(50);
    }
  };
  await check("keep-awake", async () => {
    const e = await rejects(keepAwake.keepAwake());
    if (platform === "web" && e) return `web: ${(e as { code?: string }).code}`;
    // Linux asks the desktop (xdg-desktop-portal or org.freedesktop.ScreenSaver); a bare D-Bus
    // session such as the test container's has neither.
    if (platform === "linux" && isAkanNativeError(e, "UNSUPPORTED"))
      return "UNSUPPORTED (no inhibit service on the session bus)";
    assert(!e && (await keepAwake.isKeptAwake()).value, "keepAwake");
    await keepAwake.allowSleep();
    assert(!(await keepAwake.isKeptAwake()).value, "allowSleep");
    return keepAwake.implementation("keepAwake");
  });
  await check("appearance", async () => {
    const dark = matchMedia("(prefers-color-scheme: dark)");
    const before = await appearance.get();
    assert(before.mode === (dark.matches ? "dark" : "light"), `mode ${before.mode} vs prefers-color-scheme`);
    assert(
      isAkanNativeError(
        await rejects(appearance.set({ mode: "sepia" as never })),
        platform === "web" ? "UNSUPPORTED" : "INVALID_ARGS",
      ),
      "bad mode",
    );
    if (!mobile && !desktop) return `${JSON.stringify(before)} (${appearance.implementation("set")})`;
    const target = before.mode === "dark" ? "light" : "dark";
    try {
      await appearance.set({ mode: target });
      await waitFor(() => dark.matches === (target === "dark"), 5000, `prefers-color-scheme ${target}`);
    } finally {
      await appearance.set({ mode: before.setting });
      await sleep(1500); // iOS: let the stored setting reach disk before the CLI ends the app
    }
    return `${before.mode} → ${target} → ${before.setting}`;
  });
  await check("screen-orientation", async () => {
    if (!mobile) {
      if (platform === "web") return (await screenOrientation.get()).type;
      assert(isAkanNativeError(await rejects(screenOrientation.get()), "UNSUPPORTED"), "desktop");
      return "UNSUPPORTED";
    }
    assert(
      isAkanNativeError(await rejects(screenOrientation.lock({ orientation: "natural" as never })), "INVALID_ARGS"),
      "bad lock",
    );
    const events: string[] = [];
    const stop = screenOrientation.listen("change", (st) => events.push(st.type));
    try {
      await screenOrientation.lock({ orientation: "landscape" });
      await waitFor(() => innerWidth > innerHeight, 5000, "landscape viewport");
      assert((await screenOrientation.get()).type.startsWith("landscape"), "get");
      await waitFor(() => events.some((t) => t.startsWith("landscape")), 3000, "change event");
    } finally {
      stop();
      await screenOrientation.lock({ orientation: "portrait-primary" }).catch(() => {});
      await screenOrientation.unlock();
    }
    return events.join(",");
  });
  await check("browser (validation only)", async () => {
    for (const url of ["javascript:alert(1)", "file:///etc/hosts", "mailto:a@b.c"]) {
      assert(isAkanNativeError(await rejects(browser.open({ url })), "INVALID_ARGS"), url);
    }
    assert(
      isAkanNativeError(
        await rejects(browser.open({ url: "https://example.com", toolbarColor: "blue" })),
        "INVALID_ARGS",
      ),
      "color",
    );
    if (browser.isSupported("close")) await browser.close(); // nothing open: resolves
    return `${browser.implementation("open")}, close ${browser.implementation("close")}`;
  });
  await check("auth-session (validation only)", async () => {
    if (!authSession.isSupported("start")) return "UNSUPPORTED";
    assert(
      isAkanNativeError(
        await rejects(authSession.start({ url: "javascript:x", callbackScheme: "akansample" })),
        "INVALID_ARGS",
      ),
      "bad url",
    );
    assert(
      isAkanNativeError(
        await rejects(authSession.start({ url: "https://example.com", callbackScheme: "https" })),
        "INVALID_ARGS",
      ),
      "reserved scheme",
    );
    if (platform !== "ios") {
      assert(
        isAkanNativeError(
          await rejects(authSession.start({ url: "https://example.com", callbackScheme: "notregistered" })),
          "INVALID_ARGS",
        ),
        "unregistered scheme",
      );
    }
    return authSession.implementation("start");
  });

  await check("filesystem round trip", async () => {
    // documents on macOS asks for folder permission, which an unattended run cannot answer
    const bases: BaseDirectory[] =
      platform === "macos" ? ["data", "cache", "temp"] : ["data", "cache", "documents", "temp"];
    const text = "한글 ✓\n";
    for (const base of bases) {
      await filesystem.writeFile({ path: "selftest/a.txt", base, data: text, recursive: true });
      assert(
        (await filesystem.readFile({ path: "selftest/a.txt", base, encoding: "utf8" })).data === text,
        `utf8 ${base}`,
      );
      const ref = await filesystem.readFile({ path: "selftest/a.txt", base });
      assert((await (await fetch(ref.url)).text()) === text, `FileRef ${base}`);
      assert(
        (await filesystem.readDir({ path: "selftest", base })).entries.map((e) => e.name).join() === "a.txt",
        `readDir ${base}`,
      );
      await filesystem.remove({ path: "selftest", base, recursive: true });
      assert(!(await filesystem.exists({ path: "selftest", base })).value, `remove ${base}`);
    }
    assert(isAkanNativeError(await rejects(filesystem.readFile({ path: "../x", base: "data" })), "INVALID_ARGS"), "..");
    assert(
      isAkanNativeError(await rejects(filesystem.readFile({ path: "nope", base: "data" })), "NOT_FOUND"),
      "missing",
    );
    return `${bases.length} bases (${filesystem.implementation("readFile")})`;
  });
  await check("capabilities (PL-11)", async () => {
    // akan-native.config.ts denies preferences:clear and scopes filesystem away from data/private.
    assert(preferences.isAllowed("get") && !preferences.isAllowed("clear"), "isAllowed");
    const denied = await rejects(preferences.clear());
    assert(isAkanNativeError(denied, "NOT_ALLOWED"), `preferences.clear: ${(denied as Error)?.message ?? "resolved"}`);
    const outside = await rejects(
      filesystem.writeFile({ path: "private/x.txt", base: "data", data: "x", recursive: true }),
    );
    assert(isAkanNativeError(outside, "NOT_ALLOWED"), `data/private: ${(outside as Error)?.message ?? "resolved"}`);
    return `clear → NOT_ALLOWED (${preferences.implementation("clear")}), data/private → NOT_ALLOWED (${filesystem.implementation("writeFile")})`;
  });

  await check("file range request", async () => {
    // Hosts answer Range with 206 for registered files (IN-5), media elements rely on it.
    if (platform === "web") return "skipped (blob/OPFS URLs)";
    await filesystem.writeFile({ path: "selftest-range.txt", base: "cache", data: "0123456789" });
    const ref = await filesystem.readFile({ path: "selftest-range.txt", base: "cache" });
    const res = await fetch(ref.url, { headers: { Range: "bytes=2-4" } });
    assert(res.status === 206 && (await res.text()) === "234", `status ${res.status}`);
    // Read in Range pieces (architecture review stage 4), then no longer served ($bridge.release).
    const pieces = await fileBlob(ref, { chunkSize: 3 });
    assert((await pieces.text()) === "0123456789", "fileBlob");
    assert((await releaseFile(ref)) === true, "releaseFile");
    const gone = await fetch(ref.url);
    assert(gone.status === 404, `after release: HTTP ${gone.status}`);
    await filesystem.remove({ path: "selftest-range.txt", base: "cache" });
    return `${res.headers.get("content-range") ?? ""}; fileBlob in 4 pieces; released`;
  });
  await check("file-picker (validation only, dialogs need a user)", async () => {
    assert(isAkanNativeError(await rejects(filePicker.pickFiles({ types: ["not a type"] })), "INVALID_ARGS"), "types");
    assert(
      isAkanNativeError(await rejects(filePicker.saveFile({ name: "a/b.txt", data: "x" })), "INVALID_ARGS"),
      "name",
    );
    return filePicker.implementation("pickFiles");
  });

  await check("secure-storage round trip", async () => {
    if (!secureStorage.isSupported("set")) {
      assert(isAkanNativeError(await rejects(secureStorage.get({ key: "x" })), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const key = "selftest.secret";
    const value = `s3cr3t ✓\n${"x".repeat(5000)}`; // beyond security(1)'s 128-char and 4 KB limits
    await secureStorage.set({ key, value });
    assert((await secureStorage.get({ key })).value === value, "get after set");
    assert((await secureStorage.keys()).keys.includes(key), "keys");
    await secureStorage.remove({ key });
    assert((await secureStorage.get({ key })).value === null, "get after remove");
    assert(isAkanNativeError(await rejects(secureStorage.set({ key: "", value: "x" })), "INVALID_ARGS"), "bad args");
    return secureStorage.implementation("get");
  });
  await check("biometric status", async () => {
    if (!biometric.isSupported("isAvailable")) {
      assert(isAkanNativeError(await rejects(biometric.isAvailable()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const st = await biometric.isAvailable();
    assert(typeof st.available === "boolean" && typeof st.deviceCredential === "boolean", "shape");
    assert(["face", "fingerprint", "iris", "none"].includes(st.type), `type ${st.type}`);
    assert(st.available || typeof st.reason === "string", "reason when unavailable");
    assert(isAkanNativeError(await rejects(biometric.authenticate({ reason: "" })), "INVALID_ARGS"), "empty reason");
    return `${st.type}, ${st.available ? "available" : st.reason}`;
  });
  await check("geolocation permission", async () => {
    if (!geolocation.isSupported("checkPermission")) {
      assert(isAkanNativeError(await rejects(geolocation.checkPermission()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const p = await geolocation.checkPermission();
    assert(["granted", "denied", "prompt", "prompt-with-rationale"].includes(p.location), `state ${p.location}`);
    assert(p.precise === null || typeof p.precise === "boolean", "precise");
    assert(
      isAkanNativeError(await rejects(geolocation.getCurrentPosition({ timeout: -1 })), "INVALID_ARGS"),
      "bad timeout",
    );
    return `${p.location}${p.precise === null ? "" : p.precise ? ", precise" : ", approximate"} (${geolocation.implementation("getCurrentPosition")})`;
  });

  await check("contacts", async () => {
    if (!contacts.isSupported("checkPermission")) {
      assert(isAkanNativeError(await rejects(contacts.checkPermission()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const { contacts: state } = await contacts.checkPermission();
    assert(["granted", "denied", "prompt", "prompt-with-rationale"].includes(state), `state ${state}`);
    // Reads only when granted outside the app (simctl privacy, pm grant): asking would stop the run at the prompt.
    if (state !== "granted") return state;
    const { contacts: book } = await contacts.getContacts();
    assert(
      book.every((c) => typeof c.id === "string" && Array.isArray(c.phones) && c.phones.every((p) => !!p.number)),
      "shape",
    );
    const { contacts: phonesOnly } = await contacts.getContacts({ projection: { name: false } });
    assert(phonesOnly.length === book.length && phonesOnly.every((c) => c.name === null), "name left out");
    return `${book.length} contacts, ${book.reduce((n, c) => n + c.phones.length, 0)} phones`;
  });

  await check("local-notifications", async () => {
    // Argument checks run in the page: no host call, no prompt.
    assert(isAkanNativeError(await rejects(ln.schedule({ notifications: [] })), "INVALID_ARGS"), "empty schedule");
    assert(
      isAkanNativeError(await rejects(ln.schedule({ notifications: [{ id: 1.5, title: "x" }] })), "INVALID_ARGS"),
      "bad id",
    );
    assert(
      isAkanNativeError(
        await rejects(
          ln.schedule({ notifications: [{ id: 1, title: "x", every: "day", at: Date.now() + 2 * 86_400_000 }] }),
        ),
        "INVALID_ARGS",
      ),
      "every + far at",
    );
    assert(isAkanNativeError(await rejects(ln.cancel({ ids: ["1" as never] })), "INVALID_ARGS"), "bad ids");
    const perm = await ln
      .checkPermission()
      .catch((e) => (isAkanNativeError(e, "UNSUPPORTED") ? null : Promise.reject(e)));
    if (!perm) return "UNSUPPORTED";
    const { display } = perm; // never prompts
    assert(["granted", "denied", "prompt", "prompt-with-rationale"].includes(display), `display ${display}`);
    const id = 990001;
    const at = Date.now() + 30 * 86_400_000; // far away and cancelled at once: nothing is shown
    const request = {
      notifications: [
        { id, title: "akan-native selftest", at, data: { selftest: [1, null] } },
        { id: id + 1, title: "akan-native selftest repeat", every: "week" as const },
      ],
    };
    if (display !== "granted") {
      assert(
        isAkanNativeError(await rejects(ln.schedule(request)), "PERMISSION_DENIED"),
        "schedule without permission",
      );
      return `${display}: schedule → PERMISSION_DENIED (${ln.implementation("schedule")})`;
    }
    assert(JSON.stringify((await ln.schedule(request)).ids) === JSON.stringify([id, id + 1]), "ids");
    const mine = (await ln.getPending()).notifications;
    const once = mine.find((n) => n.id === id);
    const weekly = mine.find((n) => n.id === id + 1);
    assert(
      once && Math.abs(once.at - at) < 1000 && JSON.stringify(once.data) === '{"selftest":[1,null]}',
      `pending ${JSON.stringify(once)}`,
    );
    assert(weekly?.every === "week" && weekly.at > Date.now() + 6 * 86_400_000, `repeat ${JSON.stringify(weekly)}`);
    await ln.cancel({ ids: [id, id + 1] });
    assert(
      !(await ln.getPending()).notifications.some((n) => n.id === id || n.id === id + 1),
      "still pending after cancel",
    );
    if (platform !== "windows" && platform !== "linux") return `granted: round trip (${ln.implementation("schedule")})`;
    // Windows and Linux: shown for real (Action Center, the session's notification server), right
    // away and from the shell's own schedule, then removed. Nothing waits for a click.
    const received: number[] = [];
    const stop = ln.listen("received", (e) => received.push(e.id));
    try {
      const delivered = async (want: number) => {
        for (let i = 0; i < 50; i++) {
          const found = (await ln.getDelivered()).notifications.find((n) => n.id === want);
          if (found) return found;
          await sleep(100);
        }
        throw new Error(`notification ${want} was not delivered`);
      };
      await ln.schedule({
        notifications: [
          { id: id + 2, title: "akan-native selftest", body: "shown now", data: { n: 2 } },
          { id: id + 3, title: "akan-native selftest", body: "shown after 1.5 s", at: Date.now() + 1500 },
        ],
      });
      const now = await delivered(id + 2);
      assert(
        JSON.stringify(now.data) === '{"n":2}' && now.body === "shown now" && typeof now.at === "number",
        `delivered ${JSON.stringify(now)}`,
      );
      assert(
        (await ln.getPending()).notifications.some((n) => n.id === id + 3),
        "the later one is not pending",
      );
      await delivered(id + 3);
      assert(!(await ln.getPending()).notifications.some((n) => n.id === id + 3), "still pending after delivery");
      await waitFor(
        () => received.includes(id + 2) && received.includes(id + 3),
        2000,
        `received events (${received.join(", ")})`,
      );
      await ln.removeDelivered({ ids: [id + 2, id + 3] });
      assert(
        !(await ln.getDelivered()).notifications.some((n) => n.id === id + 2 || n.id === id + 3),
        "still delivered after removeDelivered",
      );
    } finally {
      stop();
    }
    return `granted: round trip, shown now and scheduled, removed (${ln.implementation("schedule")})`;
  });

  await check("splash-screen", async () => {
    // autoHide already hid it after the page load; hide() must still resolve.
    await splashScreen.hide({ fadeOutDuration: 0 });
    await splashScreen.hide();
    assert(
      isAkanNativeError(await rejects(splashScreen.hide({ fadeOutDuration: -1 })), "INVALID_ARGS"),
      "negative fade",
    );
    return splashScreen.implementation("hide");
  });

  await check("window-state", async () => {
    if (!windowState.isSupported("getSaved")) {
      assert(isAkanNativeError(await rejects(windowState.getSaved()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    // save() captures the window now; a hidden window (headless test) keeps what was saved before.
    const { state } = await windowState.save();
    assert(
      state === null || (state.width > 0 && state.height > 0 && typeof state.maximized === "boolean"),
      `state ${JSON.stringify(state)}`,
    );
    const again = (await windowState.getSaved()).state;
    assert(JSON.stringify(again) === JSON.stringify(state), "getSaved differs from save");
    return state
      ? `${Math.round(state.width)}×${Math.round(state.height)} at ${Math.round(state.x)},${Math.round(state.y)}`
      : "nothing saved yet";
  });

  await check("single-instance", () => {
    // This instance got the lock (or it would have exited before the page loaded).
    const impl = singleInstance.eventImplementation("secondInstance");
    const expected = desktop ? "native" : "none";
    assert(impl === expected, `secondInstance ${impl}`);
    singleInstance.listen("secondInstance", () => {})();
    return `secondInstance ${impl}`;
  });

  // plugins.md §5: menus, tray, global shortcuts. Nobody can click during `akan-native test`, so items
  // are chosen with triggerItem / trigger and the context menu closes itself (closeAfterMs).
  await check("menu", async () => {
    if (!menu.isSupported("setAppMenu")) {
      assert(isAkanNativeError(await rejects(menu.getAppMenu()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const before = (await menu.getAppMenu()).items;
    // Windows and Linux windows have no menu bar until the app sets one.
    if (platform === "windows" || platform === "linux")
      assert(before.length === 0, `default menu ${JSON.stringify(before)}`);
    const items: MenuItem[] = [
      { role: "appMenu" },
      { role: "editMenu" },
      {
        label: "Selftest",
        submenu: [
          { id: "selftest.go", label: "Go", accelerator: "CmdOrCtrl+Alt+Shift+G" },
          { id: "selftest.check", label: "Check", checked: false },
        ],
      },
    ];
    const clicks: MenuClick[] = [];
    const stop = menu.listen("click", (c) => clicks.push(c));
    try {
      await menu.setAppMenu({ items });
      const got = (await menu.getAppMenu()).items;
      assert(
        JSON.stringify(got.map((i) => i.role ?? i.label)) === '["appMenu","editMenu","Selftest"]',
        `menu ${JSON.stringify(got)}`,
      );
      assert(got[2]?.submenu?.[0]?.accelerator === "CmdOrCtrl+Alt+Shift+G", "accelerator round trip");
      assert(
        got[1]?.submenu?.some((i) => i.role === "paste"),
        "edit menu has paste",
      );
      await menu.triggerItem({ id: "selftest.go" });
      await menu.triggerItem({ id: "selftest.check" });
      await waitFor(() => clicks.length >= 2, 2000, "menu clicks");
      assert(clicks[0]?.id === "selftest.go" && clicks[1]?.checked === true, `clicks ${JSON.stringify(clicks)}`);
      assert(
        isAkanNativeError(await rejects(menu.setAppMenu({ items: [{ id: "x", label: "Top" }] })), "INVALID_ARGS"),
        "top-level item",
      );
      const t0 = performance.now();
      await menu.popupContextMenu({
        items: [{ id: "selftest.ctx", label: "Context" }],
        x: 20,
        y: 20,
        closeAfterMs: 200,
      });
      return `set, read back, 2 clicks; context menu closed after ${Math.round(performance.now() - t0)} ms`;
    } finally {
      stop();
      await menu.setAppMenu({ items: before }).catch(() => menu.resetAppMenu());
    }
  });

  await check("tray", async () => {
    if (!tray.isSupported("create")) {
      assert(isAkanNativeError(await rejects(tray.list()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const clicks: string[] = [];
    const stop = tray.listen("click", (e) => e.id === "selftest" && clicks.push(e.button));
    try {
      const info = await tray.create({
        id: "selftest",
        icon: "/tray.png",
        iconAsTemplate: true,
        title: "akan-native",
        menu: [{ role: "quit" }],
      });
      assert(
        info.icon && info.iconAsTemplate && info.menu && info.title === "akan-native",
        `tray ${JSON.stringify(info)}`,
      );
      assert(
        (await tray.list()).some((t) => t.id === "selftest"),
        "listed",
      );
      await tray.trigger({ id: "selftest", button: "right" });
      await waitFor(() => clicks.length >= 1, 2000, "tray click");
      assert(
        isAkanNativeError(await rejects(tray.create({ id: "selftest-empty" })), "INVALID_ARGS"),
        "no icon, no title",
      );
      return `created, clicked (${clicks[0]}), removed`;
    } finally {
      stop();
      await tray.remove({ id: "selftest" });
      assert(!(await tray.list()).some((t) => t.id === "selftest"), "removed");
    }
  });

  await check("global-shortcut", async () => {
    if (!globalShortcut.isSupported("register")) {
      assert(isAkanNativeError(await rejects(globalShortcut.list()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const accelerator = "CmdOrCtrl+Alt+Shift+F12";
    assert((await globalShortcut.register({ accelerator })).accelerator === accelerator, "register");
    // CmdOrCtrl is Command on macOS and Control elsewhere, where Cmd is the Windows (Super) key.
    const alias = platform === "macos" ? "Cmd+Alt+Shift+F12" : "Ctrl+Alt+Shift+F12";
    assert((await globalShortcut.isRegistered({ accelerator: alias })).registered, `${alias} is CmdOrCtrl`);
    if (platform !== "macos")
      assert(
        !(await globalShortcut.isRegistered({ accelerator: "Cmd+Alt+Shift+F12" })).registered,
        "Cmd is the Super key",
      );
    assert(
      isAkanNativeError(await rejects(globalShortcut.register({ accelerator: "Hyper+K" })), "INVALID_ARGS"),
      "bad accelerator",
    );
    assert((await globalShortcut.unregister({ accelerator })).removed, "unregister");
    assert(!(await globalShortcut.isRegistered({ accelerator })).registered, "unregistered");
    return "register, isRegistered, unregister (a key press needs a person)";
  });

  await check("dock", async () => {
    if (!dock.isSupported("setBadge")) {
      assert(isAkanNativeError(await rejects(dock.getState()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const before = await dock.getState();
    try {
      assert((await dock.setBadge({ label: "3" })).badge === "3", "badge");
      const bar = await dock.setProgress({ progress: 0.25, state: "paused" });
      assert(bar.progress === 0.25 && bar.progressState === "paused", `progress ${JSON.stringify(bar)}`);
      assert(isAkanNativeError(await rejects(dock.setProgress({ progress: 2 })), "INVALID_ARGS"), "progress > 1");
      // Linux launchers show a count, not text.
      if (platform === "linux")
        assert(isAkanNativeError(await rejects(dock.setBadge({ label: "new" })), "UNSUPPORTED"), "text badge");
    } finally {
      await dock.setProgress({ progress: null });
      await dock.setBadge({ label: before.badge });
    }
    const after = await dock.getState();
    assert(after.badge === before.badge && after.progress === null, "restored");
    return `policy ${before.policy}; badge, progress set and cleared`;
  });
  await check("screen", async () => {
    if (!screen.isSupported("getDisplays")) {
      assert(isAkanNativeError(await rejects(screen.getDisplays()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const ds = await screen.getDisplays();
    assert(ds.length >= 1 && ds[0]!.primary, `displays ${JSON.stringify(ds)}`);
    for (const { bounds: b, workArea: w, scale } of ds) {
      assert(
        b.width > 0 &&
          scale >= 1 &&
          w.x >= b.x &&
          w.y >= b.y &&
          w.x + w.width <= b.x + b.width &&
          w.y + w.height <= b.y + b.height,
        "work area inside bounds",
      );
    }
    screen.listen("change", () => {})();
    // X11 has one space for all displays; its origin need not be the primary display's.
    if (platform !== "linux") assert(ds[0]!.bounds.x === 0 && ds[0]!.bounds.y === 0, "primary at the origin");
    if (!desktop) {
      assert(
        isAkanNativeError(await rejects(screen.getCursorPoint()), "UNSUPPORTED"),
        "no cursor position in a browser",
      );
      return `${platform}: ${ds[0]!.bounds.width}×${ds[0]!.bounds.height}@${ds[0]!.scale}x`;
    }
    // Wayland tells an app where the pointer is only over its own windows.
    const wayland = (e: unknown) =>
      platform === "linux" && isAkanNativeError(e, "UNSUPPORTED") && /Wayland/.test(String((e as Error).message));
    const c = await screen.getCursorPoint().catch((e) => (wayland(e) ? null : Promise.reject(e)));
    if (!c) return `${ds.length} display(s); no cursor position on Wayland`;
    assert(Number.isFinite(c.x) && Number.isFinite(c.y), "cursor");
    return `${ds.length} display(s), cursor on ${displayAt(c, ds)?.name}`;
  });
  await check("volume", async () => {
    if (!desktop && platform !== "android") {
      assert(isAkanNativeError(await rejects(volume.getVolume()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    let missing = "";
    // No audio server answers (NOT_FOUND), or on Linux no pactl to ask (UNSUPPORTED): a container or a headless box.
    const before = await volume.getVolume().catch((e) => {
      if (!isAkanNativeError(e, "NOT_FOUND") && !(platform === "linux" && isAkanNativeError(e, "UNSUPPORTED")))
        return Promise.reject(e);
      missing = (e as Error).message;
      return null;
    });
    if (!before) return `no audio output (${missing})`;
    volume.listen("change", () => {})();
    if (!before.settable || before.level === null) return `level ${before.level}, not settable`;
    const level = before.level;
    // Bluetooth outputs keep 16 steps of volume, so a level reads back within 1/32 of what was set.
    const target = level > 0.5 ? level - 0.1 : level + 0.1;
    try {
      const set = await volume.setVolume({ level: target });
      assert(Math.abs((set.level ?? -1) - target) < 0.05, `set ${target}, read ${set.level}`);
      assert((await volume.setMuted({ muted: !before.muted })).muted === !before.muted, "mute toggled");
    } finally {
      await volume.setMuted({ muted: before.muted });
      await volume.setVolume({ level });
    }
    const after = await volume.getVolume();
    assert(after.muted === before.muted && Math.abs((after.level ?? -1) - level) < 0.05, "restored");
    return `level ${level}; set, muted and restored`;
  });
  await check("autostart", async () => {
    if (!autostart.isSupported("isEnabled")) {
      assert(isAkanNativeError(await rejects(autostart.isEnabled()), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    const s = await autostart.isEnabled(); // read only: enable() adds a real login item
    assert(
      ["enabled", "notRegistered", "requiresApproval", "notFound"].includes(s.status) &&
        s.enabled === (s.status === "enabled"),
      `status ${s.status}`,
    );
    return `status ${s.status}`;
  });
  await check("toast", async () => {
    assert(isAkanNativeError(await rejects(toast.show({ text: " " })), "INVALID_ARGS"), "empty text");
    assert(
      isAkanNativeError(await rejects(toast.show({ text: "x", duration: "forever" as never })), "INVALID_ARGS"),
      "bad duration",
    );
    await toast.show({ text: "akan-native selftest" });
    if (toast.implementation("show") === "web") {
      await waitFor(
        () =>
          [...document.querySelectorAll(".akan-native-toast")].some((b) => b.textContent === "akan-native selftest"),
        6000,
        "in-page toast",
      );
      await waitFor(
        () => document.querySelector(".akan-native-toast-live")?.textContent === "akan-native selftest",
        2000,
        "toast live region",
      );
    }
    return toast.implementation("show");
  });
  await check("badge", async () => {
    if (!badge.isSupported("set")) {
      assert(isAkanNativeError(await rejects(badge.set({ count: 1 })), "UNSUPPORTED"), "expected UNSUPPORTED");
      return "UNSUPPORTED";
    }
    assert(isAkanNativeError(await rejects(badge.set({ count: -1 })), "INVALID_ARGS"), "negative count");
    assert(isAkanNativeError(await rejects(badge.set({ count: 1.5 })), "INVALID_ARGS"), "fractional count");
    const perm = await badge
      .checkPermission()
      .catch((e) => (isAkanNativeError(e, "UNSUPPORTED") ? null : Promise.reject(e)));
    if (!perm) return "UNSUPPORTED (no Badging API)";
    if (perm.badge !== "granted") {
      assert(isAkanNativeError(await rejects(badge.set({ count: 3 })), "PERMISSION_DENIED"), "set without permission");
      await badge.clear();
      return `${perm.badge}: set → PERMISSION_DENIED`;
    }
    const e = await rejects(badge.set({ count: 3 }));
    if (e && !(platform === "web" && isAkanNativeError(e, "PERMISSION_DENIED"))) throw e;
    await badge.clear();
    return `granted (${badge.implementation("set")})`;
  });
  await check("accessibility", async () => {
    const s = await accessibility.getState();
    assert(mobile ? typeof s.screenReader === "boolean" : s.screenReader === null, `screenReader ${s.screenReader}`);
    assert(typeof s.reduceMotion === "boolean" && s.fontScale > 0.5 && s.fontScale < 4, JSON.stringify(s));
    if (platform !== "android")
      assert(s.reduceMotion === matchMedia("(prefers-reduced-motion: reduce)").matches, "reduceMotion vs media query");
    assert(isAkanNativeError(await rejects(accessibility.announce({ text: "" })), "INVALID_ARGS"), "empty text");
    assert(
      isAkanNativeError(
        await rejects(accessibility.announce({ text: "x", priority: "loud" as never })),
        "INVALID_ARGS",
      ),
      "bad priority",
    );
    await accessibility.announce({ text: "akan-native selftest" });
    if (accessibility.implementation("announce") === "web") {
      const region = document.querySelector('[data-akan-native-announcer="polite"]');
      assert(region && [...region.children].some((c) => c.textContent === "akan-native selftest"), "live region");
    }
    const stop = accessibility.listen("change", () => {});
    await accessibility.getState();
    stop();
    return `${JSON.stringify(s)} (announce ${accessibility.implementation("announce")})`;
  });
  await check("sqlite", async () => {
    if (!sqlite.isSupported("open")) {
      assert(isAkanNativeError(await rejects(sqlite.open({ name: "selftest.db" })), "UNSUPPORTED"), "web");
      return "UNSUPPORTED";
    }
    const { db } = await sqlite.open({ name: "selftest.db" });
    await sqlite.execute({ db, sql: "DROP TABLE IF EXISTS notes" });
    await sqlite.execute({
      db,
      sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT UNIQUE, score REAL, data BLOB)",
    });
    const ins = await sqlite.execute({
      db,
      sql: "INSERT INTO notes (title, score, data) VALUES (?, ?, ?)",
      params: ["한글 ✓", 1.5, { base64: "AAH/" }],
    });
    assert(ins.changes === 1 && ins.lastInsertId === 1, JSON.stringify(ins));
    for (const sql of ["BEGIN", "INSERT INTO notes (title) VALUES ('gone')", "ROLLBACK"])
      await sqlite.execute({ db, sql });
    const { columns, rows } = await sqlite.query({ db, sql: "SELECT id, title, score, data FROM notes" });
    assert(
      columns.join() === "id,title,score,data" &&
        rows.length === 1 &&
        rows[0]!.title === "한글 ✓" &&
        (rows[0]!.data as { base64: string }).base64 === "AAH/",
      JSON.stringify(rows),
    );
    const t = (
      await sqlite.query({
        db,
        sql: "SELECT typeof(?) a, typeof(?) b, typeof(?) c, typeof(?) d, typeof(?) e",
        params: [1, 1.5, true, null, { base64: "" }],
      })
    ).rows[0]!;
    assert([t.a, t.b, t.c, t.d, t.e].join() === "integer,real,integer,null,blob", JSON.stringify(t));
    assert(
      isAkanNativeError(
        await rejects(sqlite.execute({ db, sql: "INSERT INTO notes (title) VALUES (?)", params: ["한글 ✓"] })),
        "INVALID_ARGS",
      ),
      "UNIQUE",
    );
    assert(
      isAkanNativeError(await rejects(sqlite.execute({ db, sql: "SELECT 1; SELECT 2" })), "INVALID_ARGS"),
      "two statements",
    );
    // Files outside the app's databases are out of reach (past the filesystem plugin's scopes).
    assert(
      isAkanNativeError(await rejects(sqlite.execute({ db, sql: "ATTACH 'other.db' AS other" })), "NOT_ALLOWED"),
      "ATTACH",
    );
    assert(
      isAkanNativeError(await rejects(sqlite.execute({ db, sql: "VACUUM INTO 'copy.db'" })), "NOT_ALLOWED"),
      "VACUUM INTO",
    );
    await sqlite.close({ db });
    assert(isAkanNativeError(await rejects(sqlite.query({ db, sql: "SELECT 1" })), "NOT_FOUND"), "closed");
    return sqlite.implementation("query");
  });
  await check("http (WV-5)", async () => {
    for (const url of ["file:///etc/hosts", "ftp://example.com/", "https://u:p@example.com/"])
      assert(isAkanNativeError(await rejects(http.request({ url })), "INVALID_ARGS"), url);
    assert(
      isAkanNativeError(await rejects(http.request({ url: "https://example.com/", body: "x" })), "INVALID_ARGS"),
      "GET body",
    );
    assert(
      isAkanNativeError(await rejects(http.request({ url: "https://blocked.example/x" })), "NOT_ALLOWED"),
      "scope",
    );
    if (platform === "web") {
      const r = await http.request({ url: `${location.origin}/` });
      assert(r.status === 200, `origin ${r.status}`);
    } else
      assert(
        isAkanNativeError(await rejects(http.request({ url: "https://127.0.0.1:1/", timeout: 5000 })), "INTERNAL"),
        "refused",
      );
    if (env.PUBLIC_SELFTEST_NETWORK === "1") {
      const r = await http.request({ url: "https://example.com/" });
      assert(r.status === 200 && r.data.includes("Example Domain"), `${r.status}`);
    }
    return http.implementation("request");
  });
  await check("CSP blocks injected inline scripts (SEC-4)", async () => {
    if (!document.querySelector('meta[http-equiv="Content-Security-Policy" i]'))
      return "no policy (security.csp is not set)";
    const w = window as { __akan_nativeCspProbe?: number };
    delete w.__akan_nativeCspProbe;
    let violation = "";
    const onViolation = (e: SecurityPolicyViolationEvent) =>
      (violation ||= e.effectiveDirective || e.violatedDirective);
    document.addEventListener("securitypolicyviolation", onViolation);
    const script = document.createElement("script");
    script.textContent = "window.__akan_nativeCspProbe = 1";
    document.head.append(script);
    await new Promise((r) => setTimeout(r, 150));
    script.remove();
    document.removeEventListener("securitypolicyviolation", onViolation);
    assert(w.__akan_nativeCspProbe === undefined, "an injected inline script ran");
    assert(violation.startsWith("script-src"), `no script-src violation was reported (${violation || "none"})`);
    return `blocked (${violation})`;
  });

  // SEC-4: frames never reach the native bridge. public/selftest-frame.js tries every transport
  // from a sandboxed (opaque origin) frame and from a same-origin frame.
  await check("iframes cannot reach the bridge (SEC-4)", async () => {
    const transport = () =>
      (
        window.__AKAN_NATIVE__ as
          | { __runtime?: { transport?: { info?(): Record<string, unknown> } | null } }
          | undefined
      )?.__runtime?.transport;
    const portsBefore = transport()?.info?.().ports;
    await preferences.remove({ key: "selftest.frame" });
    const runFrame = (sandbox: string | null) =>
      new Promise<Record<string, string>>((resolve, reject) => {
        const frame = document.createElement("iframe");
        if (sandbox !== null) frame.setAttribute("sandbox", sandbox);
        frame.src = "/selftest-frame.html";
        frame.style.display = "none";
        const cleanup = () => {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          frame.remove();
        };
        const onMessage = (event: MessageEvent) => {
          if (event.source !== frame.contentWindow || !event.data?.akanNativeSelftestFrame) return;
          cleanup();
          resolve(event.data.akanNativeSelftestFrame);
        };
        const timer = setTimeout(() => (cleanup(), reject(new Error("the test frame did not report"))), 10_000);
        window.addEventListener("message", onMessage);
        document.body.append(frame);
      });
    const opaque = await runFrame("allow-scripts");
    assert(opaque.parent?.startsWith("error"), `a sandboxed frame reached parent.__AKAN_NATIVE__ (${opaque.parent})`);
    assert(opaque.fakePort === "ignored", `a sandboxed frame's port was used (${opaque.fakePort})`);
    const written = (await preferences.get({ key: "selftest.frame" })).value;
    assert(written === null, `a sandboxed frame called a plugin (ipc: ${opaque.ipc}, webkit: ${opaque.webkit})`);
    // Same-origin frames are the app's own content: they may not break the page's bridge either.
    const same = await runFrame(null);
    await preferences.remove({ key: "selftest.frame" });
    await new Promise((r) => setTimeout(r, 800)); // let any port the shell posted arrive
    const portsAfter = transport()?.info?.().ports;
    assert(portsAfter === portsBefore, `the page adopted a port a frame asked for (${portsBefore} → ${portsAfter})`);
    assert((await preferences.get({ key: "selftest.key" })).value !== undefined, "bridge still works");
    return `sandboxed: ipc ${opaque.ipc}, hello ${opaque.hello}, webkit ${opaque.webkit}; same-origin: hello ${same.hello}, webkit ${same.webkit}`;
  });

  // SH-4: frames inside the page load web content from other origins (embedded video, maps,
  // payment forms) and never open anything outside the app; only the page itself stays on the app
  // origin. index.html's CSP blocks data: frames, so public/selftest-nav.html (no CSP) holds them.
  if (desktop) {
    await check("frames load other origins (SH-4)", async () => {
      const frame = document.createElement("iframe");
      frame.src = "/selftest-nav.html";
      frame.style.display = "none";
      try {
        const report = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(
            () => (window.removeEventListener("message", onMessage), reject(new Error("the data: frame did not load"))),
            5000,
          );
          const onMessage = (event: MessageEvent) => {
            if (!event.data?.akanNativeSelftestNav) return;
            clearTimeout(timer);
            window.removeEventListener("message", onMessage);
            resolve(event.data.akanNativeSelftestNav);
          };
          window.addEventListener("message", onMessage);
          document.body.append(frame);
        });
        await new Promise((r) => setTimeout(r, 300)); // the custom-scheme frames are dropped meanwhile
        assert(location.origin === window.origin && document.getElementById("root"), "the page left the app");
        return report;
      } finally {
        frame.remove();
      }
    });
  }

  if (desktop) {
    // Native dialogs. `akan-native test` ends each one after 300 ms (AKAN_NATIVE_TEST_PANELS=auto): alerts with
    // their first button, file panels with Cancel. Run by hand, these wait for a click. macOS shows
    // sheets, Windows TaskDialogs and IFileDialogs, Linux GTK dialogs and file choosers. The page's
    // own alert/confirm/prompt are the shell's sheets on macOS and the webview's dialogs on Windows
    // and Linux, which the shell answers under the test variable (native/desktop/src/dialog_args.rs).
    const [jsDialogs, dialogs, filePanels] =
      platform === "windows"
        ? [
            "JavaScript alert/confirm/prompt (D7, WebView2 ScriptDialogOpening)",
            "dialog TaskDialogs",
            "file dialogs (IFileOpenDialog/IFileSaveDialog, closed)",
          ]
        : platform === "linux"
          ? [
              "JavaScript alert/confirm/prompt (D7, WebKitGTK script-dialog)",
              "dialog GtkMessageDialogs",
              "file choosers (GtkFileChooserNative, closed)",
            ]
          : [
              "JavaScript alert/confirm/prompt sheets (D7)",
              "dialog NSAlert sheets",
              "file panels (NSOpenPanel/NSSavePanel sheets, closed)",
            ];
    await check(jsDialogs, () => {
      const t0 = performance.now();
      window.alert("akan-native selftest");
      const confirmed = window.confirm("akan-native selftest");
      const prompted = window.prompt("akan-native selftest", "default text");
      const ms = Math.round(performance.now() - t0);
      assert(
        confirmed === true && prompted === "default text",
        `confirm=${confirmed}, prompt=${JSON.stringify(prompted)}`,
      );
      assert(ms >= 600, `returned after ${ms} ms: no panel was shown`);
      return `answered after ${ms} ms`;
    });

    await check(dialogs, async () => {
      // The shell's loop keeps running under a dialog: bridge calls are answered while it is open.
      let closed = false;
      const confirmed = dialog
        .confirm({ title: "akan-native", message: "selftest", okButtonTitle: "Yes" })
        .finally(() => (closed = true));
      await preferences.get({ key: "selftest.key" });
      assert(!closed, "a bridge call waited for the dialog");
      assert((await confirmed).value === true, "confirm");
      const typed = await dialog.prompt({ message: "selftest", inputText: "abc" });
      assert(typed.value === "abc" && !typed.cancelled, `prompt ${JSON.stringify(typed)}`);
      const sheet = await dialog.actionSheet({
        options: [{ title: "Cancel", style: "cancel" }, { title: "First" }, { title: "Delete", style: "destructive" }],
      });
      assert(sheet.index === 1 && !sheet.cancelled, `actionSheet ${JSON.stringify(sheet)}`);
      return dialog.implementation("alert");
    });

    await check(filePanels, async () => {
      assert((await filePicker.pickFiles({ types: ["pdf"], multiple: true })).files.length === 0, "pickFiles");
      assert((await filePicker.saveFile({ name: "selftest.txt", data: "x" })).saved === false, "saveFile");
      assert((await filePicker.pickDirectory()).name === null, "pickDirectory");
      return filePicker.implementation("pickFiles");
    });
  }

  if (desktop) {
    await check("an idle app wakes the plugin host zero times (K-idle)", async () => {
      const before = await hostCall("stats");
      await new Promise((r) => setTimeout(r, 5000));
      const after = await hostCall("stats");
      // The measuring itself: the first call's shell reply comes after its snapshot, and the second
      // call's request before it. Everything else in between would be idle wakes.
      const wakes = after.wakes - before.wakes - 2;
      const frames = after.framesIn - before.framesIn - 2;
      assert(wakes <= 0 && frames <= 0, `${wakes} wakes, ${frames} frames in 5 s without page activity`);
      return `0 wakes in 5 s; deepest queue ${after.maxDepth}, ${after.wakes} wakes / ${after.framesIn} frames so far`;
    });
  }

  localStorage.removeItem(K13);
  return { pass: results.every((r) => r.ok), platform, results };
}

export async function runSelftestAndReport(): Promise<void> {
  const report = await runSelftest();
  for (const r of report.results)
    console.info(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  // Android's log cuts a message at about 4 KB, and the report is longer: send it as base64 parts
  // (`akan-native test` puts them back together; packages/cli/src/commands/test.ts).
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(report))));
  const parts = Math.ceil(encoded.length / 3000);
  for (let i = 0; i < parts; i++)
    console.info(`AKAN_NATIVE_SELFTEST_PART ${i + 1}/${parts} ${encoded.slice(i * 3000, (i + 1) * 3000)}`);
}
