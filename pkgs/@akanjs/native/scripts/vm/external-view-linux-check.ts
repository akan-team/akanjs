// End-to-end check of the external-view plugin on Linux (docs/testing-windows-linux.md):
//
//   bun scripts/vm/linux.ts bun scripts/vm/external-view-linux-check.ts      X11 (Xvfb), with pixels and clicks
//   bun scripts/vm/external-view-linux-check.ts                              in a desktop session (Wayland or X11)
//
// WebKitGTK has no automation port, so the app page runs the steps itself: the check builds the sample (debug, whose
// page console reaches stdout) with a probe page in place of its own, serves a board page, and reads the probe's
// lines. At a checkpoint the probe waits on the board server for the check's answer: on X11 the check reads the
// screen and clicks (xdotool, ImageMagick), elsewhere it only reads the app's log. The probe checks that a view
// 1. answers isSupported for every method, opens, runs its init script before the page's own and in no
//    frame, and answers evaluate, while a cross-origin frame in it loads, and outlives its page's window.close(),
// 2. lies at its bounds over the page, which takes the clicks around it and, once it is hidden, under it, also once
//    an open with another init script built it again,
// 3. sends load events, and loadFailed for a server that does not answer and for a server's error page,
// 4. refuses a navigation off its origins, from the app and from its own page, the error page of one that fails, and
//    a frame's mailto: link,
// 5. holds the keyboard while it is shown (the page has it while it is hidden), takes it back when its window is
//    active again, takes sendKey's keydown and keyup with their codes whether it, the page or another window has the
//    focus, while it is hidden and while an app dialog is open, the page and the dialog seeing none, leaves the keyboard
//    focus where it is when a sent Tab leaves its page, another view open (a real Tab still moves it), types sendKey's
//    text into a field,
//    sends Unidentified and NumpadEnter (on the numpad) and refuses Dead, answers UNSUPPORTED while its window is
//    hidden, captures its own content as a PNG, and mutes,
// 6. plays sound without a gesture, and a view opened with autoplay false does not,
// 7. keeps storage of its own, which clearData clears,
// 8. loads again when its web process ends, counting restarts, with its init script, and an evaluate the end cut off
//    answers INTERNAL,
// 9. answers an evaluate sent before its first commit once, run once, gives null for what JSON has no form for, and
//    answers CANCELLED for an evaluate and a sendKey its close cut off, a real Tab moving the focus again after it.

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sampleConfig from "../../examples/sample/akan-native.config.ts";
import { build } from "../../packages/cli/src/api.ts";
import { until } from "./harness.ts";

if (process.platform !== "linux") throw new Error("external-view-linux-check runs on Linux");

const root = resolve(import.meta.dir, "../..");
const sample = join(root, "examples/sample");
const scratch = mkdtempSync(join(tmpdir(), "akan-native-external-view-linux-"));
const x11 = !process.env.WAYLAND_DISPLAY && !!process.env.DISPLAY;
const PAGE = "204060";
const BOARD_COLOR = "00aa00";
const step = (text: string) => console.info(`\n== ${text}`);

const SILENCE = (() => {
  const samples = 8000;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  return wav;
})();
const BOARD = `<!doctype html><title>board</title><body style="margin:0;background:#${BOARD_COLOR}">
<script>
window.__keys = []; window.__clicks = 0;
addEventListener("keydown", (e) => window.__keys.push(e.key + ":" + e.isTrusted));
window.__sent = []; window.__located = []; window.__untrusted = 0;
for (const type of ["keydown", "keyup"]) addEventListener(type, (e) => { window.__sent.push(type + "," + e.key + "," + e.code); window.__located.push(type + "," + e.key + "," + e.code + "," + e.location); if (!e.isTrusted) window.__untrusted++; });
addEventListener("click", () => window.__clicks++);
addEventListener("message", (e) => { if (typeof e.data?.alive === "string") window.__frame = e.data; });
const frame = document.createElement("iframe");
frame.src = "http://localhost:" + location.port + "/frame";
frame.style = "position:fixed;right:0;bottom:0;width:20px;height:20px;border:0";
document.body.append(frame);
window.__seen = Number(localStorage.getItem("seen") || 0) + 1;
localStorage.setItem("seen", String(window.__seen));
window.__play = "pending";
new Audio("/silence.wav").play().then(() => { window.__play = "playing"; }, (e) => { window.__play = e.name; });
</script></body>`;
const FRAME = `<!doctype html><body><script>parent.postMessage({ alive: typeof window.__alive }, "*");</script></body>`;

