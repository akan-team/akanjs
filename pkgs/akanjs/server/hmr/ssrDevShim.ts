import { type CsrDevManifest, SSR_DEV_CHUNK, SSR_DEV_ID_PREFIX, SSR_DEV_ROUTE_PREFIX } from "./csrDevManifest";
import { CSR_DEV_RUNTIME_SCRIPT } from "./csrDevRuntime";

//* The browser half of the SSR dev registry, appended to the page's classic bootstrap after the shared webpack shim.
//* It must run before RSDW's module init, which wraps `__webpack_require__.u` on whatever function is installed then.
//* A row's chunk `ssr-dev` boots the registry once (runtime, the import map's vendors, the vendor file, app.js); a row's
//* id `ssr-dev:<module>` is answered with that module's current exports on every call, so a payload fetched after a
//* patch gets the patched module. RSDW takes a pending thenable from an async row's require as "not loaded yet", which
//* is how a payload naming a module whose patch is still on its way waits for it.
export class SsrDevShim {
  static readonly runtimeUrl = `${SSR_DEV_ROUTE_PREFIX}runtime.js?v=${Bun.hash(CSR_DEV_RUNTIME_SCRIPT).toString(36)}`;
  static readonly #body = `var baseLoad = self.__webpack_chunk_load__;
  var baseRequire = self.__webpack_require__;
  var booting = null;
  var built = null;
  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }
  function script(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = src;
      el.async = false;
      el.onload = function () { resolve(); };
      el.onerror = function () { reject(new Error("[akan-ssr-dev] " + src + " failed to load")); };
      document.head.appendChild(el);
    });
  }
  // Asked until a registry exists: a boot build the user's code broke leaves none until the save that fixes it, and
  // giving up would fail this document for good (RSDW keeps a rejected chunk and never loads it again). In short holds
  // with a gap, so waiting tabs do not keep every socket the browser opens to this host.
  function state() {
    return fetch(c.prefix + "boot.json?wait=10000", { cache: "no-store" }).then(function (res) {
      return res.ok ? res.json() : wait(1000).then(state);
    }, function () {
      return wait(1000).then(state);
    });
  }
  // app.js starts the bootstrap, which requires the import map's vendors. A whole build between the render (or
  // boot.json) and these loads pruned the files it named: ask again what to load.
  function load(vendors, attempt) {
    self.__AKAN_SSR_EPOCH__ = built.epoch;
    return Promise.all([vendors, script(c.prefix + built.vendorFile)]).then(function () {
      return script(c.prefix + "app.js?g=" + built.generation);
    }).catch(function (error) {
      if (attempt >= 3) throw error;
      return wait(500).then(state).then(function (next) {
        built = next;
        return load(vendors, attempt + 1);
      });
    });
  }
  // Only once the manifest names that vendor file too: a write cut short between app.js and the manifest would otherwise
  // reload every new document until the next build. Never settled when it reloads, so nothing requires from this one.
  function reloadOnto(vendorFile, attempt) {
    return state().then(function (current) {
      if (current.vendorFile === vendorFile) {
        self.location.reload();
        return new Promise(function () {});
      }
      if (attempt < 4) return wait(500).then(function () { return reloadOnto(vendorFile, attempt + 1); });
    });
  }
  // A patch broadcast before this tab's WebSocket connected reached only hello's generation.
  function catchUp() {
    var hello = self.__AKAN_SSR_HELLO_GENERATION__;
    if (typeof hello === "number") self.__akan.catchUp(hello, c.prefix);
  }
  // A backend restarting between the render and this load answers nothing for a moment; the registry answering again
  // is when to try once more.
  function runtime(attempt) {
    return script(c.runtime).catch(function (error) {
      if (attempt >= 3) throw error;
      return wait(500).then(state).then(function () { return runtime(attempt + 1); });
    });
  }
  function boot() {
    if (!booting)
      booting = self.__AKAN_SSR_BOOT__ = runtime(0).then(function () {
        var early = self.__AKAN_SSR_EARLY_UPDATES__ || [];
        self.__AKAN_SSR_EARLY_UPDATES__ = null;
        for (var i = 0; i < early.length; i++) self.__akan.hot(early[i]);
        return c.vendorFile ? c : state();
      }).then(function (current) {
        built = current;
        return load(Promise.all(c.vendors.map(function (specifier) {
          return import(specifier).then(function (ns) { self.__akan.provide("vendor:" + specifier, ns); });
        })), 0);
      }).then(function () {
        // app.js names the build it came from, which a whole build between the render and this load may have replaced.
        var started = self.__akan.inspect();
        if (typeof started.epoch === "number") self.__AKAN_SSR_EPOCH__ = started.epoch;
        // Its vendor file too: one written after the render's names vendors the file this page loaded lacks. A start
        // that succeeded (the new package is a leaf's import) takes that file as well, which adds only the factories
        // this one lacked, since both are named by their content.
        var vendorFile = started.vendorFile;
        if (!vendorFile || vendorFile === built.vendorFile) return catchUp();
        if (started.failed) return reloadOnto(vendorFile, 0);
        return script(c.prefix + vendorFile).then(catchUp, function () { return reloadOnto(vendorFile, 0); });
      }).catch(function (error) {
        // What clientScript compares a newer registry against: this document reloads onto one, and only onto one.
        var failed = built || c;
        self.__AKAN_SSR_BOOT_FAILED__ = { generation: failed.generation || 0, epoch: failed.epoch };
        throw error;
      });
    return booting;
  }
  self.__webpack_chunk_load__ = function (id) { return id === c.chunk ? boot() : baseLoad(id); };
  var require = function (id) {
    if (typeof id !== "string" || id.indexOf(c.idPrefix) !== 0) return baseRequire(id);
    var moduleId = id.slice(c.idPrefix.length);
    var registry = self.__akan;
    if (registry.has(moduleId)) return registry.require(moduleId);
    return registry.whenDefined(moduleId).then(function () { return registry.require(moduleId); });
  };
  require.u = baseRequire.u;
  self.__webpack_require__ = require;`;

  /** `vendors` are the import map's specifiers: the registry requires them as `vendor:<specifier>`, never compiles them. */
  static script(manifest: CsrDevManifest | null, vendors: string[]): string {
    const config = {
      chunk: SSR_DEV_CHUNK,
      idPrefix: SSR_DEV_ID_PREFIX,
      prefix: SSR_DEV_ROUTE_PREFIX,
      runtime: SsrDevShim.runtimeUrl,
      generation: manifest?.generation ?? 0,
      vendorFile: manifest?.vendorFile ?? null,
      epoch: manifest?.epoch ?? null,
      vendors,
    };
    return `(function (c) {\n  ${SsrDevShim.#body}\n})(${JSON.stringify(config)});`;
  }
}
