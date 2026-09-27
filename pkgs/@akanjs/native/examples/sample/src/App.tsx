import { app, env, isDev, type PluginHandle, platform, runtimeVersion } from "@akanjs/native/core";
import { type AppInfoResult, app as appPlugin, useBackButton, useUrlOpen } from "@akanjs/native/plugins/app";
import { appState, useAppState } from "@akanjs/native/plugins/app-state";
import { camera, useCamera } from "@akanjs/native/plugins/camera";
import { keyboard, useKeyboard } from "@akanjs/native/plugins/keyboard";
import { preferences, usePreference } from "@akanjs/native/plugins/preferences";
import { type SecondInstance, singleInstance } from "@akanjs/native/plugins/single-instance";
import { appWindow, createWindow, currentWindowId, useWindowState } from "@akanjs/native/plugins/window";
import { type SavedWindowState, windowState } from "@akanjs/native/plugins/window-state";
import { usePluginEvent } from "@akanjs/native/react";
import { useEffect, useState } from "react";
import { DesktopCard } from "./DesktopCard.tsx";
import { NotificationsCard } from "./NotificationsCard.tsx";
import { Link, usePath } from "./router.tsx";
import { UpdatesCard } from "./UpdatesCard.tsx";

export function App() {
  const path = usePath();
  useUrlOpen((url) => console.info(`[sample] deep link ${url}`));
  return (
    <div className="shell">
      <header className="top" data-akan-native-drag-region="deep">
        <img src="/akan-native.svg" width={28} height={28} alt="" />
        <strong>{app?.name ?? "Akan Native Sample"}</strong>
        <span className={`badge badge-${platform}`}>{platform}</span>
      </header>
      <nav className="tabs">
        <Link to="/">Overview</Link>
        <Link to="/hooks">Hooks</Link>
        <Link to="/about/deep/link">Deep link</Link>
      </nav>
      <main>{path === "/" ? <Overview /> : path === "/hooks" ? <Hooks /> : <DeepLink path={path} />}</main>
    </div>
  );
}

function Overview() {
  return (
    <>
      <section className="card">
        <h2>Runtime</h2>
        <dl>
          <dt>platform</dt>
          <dd>{platform}</dd>
          <dt>akan-native runtime</dt>
          <dd>{runtimeVersion}</dd>
          <dt>app</dt>
          <dd>{app ? `${app.id} ${app.version}` : "(no init.js)"}</dd>
          <dt>dev</dt>
          <dd>{String(isDev)}</dd>
        </dl>
      </section>
      <section className="card">
        <h2>Build-time values</h2>
        <p className="hint">Fixed in the bundle by the SPA bundler (define).</p>
        <dl>
          <dt>built at</dt>
          <dd>{__BUILD_TIME__}</dd>
          <dt>mode</dt>
          <dd>{__BUILD_MODE__}</dd>
        </dl>
      </section>
      <section className="card">
        <h2>Runtime env</h2>
        <p className="hint">From /__akan_native/init.js. Change it without rebuilding the SPA.</p>
        {Object.keys(env).length === 0 ? (
          <p>(empty)</p>
        ) : (
          <dl>
            {Object.entries(env).map(([key, value]) => (
              <Entry key={key} name={key} value={value} />
            ))}
          </dl>
        )}
      </section>
      <section className="card">
        <h2>Plugin support</h2>
        <SupportTable plugins={[appState, preferences, keyboard, camera, appPlugin, appWindow]} />
      </section>
    </>
  );
}

function Entry({ name, value }: { name: string; value: string }) {
  return (
    <>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </>
  );
}

function SupportTable({ plugins }: { plugins: PluginHandle<any, any>[] }) {
  return (
    <table className="support">
      <tbody>
        {plugins.flatMap((plugin) =>
          plugin.methods.map((method) => {
            const impl = plugin.implementation(method);
            return (
              <tr key={`${plugin.id}.${method}`}>
                <td>
                  {plugin.id}.{method}
                </td>
                <td className={`impl impl-${impl}`}>{impl === "none" ? "UNSUPPORTED" : impl}</td>
              </tr>
            );
          }),
        )}
      </tbody>
    </table>
  );
}