/** Answers of the checkpoints the probe waits on, by name. */
const answers = new Map<string, { promise: Promise<string>; resolve: (text: string) => void }>();
const answer = (name: string) => {
  let entry = answers.get(name);
  if (!entry) {
    let resolve!: (text: string) => void;
    const promise = new Promise<string>((r) => (resolve = r));
    entry = { promise, resolve };
    answers.set(name, entry);
  }
  return entry;
};
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 120,
  fetch: async (req) => {
    const { pathname } = new URL(req.url);
    const html = { "content-type": "text/html" };
    if (pathname === "/board") return new Response(BOARD, { headers: html });
    if (pathname === "/slow") return Bun.sleep(1500).then(() => new Response(BOARD, { headers: html }));
    if (pathname === "/frame") return new Response(FRAME, { headers: html });
    if (pathname === "/silence.wav") return new Response(SILENCE, { headers: { "content-type": "audio/wav" } });
    if (pathname.startsWith("/cp/")) return new Response(await answer(pathname.slice(4)).promise);
    return new Response("<h1>upstream down</h1>", { status: 502, headers: html });
  },
});
const origin = `http://127.0.0.1:${server.port}`;
const other = `http://localhost:${server.port}`;
const closed = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
const dead = `http://127.0.0.1:${closed.port}`;
closed.stop(true);
const closedOff = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
const deadOff = `http://127.0.0.1:${closedOff.port}`;
closedOff.stop(true);

