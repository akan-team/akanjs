export const INIT_SCRIPT_PATH = "__akan_native/init.js";

/**
 * Inserts `<script src="/__akan_native/init.js">` as the first element of <head> (IN-3).
 * A classic, non-async script runs before the inlined module bundle, so the
 * boot data is ready synchronously.
 */
export function injectInitScript(html: string, base = "/"): string {
  const src = `${base.endsWith("/") ? base : `${base}/`}${INIT_SCRIPT_PATH}`;
  // Only a real tag counts: the inlined bundle may mention the path in plain text.
  if (/<script\b[^>]*\bsrc\s*=\s*["']?[^"'\s>]*__akan_native\/init\.js/i.test(html)) return html;
  const tag = `<script src="${src}"></script>`;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return insertAt(html, head.index + head[0].length, tag);
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root) return insertAt(html, root.index + root[0].length, `<head>${tag}</head>`);
  const doctype = /<!doctype[^>]*>/i.exec(html);
  if (doctype) return insertAt(html, doctype.index + doctype[0].length, tag);
  return tag + html;
}

/**
 * Dev builds (architecture review stage 5, an always-on error path; RN JsErrorHandler): errors of the
 * page before @akanjs/native/core runs (a bundle that fails to parse or throws at the top) would reach no log.
 * This collects them in `__AKAN_NATIVE__.early`; core sends them to the host log when it loads
 * (runtime.ts flushEarlyErrors). If core never loads, the page reports them itself after 5 s: to the
 * desktop host over /__akan_native/ipc, to iOS over the message handler, and on Android to logcat (the
 * WebView's console already goes there). The first error keeps its stack; later ones their message.
 */
export const EARLY_ERRORS_SCRIPT =
  `(function(){var g=window.__AKAN_NATIVE__;if(!g||g.early)return;var list=g.early=[];` +
  // WebKit's stack has no message line (V8's starts with it): put "Name: message" first once.
  `function full(v){if(!v||typeof v!=="object")return String(v);var h=(v.name||"Error")+": "+v.message;return v.stack?(v.stack.indexOf(h)===0?v.stack:h+"\\n"+v.stack):h}` +
  `function add(kind,v){if(!g.early||list.length>=50)return;list.push(kind+": "+(list.length===0?full(v):v&&v.message||String(v)))}` +
  `addEventListener("error",function(e){add("error",e.error||e.message)});` +
  `addEventListener("unhandledrejection",function(e){add("unhandled rejection",e.reason)});` +
  `setTimeout(function(){if(!g.early||!list.length)return;var m="[before runtime] the page failed before @akanjs/native/core started:\\n"+list.join("\\n");` +
  `var r=JSON.stringify({v:1,id:1,plugin:"$console",method:"error",args:{message:m}});g.early=null;try{` +
  `if(window.webkit&&webkit.messageHandlers&&webkit.messageHandlers.akanNative)webkit.messageHandlers.akanNative.postMessage(r);` +
  `else if(g.platform!=="android")fetch("/__akan_native/ipc",{method:"POST",headers:{"content-type":"application/json","x-akan-native-ipc":"1"},referrerPolicy:"same-origin",body:r});` +
  `else console.error(m)}catch(_){}},5000)})()`;

/** Puts the early error collector right after the init.js tag (dev builds). */
export function injectEarlyErrors(html: string): string {
  const init = /<script\b[^>]*\bsrc\s*=\s*["']?[^"'\s>]*__akan_native\/init\.js[^>]*>\s*<\/script>/i.exec(html);
  if (!init) return html;
  return insertAt(html, init.index + init[0].length, `<script>${EARLY_ERRORS_SCRIPT}</script>`);
}

function insertAt(text: string, index: number, insert: string): string {
  return text.slice(0, index) + insert + text.slice(index);
}

/** External `<script src>` (other than init.js) break the single-file rule (IN-2). */
export function findExternalScripts(html: string): string[] {
  const found: string[] = [];
  const re = /<script\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const src = m[1] ?? m[2] ?? m[3] ?? "";
    if (!src.includes(INIT_SCRIPT_PATH)) found.push(src);
  }
  return found;
}
