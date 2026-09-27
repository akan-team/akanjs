// Desktop-only card: app menu, context menu, tray and a global shortcut (plugins.md §5).
import { globalShortcut } from "@akanjs/native/plugins/global-shortcut";
import { type MenuItem, menu } from "@akanjs/native/plugins/menu";
import { tray } from "@akanjs/native/plugins/tray";
import { usePluginEvent } from "@akanjs/native/react";
import { useState } from "react";

const SAMPLE_MENU: MenuItem[] = [
  { role: "appMenu" },
  { role: "editMenu" },
  {
    label: "Sample",
    submenu: [
      { id: "sample.hello", label: "Say Hello", accelerator: "CmdOrCtrl+Shift+H" },
      { id: "sample.compact", label: "Compact Layout", checked: false },
    ],
  },
  { role: "windowMenu" },
];

const CONTEXT_MENU: MenuItem[] = [
  { id: "sample.inspect", label: "Inspect Card" },
  { type: "separator" },
  { role: "copy" },
  { role: "selectAll" },
];

const TRAY_ID = "sample";
const SHORTCUT = "CmdOrCtrl+Alt+Shift+O";

export function DesktopCard() {
  const [log, setLog] = useState<string[]>([]);
  const [customMenu, setCustomMenu] = useState(false);
  const [trayOn, setTrayOn] = useState(false);
  const [shortcutOn, setShortcutOn] = useState(false);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 6));
  usePluginEvent(menu, "click", (c) =>
    add(`menu (${c.source}): ${c.id}${c.checked === undefined ? "" : c.checked ? " on" : " off"}`),
  );
  usePluginEvent(tray, "click", (e) => add(`tray: ${e.button} click`));
  usePluginEvent(tray, "menuClick", (e) => add(`tray menu: ${e.item}`));
  usePluginEvent(globalShortcut, "pressed", (e) => add(`shortcut: ${e.accelerator}`));
  if (!menu.isSupported("setAppMenu")) return null;

  const run = (p: Promise<unknown>) => p.catch((e: Error) => add(`error: ${e.message}`));
  const toggleMenu = () =>
    run(
      (customMenu ? menu.resetAppMenu() : menu.setAppMenu({ items: SAMPLE_MENU })).then(() =>
        setCustomMenu(!customMenu),
      ),
    );
  const toggleTray = () =>
    run(
      (trayOn
        ? tray.remove({ id: TRAY_ID })
        : tray.create({
            id: TRAY_ID,
            icon: "/tray.png",
            iconAsTemplate: true,
            tooltip: "Akan Native Sample",
            menu: [{ id: "sample.tray.hello", label: "Hello from the tray" }, { type: "separator" }, { role: "quit" }],
          })
      ).then(() => setTrayOn(!trayOn)),
    );
  const toggleShortcut = () =>
    run(
      (shortcutOn
        ? globalShortcut.unregister({ accelerator: SHORTCUT })
        : globalShortcut.register({ accelerator: SHORTCUT })
      ).then(() => setShortcutOn(!shortcutOn)),
    );

  return (
    <section
      className="card"
      onContextMenu={(e) => {
        e.preventDefault();
        void run(menu.popupContextMenu({ items: CONTEXT_MENU, x: e.clientX, y: e.clientY }));
      }}
    >
      <h2>menu · tray · shortcut</h2>
      <p className="hint">
        Right-click this card for a context menu. The shortcut works while other apps are in front.
      </p>
      <div className="row">
        <button onClick={toggleMenu}>{customMenu ? "Default menu" : "Sample menu"}</button>
        <button className="secondary" onClick={toggleTray}>
          {trayOn ? "Remove tray" : "Add tray"}
        </button>
        <button className="secondary" onClick={toggleShortcut}>
          {shortcutOn ? "Unregister ⌘⌥⇧O" : "Register ⌘⌥⇧O"}
        </button>
      </div>
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