const PROBE = `
import { externalView } from ${JSON.stringify(join(root, "plugins/external-view/src/index.ts"))};
import { dialog } from ${JSON.stringify(join(root, "plugins/dialog/src/index.ts"))};
import { appWindow } from ${JSON.stringify(join(root, "plugins/window/src/index.ts"))};
const ORIGIN = ${JSON.stringify(origin)}, OTHER = ${JSON.stringify(other)}, DEAD = ${JSON.stringify(dead)}, DEAD_OFF = ${JSON.stringify(deadOff)};
const log = (m) => console.info("AKAN_EV_PROBE " + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (what, p, ms) => Promise.race([p, sleep(ms).then(() => { throw new Error("timed out waiting for " + what); })]);
async function until(what, check, timeout = 30000) {
  let last;
  for (const t = Date.now(); Date.now() - t < timeout; await sleep(250)) {
    try { const v = await check(); if (v) return v; } catch (e) { last = e; }
  }
  throw new Error("timed out waiting for " + what + (last ? " (" + (last.message ?? last) + ")" : ""));
}
const events = [];
for (const e of externalView.events) externalView.listen(e, (data) => events.push({ event: e, data }));
const waitFor = (what, match, timeout) => until(what, () => events.find(match), timeout);
let pageClicks = 0;
addEventListener("click", () => pageClicks++);
const pageKeys = [];
addEventListener("keydown", (e) => pageKeys.push(e.key + ":" + e.isTrusted));
const inView = async (script, id = "board") => (await externalView.evaluate({ id, script })).value;
const code = (p) => p.then(() => "ok", (e) => e.code ?? String(e));
const sorted = (v) => JSON.stringify(v, (_, o) => (o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).sort()) : o));
let checkpoints = 0;
async function checkpoint(name, detail = {}) {
  const key = "__cp" + ++checkpoints;
  log("at " + name + " " + JSON.stringify(detail));
  //? WebKit cancels the page's fetches when it stops a navigation refused at its response: ask again.
  await inView("(function ask() { fetch('/cp/" + name + "').then((r) => r.text()).then((t) => { window." + key + " = t; }, () => setTimeout(ask, 250)); })(); 0");
  const text = await until("the check at " + name, () => inView("window." + key + " ?? null"), 60000);
  const result = JSON.parse(text);
  if (!result.ok) throw new Error(name + ": " + result.error);
  return result;
}
const board = async () => {
  await until("the board", async () => (await inView("document.title")) === "board");
  await until("the board's script", async () => (await inView("typeof window.__seen")) === "number");
};

const holdsKeyboard = async (what, id = "board") => {
  await until(what + ": the view " + id + " holds the keyboard", async () => (await inView("document.hasFocus()", id)) === true, 10000);
  if (document.hasFocus()) throw new Error(what + ": the page has the focus too");
};

async function main() {
  const unsupported = externalView.methods.filter((m) => !externalView.isSupported(m));
  log("booted " + JSON.stringify({ unsupported }));
  if (unsupported.length) throw new Error("not supported: " + unsupported.join());
  await sleep(2000);

  log("step 1. open, the init script first and in no frame, evaluate, a cross-origin frame");
  const opened = await externalView.open({ id: "board", url: ORIGIN + "/board", allowOrigins: [ORIGIN, DEAD],
    bounds: { x: 100, y: 100, width: 200, height: 150 }, initScript: "window.__alive = typeof window.__keys",
    console: true, muted: false });
  if (opened.url !== ORIGIN + "/board") throw new Error("open answered " + JSON.stringify(opened));
  await waitFor("load finished", (e) => e.event === "load" && e.data.state === "finished");
  if (!events.some((e) => e.event === "load" && e.data.state === "started")) throw new Error("no load started");
  await board();
  if ((await inView("window.__alive")) !== "undefined") throw new Error("the init script did not run first");
  const frame = await until("the frame's message", () => inView("window.__frame ?? null"));
  if (frame.alive !== "undefined") throw new Error("the init script ran in a frame: " + JSON.stringify(frame));
  await checkpoint("active");
  await holdsKeyboard("open");
  await inView("window.close(); 0");
  await sleep(1000);
  if ((await within("the view after its page's window.close()", inView("document.title"), 5000)) !== "board") throw new Error("window.close() took the board");

  log("step 2. at its bounds over the page; the page takes the clicks around it, and under it once hidden");
  const placed = await checkpoint("placed", { innerWidth, innerHeight });
  if (!placed.skipped) {
    if (pageClicks !== 1) throw new Error("the page took " + pageClicks + " clicks, not the one beside the view");
    if ((await inView("window.__clicks")) !== 1) throw new Error("the view did not take the click on it");
  }
  await externalView.setVisible({ id: "board", visible: false });
  const hidden = await checkpoint("hidden", { innerWidth, innerHeight });
  if (!hidden.skipped && pageClicks !== 2) throw new Error("a hidden view took the click meant for the page");
  await externalView.open({ id: "board", url: ORIGIN + "/board", allowOrigins: [ORIGIN, DEAD],
    bounds: { x: 100, y: 100, width: 200, height: 150 }, initScript: "window.__alive = typeof window.__keys; window.__rebuilt = true",
    console: true, muted: false });
  await until("the board built again", async () => (await inView("window.__rebuilt ?? false")) === true);
  const rebuilt = await checkpoint("hiddenRebuilt", { innerWidth, innerHeight });
  if (!rebuilt.skipped && pageClicks !== 3) throw new Error("a hidden view built again took the click meant for the page");
  await externalView.setVisible({ id: "board", visible: true });
  await holdsKeyboard("shown again after a click on the page");
  await externalView.setBounds({ id: "board", bounds: "fill" });
  await checkpoint("filled", { innerWidth, innerHeight });
  await externalView.setBounds({ id: "board", bounds: { x: 100, y: 100, width: 200, height: 150 } });

  log("step 3. loadFailed for a server that does not answer, and for an error page");
  await externalView.navigate({ id: "board", url: DEAD + "/" });
  const failed = await waitFor("loadFailed", (e) => e.event === "loadFailed");
  log("loadFailed " + JSON.stringify(failed.data));
  if (failed.data.errorCode !== "cannotConnect") throw new Error("a refused connection is " + failed.data.errorCode);
  await externalView.navigate({ id: "board", url: ORIGIN + "/down" });
  const status = await waitFor("an http failure", (e) => e.event === "loadFailed" && e.data.url.endsWith("/down"));
  if (status.data.errorCode !== "http502") throw new Error("a 502 page is " + status.data.errorCode);
  await externalView.navigate({ id: "board", url: ORIGIN + "/board" });
  await board();
  await holdsKeyboard("navigate");

  log("step 4. off its origins: refused from the app, its page and a frame");
  const refused = await code(externalView.navigate({ id: "board", url: OTHER + "/board" }));
  if (refused !== "NOT_ALLOWED") throw new Error("navigate answered " + refused);
  await inView("location.href = " + JSON.stringify(OTHER + "/board") + "; 0");
  await checkpoint("refusedTop");
  if ((await inView("location.origin")) !== ORIGIN) throw new Error("the page left its origins");
  await inView("location.href = " + JSON.stringify(DEAD_OFF + "/") + "; 0");
  await checkpoint("refusedErrorPage");
  if ((await inView("location.origin")) !== ORIGIN) throw new Error("the page reached an error page off its origins");
  if (events.some((e) => e.event === "loadFailed" && e.data.url.startsWith(DEAD_OFF))) throw new Error("a load off its origins reported loadFailed");
  await inView("const mail = document.createElement('iframe'); mail.src = 'mailto:board@example.com'; document.body.append(mail); 0");
  await checkpoint("refusedMailto");

  log("step 5. the keyboard: the view's while shown, the page's while hidden, back when the window is active; capture, mute");
  const typed = await checkpoint("typeInView");
  if (!typed.skipped) {
    const keys = await until("the view's keys", async () => { const k = await inView("window.__keys.join()"); return String(k).includes("Return:true") || String(k).includes("Enter:true") ? k : false; });
    if (!String(keys).includes("z:true")) throw new Error("the view saw " + keys);
    if (pageKeys.length) throw new Error("the page took keys meant for the view: " + pageKeys.join());
  }
  await externalView.setVisible({ id: "board", visible: false });
  await until("the page holds the keyboard", () => document.hasFocus(), 10000);
  const typedPage = await checkpoint("typeInPage");
  if (!typedPage.skipped) {
    await until("the page's key", () => pageKeys.includes("x:true"));
    if (String(await inView("window.__keys.join()")).includes("x:")) throw new Error("a hidden view took a key");
  }
  await externalView.setVisible({ id: "board", visible: true });
  await holdsKeyboard("shown");
  const regained = await checkpoint("regain", { innerWidth, innerHeight });
  if (!regained.skipped) await holdsKeyboard("its window active again");
  const SENT = [["z", "KeyZ"], ["1", "Digit1"], ["7", "Numpad7"], [" ", "Space"], ["[", "BracketLeft"], ["ArrowLeft", "ArrowLeft"], ["Enter", "Enter"]];
  const expected = SENT.flatMap(([key, code]) => ["keydown," + key + "," + code, "keyup," + key + "," + code]).join("|");
  const sent = async (what) => {
    await inView("window.__sent = []; 0");
    const before = pageKeys.length;
    for (const [key, code] of SENT) await externalView.sendKey({ id: "board", key, code });
    let seen = "";
    for (const t = Date.now(); Date.now() - t < 5000 && seen !== expected; await sleep(250)) seen = await inView("window.__sent.join('|')");
    if (seen !== expected) throw new Error("sendKey with " + what + ": the view saw " + seen + ", not " + expected);
    await sleep(500);
    if (pageKeys.length !== before) throw new Error("sendKey with " + what + ": the page took " + pageKeys.slice(before).join());
    log("sendKey with " + what + ": " + SENT.length + " keys, untrusted events so far " + (await inView("window.__untrusted")));
  };
  await sent("the view holding the keyboard");
  const pageFocused = await checkpoint("sendPageFocused", { innerWidth, innerHeight });
  if (!pageFocused.skipped) {
    await until("the page holds the keyboard after a click on it", () => document.hasFocus(), 10000);
    await externalView.open({ id: "spare", url: ORIGIN + "/board", allowOrigins: [ORIGIN], bounds: { x: 400, y: 100, width: 40, height: 40 } });
    await until("the spare view's board", async () => (await inView("typeof window.__keys", "spare")) === "object");
    await checkpoint("sendPageFocused", { innerWidth, innerHeight });
    await until("the page holds the keyboard after a click on it, the spare view open", () => document.hasFocus(), 10000);
    await sent("the page holding the keyboard");
    const moved = [];
    const tabbed = async (what, viewHolds) => {
      await inView("window.__keys = []; 0", "spare");
      await inView("window.__sent = []; window.__keys = []; window.__last = document.createElement('input'); document.body.append(window.__last); window.__last.focus(); 0");
      const before = { page: document.hasFocus(), view: await inView("document.hasFocus()") };
      if (before.view !== viewHolds || before.page === viewHolds) throw new Error(what + ": focusing the view's input moved the keyboard focus");
      const pageBefore = pageKeys.length;
      await externalView.sendKey({ id: "board", key: "Tab", code: "Tab" });
      await until(what + ": the view's Tab", async () => (await inView("window.__sent.join('|')")) === "keydown,Tab,Tab|keyup,Tab,Tab", 5000);
      const left = await inView("document.activeElement === document.body");
      if (!left) throw new Error(what + ": the sent Tab did not leave the view's last input");
      await checkpoint(viewHolds ? "tabbedView" : "tabbedPage");
      await sleep(300);
      const took = { view: String(await inView("window.__keys.join()")).includes("x:true"), page: pageKeys.slice(pageBefore).includes("x:true"), spare: String(await inView("window.__keys.join()", "spare")).includes("x:true") };
      log("a sent Tab past the view's last input, " + what + ", another view open: a real key after it reached " + JSON.stringify(took));
      if (took.view !== viewHolds || took.page === viewHolds || took.spare) moved.push(what);
      //? The Tab took the DOM focus out of the view's page, as a browser's does: the next one brings it back in.
      else if (viewHolds) {
        await inView("window.__first = document.createElement('input'); document.body.prepend(window.__first); 0");
        await externalView.sendKey({ id: "board", key: "Tab", code: "Tab" });
        await holdsKeyboard(what + ", the next sent Tab");
        if (!(await inView("document.activeElement === window.__first"))) throw new Error(what + ": the next sent Tab did not focus the view's first input");
        await inView("window.__first.remove(); 0");
      }
      await inView("window.__last.remove(); 0");
    };
    await tabbed("the page holding the keyboard", false);
    await checkpoint("realTab", { innerWidth, innerHeight });
    await until("a real Tab in the page moves the keyboard to a view", async () => !document.hasFocus() && ((await inView("document.hasFocus()")) || (await inView("document.hasFocus()", "spare"))), 10000);
    await externalView.setVisible({ id: "board", visible: false });
    await externalView.setVisible({ id: "board", visible: true });
    await holdsKeyboard("shown again after a real Tab");
    await tabbed("the view holding the keyboard", true);
    await externalView.close({ id: "spare" });
    if (moved.length) throw new Error("a sent Tab moved the keyboard focus with " + moved.join(" and with "));
    await checkpoint("sendBlurred");
    await sent("another window focused");
    await checkpoint("sendRefocused");
    await holdsKeyboard("its window active again after sendKey");
    let answered = null;
    dialog.prompt({ title: "PIN", message: "PIN", inputText: "" }).then((r) => { answered = r; }, (e) => { answered = { error: e?.code ?? String(e) }; });
    await sleep(1500);
    await sent("an app dialog open");
    if (answered) throw new Error("sendKey's keys answered the app's dialog: " + JSON.stringify(answered));
    await checkpoint("dismiss");
    await until("the dialog closed", () => answered, 10000);
    if (!answered.cancelled || answered.value !== "") throw new Error("the dialog took sendKey's keys: " + JSON.stringify(answered));
    await holdsKeyboard("the dialog closed");
    await sent("the dialog closed");
    await appWindow.hide();
    await sleep(500);
    const withdrawn = await code(externalView.sendKey({ id: "board", key: "b", code: "KeyB" }));
    await appWindow.show();
    if (withdrawn !== "UNSUPPORTED") throw new Error("sendKey with its window hidden answered " + withdrawn);
    await checkpoint("sendRefocused");
    await holdsKeyboard("its window shown again");
  }
  await externalView.setVisible({ id: "board", visible: false });
  await until("the page holds the keyboard", () => document.hasFocus(), 10000);
  await sent("the view hidden");
  await externalView.setVisible({ id: "board", visible: true });
  await holdsKeyboard("shown after sendKey while hidden");
  await sent("the view shown again");
  await inView("window.__field = document.createElement('input'); document.body.append(window.__field); window.__field.focus(); 0");
  for (const [key, code] of [["a", "KeyA"], ["7", "Numpad7"], [" ", "Space"], ["b", "KeyB"]]) await externalView.sendKey({ id: "board", key, code });
  let field = "";
  for (const t = Date.now(); Date.now() - t < 5000 && field !== "a7 b"; await sleep(250)) field = await inView("window.__field.value");
  if (field !== "a7 b") throw new Error("sendKey typed " + JSON.stringify(field) + " into a field, focused " + (await inView("document.activeElement === window.__field")));
  const NAMED = [["Unidentified", "KeyA", "keydown,Unidentified,KeyA,0|keyup,Unidentified,KeyA,0"], ["Enter", "NumpadEnter", "keydown,Enter,NumpadEnter,3|keyup,Enter,NumpadEnter,3"]];
  const misnamed = [];
  for (const [key, at, expected] of NAMED) {
    await inView("window.__field.value = ''; window.__located = []; 0");
    const answered = await code(externalView.sendKey({ id: "board", key, code: at }));
    let seen = "";
    for (const t = Date.now(); Date.now() - t < 3000 && seen !== expected; await sleep(250)) seen = await inView("window.__located.join('|')");
    const typedText = await inView("window.__field.value");
    log("sendKey " + key + " at " + at + " answered " + answered + ", the view saw " + seen + ", the field reads " + JSON.stringify(typedText));
    if (answered !== "ok" || seen !== expected || typedText !== "") misnamed.push(key + " at " + at);
  }
  const dead = await code(externalView.sendKey({ id: "board", key: "Dead", code: "Quote" }));
  log("sendKey Dead answered " + dead);
  if (dead !== "INVALID_ARGS") misnamed.push("Dead, which answered " + dead);
  if (misnamed.length) throw new Error("sendKey did not send " + misnamed.join(", "));
  await inView("window.__field.remove(); 0");
  const shot = await externalView.capture({ id: "board" });
  log("capture " + JSON.stringify(shot));
  if (!(shot.width > 0 && shot.height > 0)) throw new Error("no capture");
  await externalView.setMuted({ id: "board", muted: true });
  await externalView.setMuted({ id: "board", muted: false });

  log("step 6. sound without a gesture, and none with autoplay false");
  const play = await until("the board's audio", async () => { const p = await inView("window.__play"); return p !== "pending" && p; });
  log("autoplay " + play);
  if (play === "NotAllowedError") throw new Error("autoplay was refused");
  await externalView.open({ id: "quiet", url: ORIGIN + "/board", allowOrigins: [ORIGIN], autoplay: false,
    bounds: { x: 0, y: 0, width: 40, height: 40 } });
  const quiet = await until("the quiet view's audio", async () => { const p = await inView("window.__play ?? 'pending'", "quiet"); return p !== "pending" && p; });
  log("autoplay false " + quiet);
  if (quiet !== "NotAllowedError") throw new Error("a view with autoplay false played: " + quiet);
  await holdsKeyboard("opened last", "quiet");
  await externalView.close({ id: "quiet" });
  await holdsKeyboard("the one opened after it closed");

  log("step 7. storage of its own, cleared by clearData");
  const seen = await inView("window.__seen");
  await externalView.reload({ id: "board" });
  await until("a reload", async () => (await inView("window.__seen")) === seen + 1);
  await externalView.clearData({ id: "board" });
  await externalView.reload({ id: "board" });
  await until("storage cleared", async () => (await inView("window.__seen")) === 1);
  await holdsKeyboard("reload");
  if (localStorage.getItem("seen") !== null) throw new Error("the view's storage reached the app's");

  log("step 8. its web process ends: loaded again, counted, with its init script");
  const busy = code(inView("for (;;) {}"));
  await sleep(500);
  log("kill");
  const gone = await waitFor("gone", (e) => e.event === "gone", 60000);
  log("gone " + JSON.stringify(gone.data));
  const cutOff = await within("an evaluate cut off by the end of its web process", busy, 10000);
  if (cutOff !== "INTERNAL") throw new Error("an evaluate cut off by the end of its web process answered " + cutOff);
  await board();
  const [listed] = await externalView.list();
  if ((listed?.restarts ?? 0) < 1) throw new Error("the restart was not counted: " + JSON.stringify(listed));
  if ((await inView("window.__alive")) !== "undefined") throw new Error("the reloaded view lost its init script");
  await holdsKeyboard("a web process restart");
  if (events.some((e) => e.event === "consoleMessage")) log("note: a consoleMessage arrived");

  log("step 9. evaluate before the first commit answers once and runs once; what JSON has no form for is null");
  await externalView.open({ id: "early", url: ORIGIN + "/slow", allowOrigins: [ORIGIN], bounds: { x: 0, y: 0, width: 40, height: 40 } });
  const early = await inView("window.__early = (window.__early ?? 0) + 1; location.href", "early");
  log("evaluate before the first commit ran in " + early);
  await until("the slow page", async () => (await inView("document.title", "early")) === "board");
  const ranAgain = await inView("window.__early ?? 0", "early");
  if (ranAgain !== (early === "about:blank" ? 0 : 1)) throw new Error("a script evaluated in " + early + " ran " + ranAgain + " times in the page");
  const RESULTS = { "undefined": null, "void 0": null, "(() => { throw new Error('x'); })()": null, "() => 1": null, "Symbol('s')": null,
    "1n": null, "Promise.resolve(1)": null, "NaN": null, "(() => { const a = { n: 1 }; a.self = a; return a; })()": null,
    "({ a: undefined, b: NaN, d: new Date(0), s: 'A\\\\ud800B' })": { b: null, d: "1970-01-01T00:00:00.000Z", s: "A\\ufffdB" }, "[1, 'x', true, null]": [1, "x", true, null] };
  for (const [script, expected] of Object.entries(RESULTS)) {
    const value = await inView(script, "early");
    log("evaluate " + script + " answered " + JSON.stringify(value));
    if (sorted(value) !== sorted(expected)) throw new Error("evaluate " + script + " answered " + JSON.stringify(value) + ", not " + JSON.stringify(expected));
  }
  const cut = code(inView("for (;;) {}", "early"));
  await sleep(500);
  const keyCut = code(externalView.sendKey({ id: "early", key: "Tab", code: "Tab" }));
  await sleep(500);
  const closing = Date.now();
  await externalView.close({ id: "early" });
  const closedMid = await within("an evaluate cut off by a close", cut, 10000);
  if (closedMid !== "CANCELLED") throw new Error("an evaluate cut off by a close answered " + closedMid);
  const keyClosed = await within("a sendKey to a looping page cut off by a close", keyCut, 10000);
  const waited = Date.now() - closing;
  log("a sendKey to a looping page cut off by a close answered " + keyClosed + (waited < 3000 ? " within 3 s" : " after " + waited + " ms"));
  if (keyClosed !== "CANCELLED" || waited >= 3000) throw new Error("a sendKey cut off by a close answered " + keyClosed + " after " + waited + " ms");
  const tabbedOut = await checkpoint("realTab", { innerWidth, innerHeight });
  if (!tabbedOut.skipped) await holdsKeyboard("a real Tab in the page after a sendKey cut off by a close");

  await externalView.close({ id: "board" });
  if ((await externalView.list()).length !== 0) throw new Error("the view is still listed");
  await until("the page holds the keyboard after the last view closed", () => document.hasFocus(), 10000);
  log("passed");
}
main().catch((e) => log("failed " + (e?.message ?? e)));
`;