function Hooks() {
  return (
    <>
      <AppCard />
      <WindowCard />
      <DesktopCard />
      <NotificationsCard />
      <UpdatesCard />
      <AppStateCard />
      <PreferencesCard />
      <KeyboardCard />
      <CameraCard />
    </>
  );
}

function AppStateCard() {
  const state = useAppState();
  const [log, setLog] = useState<string[]>([]);
  usePluginEvent(appState, "change", ({ state }) =>
    setLog((items) => [`${new Date().toLocaleTimeString()} → ${state}`, ...items].slice(0, 5)),
  );
  return (
    <section className="card">
      <h2>useAppState</h2>
      <p>
        state: <span className={`state state-${state}`}>{state}</span>
      </p>
      <p className="hint">Switch windows or apps and come back.</p>
      {log.length > 0 && (
        <ul className="log">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PreferencesCard() {
  const [count, setCount, ready] = usePreference("sample.counter");
  const [note, setNote] = usePreference("sample.note");
  const value = Number(count ?? 0);
  return (
    <section className="card">
      <h2>usePreference</h2>
      <p className="hint">Survives reloads and app restarts.</p>
      <div className="row">
        <button onClick={() => setCount(String(value + 1))} disabled={!ready}>
          count: {ready ? value : "…"}
        </button>
        <button className="secondary" onClick={() => setCount(null)} disabled={!ready}>
          reset
        </button>
      </div>
      <input
        className="field"
        placeholder="a note that is saved as you type"
        value={note ?? ""}
        onChange={(e) => setNote(e.target.value || null)}
      />
    </section>
  );
}

function KeyboardCard() {
  const kb = useKeyboard();
  return (
    <section className="card">
      <h2>useKeyboard</h2>
      {!kb.supported ? (
        <p className="impl-none">UNSUPPORTED on {platform}</p>
      ) : (
        <>
          <p>{kb.visible ? `visible, ${kb.height}px` : "hidden"}</p>
          <div className="row">
            <input className="field" placeholder="focus me to open the keyboard" />
            <button className="secondary" onClick={() => kb.hide()}>
              hide
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function CameraCard() {
  const cam = useCamera();
  const [many, setMany] = useState<{ width?: number; height?: number }[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <section className="card">
      <h2>useCamera</h2>
      {!cam.supported ? (
        <p className="impl-none">UNSUPPORTED on {platform}</p>
      ) : (
        <div className="row">
          <button onClick={() => cam.takePhoto()} disabled={cam.pending}>
            {cam.pending ? "…" : "Take photo"}
          </button>
          <button className="secondary" onClick={() => cam.takePhoto({ source: "library" })} disabled={cam.pending}>
            From library
          </button>
          {camera.isSupported("pickImages") && (
            <button
              className="secondary"
              onClick={() =>
                camera.pickImages({ limit: 5 }).then(
                  ({ photos }) => setMany(photos),
                  () => {},
                )
              }
            >
              Pick several
            </button>
          )}
        </div>
      )}
      {many.length > 0 && (
        <p className="hint">
          picked {many.length}: {many.map((p) => `${p.width}×${p.height}`).join(", ")}
        </p>
      )}
      {cam.error && (
        <p className="error">
          {cam.error.code}: {cam.error.message}
        </p>
      )}
      {cam.photo && (
        <figure className="photo">
          <img src={cam.photo.url} alt="Captured" />
          <figcaption>
            {cam.photo.mime} · {(cam.photo.size / 1024).toFixed(0)} KiB
            {cam.photo.width ? ` · ${cam.photo.width}×${cam.photo.height}` : ""}
          </figcaption>
          {camera.isSupported("saveToGallery") && (
            <button
              className="secondary"
              onClick={() =>
                camera.saveToGallery({ url: cam.photo!.url }).then(
                  () => setSaved("saved"),
                  (e) => setSaved(e.code),
                )
              }
            >
              Save to gallery {saved && `(${saved})`}
            </button>
          )}
        </figure>
      )}
    </section>
  );
}

function DeepLink({ path }: { path: string }) {
  return (
    <section className="card">
      <h2>SPA route</h2>
      <p>
        You are on <code>{path}</code>. Reload here: the host must answer with index.html (IN-4).
      </p>
      <p>
        <Link to="/">Back to overview</Link>
      </p>
    </section>
  );
}

function AppCard() {
  const [info, setInfo] = useState<AppInfoResult | null>(null);
  const [launch, setLaunch] = useState<string | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [backs, setBacks] = useState(0);
  useEffect(() => {
    appPlugin.getInfo().then(setInfo, () => {});
    appPlugin.getLaunchUrl().then(
      ({ url }) => setLaunch(url),
      () => {},
    );
  }, []);
  useUrlOpen((url) => setLinks((l) => [url, ...l].slice(0, 3)));
  useBackButton(({ canGoBack }) => {
    setBacks((n) => n + 1);
    if (canGoBack) history.back();
  });
  return (
    <section className="card">
      <h2>app</h2>
      <p className="hint">Open akansample://hello from another app to test deep links.</p>
      <dl>
        <dt>info</dt>
        <dd>{info ? `${info.name} ${info.version} (${info.build})` : "…"}</dd>
        <dt>launch URL</dt>
        <dd>{launch ?? "none"}</dd>
        <dt>deep links</dt>
        <dd>{links.length ? links.join(", ") : "none yet"}</dd>
        <dt>back presses</dt>
        <dd>{backs}</dd>
      </dl>
    </section>
  );
}

function WindowCard() {
  const state = useWindowState();
  const [saved, setSaved] = useState<SavedWindowState | null | undefined>(undefined);
  const [second, setSecond] = useState<SecondInstance | null>(null);
  usePluginEvent(singleInstance, "secondInstance", setSecond);
  useEffect(() => {
    if (windowState.isSupported("getSaved")) windowState.getSaved().then(({ state }) => setSaved(state));
  }, [state]);
  if (!appWindow.isSupported("maximize")) return null;
  return (
    <section className="card">
      <h2>window {currentWindowId}</h2>
      <p>
        {state
          ? `${Math.round(state.width)}×${Math.round(state.height)}${state.fullscreen ? ", fullscreen" : ""}${state.maximized ? ", maximized" : ""}`
          : "…"}
      </p>
      <div className="row">
        <button onClick={() => (state?.maximized ? appWindow.unmaximize() : appWindow.maximize())}>
          {state?.maximized ? "Unmaximize" : "Maximize"}
        </button>
        <button className="secondary" onClick={() => appWindow.setFullscreen({ value: !state?.fullscreen })}>
          {state?.fullscreen ? "Exit full screen" : "Full screen"}
        </button>
        <button className="secondary" onClick={() => appWindow.center()}>
          Center
        </button>
        {appWindow.isSupported("create") && (
          <button
            className="secondary"
            onClick={() =>
              void createWindow({ path: "/hooks", title: `${state?.title ?? "Akan Native Sample"} (new window)` })
            }
          >
            New window
          </button>
        )}
      </div>
      {saved !== undefined && (
        <p className="hint">
          window-state:{" "}
          {saved
            ? `${Math.round(saved.width)}×${Math.round(saved.height)} at ${Math.round(saved.x)},${Math.round(saved.y)}${saved.maximized ? ", maximized" : ""}`
            : "nothing saved"}{" "}
          <button className="secondary" onClick={() => windowState.clear().then(() => setSaved(null))}>
            Forget
          </button>
        </p>
      )}
      {second && (
        <p className="hint">
          second launch: {second.args.length ? second.args.join(" ") : "(no arguments)"} in {second.cwd}
        </p>
      )}
    </section>
  );
}