/** One screen pixel as rrggbb. */
const pixel = (x: number, y: number) => {
  const out = Bun.spawnSync(
    ["import", "-window", "root", "-crop", `1x1+${Math.round(x)}+${Math.round(y)}`, "-depth", "8", "txt:-"],
    {
      timeout: 30_000,
    },
  ).stdout.toString();
  return /#([0-9A-Fa-f]{6})/.exec(out)?.[1]?.toLowerCase() ?? `none (${out.trim()})`;
};
const click = (x: number, y: number) =>
  Bun.spawnSync(["xdotool", "mousemove", String(Math.round(x)), String(Math.round(y)), "click", "1"], {
    timeout: 30_000,
  });

/** The app's processes: it and everything it started. */
function tree(pid: number): { pid: number; args: string }[] {
  const all = Bun.spawnSync(["ps", "-eo", "pid=,ppid=,args="], { timeout: 30_000 })
    .stdout.toString()
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] ?? "" }));
  const found = new Set([pid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of all)
      if (found.has(p.ppid) && !found.has(p.pid)) {
        found.add(p.pid);
        grew = true;
      }
  }
  return all.filter((p) => found.has(p.pid));
}
const webProcesses = (pid: number) =>
  tree(pid)
    .filter((p) => p.args.includes("WebKitWebProcess"))
    .map((p) => p.pid);

const lines: string[] = [];
let app: ReturnType<typeof Bun.spawn> | undefined;
try {
  step("build the sample with the external-view plugin and a probe page");
  const web = join(scratch, "web");
  writeFileSync(join(scratch, "probe.js"), PROBE);
  //? The app's CSP is style-src 'self': an inline style attribute would leave the page unpainted.
  writeFileSync(join(scratch, "page.css"), `body { margin: 0; height: 100vh; background: #${PAGE}; }`);
  writeFileSync(
    join(scratch, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><title>${sampleConfig.app.name}</title>` +
      `<link rel="stylesheet" href="./page.css"></head><body><script type="module" src="./probe.js"></script></body></html>`,
  );
  const bundled = await Bun.build({
    entrypoints: [join(scratch, "index.html")],
    outdir: web,
    target: "browser",
    compile: true,
  } as Parameters<typeof Bun.build>[0]);
  if (!bundled.success) throw new Error(bundled.logs.join("\n"));
  const [app0, ...rest] = sampleConfig.capabilities ?? [];
  if (!app0) throw new Error("the sample has no capability to extend");
  const { artifacts } = await build({
    appDir: sample,
    config: {
      ...sampleConfig,
      web: { dir: web },
      plugins: [...(sampleConfig.plugins ?? []), "external-view"],
      capabilities: [{ ...app0, permissions: [...app0.permissions, "external-view:default"] }, ...rest],
      splash: undefined,
    },
    platform: "linux",
    profile: "debug",
    skipWebBuild: true,
    envFiles: false,
    outDir: join(scratch, "build"),
  });
  const folder = artifacts.find((a) => a.kind === "folder")?.path;
  if (!folder) throw new Error(`no app folder in ${JSON.stringify(artifacts)}`);
  const exe = join(folder, readdirSync(folder).find((n) => !n.includes(".") && n !== "lib" && n !== "resources") ?? "");

  step(`run it (${x11 ? "X11: pixels and clicks" : "no X11: the log only"})`);
  const started = Bun.spawn([exe], { cwd: folder, stdout: "pipe", stderr: "pipe" });
  app = started;
  let booted: number[] = [];
  let failure: string | undefined;
  let passed = false;
  const has = (text: string) => until(`"${text}" in the app's log`, () => lines.some((l) => l.includes(text)), 10_000);

  const at = async (name: string, detail: { innerWidth?: number; innerHeight?: number }): Promise<string> => {
    if (name === "refusedTop") {
      await has(`refused a navigation to ${other}/board, which is on no origin`);
      return JSON.stringify({ ok: true });
    }
    if (name === "refusedErrorPage") {
      await has(`refused the error page of ${deadOff}/, which is on no origin`);
      return JSON.stringify({ ok: true });
    }
    if (name === "refusedMailto") {
      await has("refused a navigation to mailto:board@example.com");
      return JSON.stringify({ ok: true });
    }
    if (!x11) return JSON.stringify({ ok: true, skipped: true });
    //? The dialog's grab takes a real key whichever window has the X focus.
    if (name === "dismiss") {
      Bun.spawnSync(["xdotool", "key", "Escape"], { timeout: 30_000 });
      await Bun.sleep(700);
    }
    const id = Bun.spawnSync(["xdotool", "search", "--onlyvisible", "--pid", String(started.pid)], { timeout: 30_000 })
      .stdout.toString()
      .trim()
      .split("\n")
      .pop();
    const xdotool = (...args: string[]) => Bun.spawnSync(["xdotool", ...args], { timeout: 30_000 });
    const geometry = xdotool("getwindowgeometry", "--shell", id ?? "").stdout.toString();
    const value = (k: string) => Number(new RegExp(`${k}=(\\d+)`).exec(geometry)?.[1] ?? Number.NaN);
    //? The page fills the window below tao's menu bar, if there is one.
    const page = { x: value("X"), y: value("Y") + value("HEIGHT") - (detail.innerHeight ?? 0) };
    const inside = { x: page.x + 200, y: page.y + 175 };
    const beside = { x: page.x + 50, y: page.y + 50 };
    //? No window manager runs on Xvfb: the check gives the window the input focus itself, as a desktop would.
    if (name === "active") xdotool("windowfocus", "--sync", id ?? "");
    if (name === "typeInView" || name === "typeInPage") {
      xdotool("key", ...(name === "typeInView" ? ["z", "Return"] : ["x"]));
      await Bun.sleep(500);
    }
    if (name === "regain") {
      click(beside.x, beside.y);
      await Bun.sleep(300);
      const root = xdotool("search", "--maxdepth", "0", "").stdout.toString().trim().split("\n")[0] ?? "";
      xdotool("windowfocus", "--sync", root);
      await Bun.sleep(300);
      xdotool("windowfocus", "--sync", id ?? "");
      await Bun.sleep(500);
    }
    if (name === "sendPageFocused") click(beside.x, beside.y);
    if (name === "realTab") {
      click(beside.x, beside.y);
      await Bun.sleep(300);
      xdotool("key", "Tab");
    }
    if (name === "tabbedPage" || name === "tabbedView") xdotool("key", "x");
    if (name === "sendBlurred")
      xdotool(
        "windowfocus",
        "--sync",
        xdotool("search", "--maxdepth", "0", "").stdout.toString().trim().split("\n")[0] ?? "",
      );
    if (name === "sendRefocused" || name === "dismiss") xdotool("windowfocus", "--sync", id ?? "");
    if (name.startsWith("send") || ["dismiss", "realTab", "tabbedPage", "tabbedView"].includes(name))
      await Bun.sleep(500);
    if (
      [
        "active",
        "typeInView",
        "typeInPage",
        "regain",
        "sendPageFocused",
        "realTab",
        "tabbedPage",
        "tabbedView",
        "sendBlurred",
        "sendRefocused",
        "dismiss",
      ].includes(name)
    )
      return JSON.stringify({ ok: true });
    await Bun.sleep(700);
    const seen = { inside: pixel(inside.x, inside.y), beside: pixel(beside.x, beside.y) };
    console.info(`  ${name}: window ${geometry.replace(/\n/g, " ").trim()}, pixels ${JSON.stringify(seen)}`);
    const expected =
      name === "placed"
        ? { inside: BOARD_COLOR, beside: PAGE }
        : name === "hidden" || name === "hiddenRebuilt"
          ? { inside: PAGE, beside: PAGE }
          : { inside: BOARD_COLOR, beside: BOARD_COLOR };
    if (seen.inside !== expected.inside || seen.beside !== expected.beside)
      return JSON.stringify({ ok: false, error: `pixels ${JSON.stringify(seen)}, not ${JSON.stringify(expected)}` });
    if (name === "placed") {
      click(beside.x, beside.y);
      await Bun.sleep(300);
      click(inside.x, inside.y);
    }
    if (name === "hidden" || name === "hiddenRebuilt") click(inside.x, inside.y);
    await Bun.sleep(500);
    return JSON.stringify({ ok: true });
  };

  const onLine = (line: string) => {
    lines.push(line);
    const probe = /AKAN_EV_PROBE (.*)$/.exec(line)?.[1];
    if (!probe) return;
    console.info(`  ${probe}`);
    if (probe.startsWith("booted")) booted = webProcesses(started.pid);
    else if (probe === "kill") {
      const view = webProcesses(started.pid).filter((pid) => !booted.includes(pid));
      console.info(`  killing the view's web processes ${view.join(", ") || "(none found)"}`);
      for (const pid of view) process.kill(pid, "SIGKILL");
    } else if (probe.startsWith("at ")) {
      const [, name = "", detail = "{}"] = /^at (\S+) (.*)$/.exec(probe) ?? [];
      void at(name, JSON.parse(detail))
        .catch((error: Error) => JSON.stringify({ ok: false, error: error.message }))
        .then((text) => answer(name).resolve(text));
    } else if (probe === "passed") passed = true;
    else if (probe.startsWith("failed")) failure = probe;
  };
  for (const stream of [started.stdout, started.stderr])
    void (async () => {
      const decoder = new TextDecoder();
      let rest = "";
      for await (const chunk of stream) {
        rest += decoder.decode(chunk, { stream: true });
        for (let nl = rest.indexOf("\n"); nl >= 0; nl = rest.indexOf("\n")) {
          onLine(rest.slice(0, nl));
          rest = rest.slice(nl + 1);
        }
      }
    })();
  await until("the probe's end", () => passed || failure || started.exitCode !== null, 300_000);
  if (!passed) throw new Error(failure ?? `the app exited (${started.exitCode})`);
  console.info("\nexternal-view-linux-check passed");
} catch (error) {
  console.error(`the app's last lines:\n${lines.slice(-40).join("\n")}`);
  throw error;
} finally {
  server.stop(true);
  if (app && app.exitCode === null) {
    app.kill();
    await app.exited;
  }
  rmSync(scratch, { recursive: true, force: true });
}
