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
  function state() {
    if (c.vendorFile) return Promise.resolve(c);
    return fetch(c.prefix + "boot.json", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("[akan-ssr-dev] the registry is not built yet (" + res.status + ")");
      return res.json();
    });
  }
  function boot() {
    if (!booting)
      booting = script(c.runtime).then(function () {
        var early = self.__AKAN_SSR_EARLY_UPDATES__ || [];
        self.__AKAN_SSR_EARLY_UPDATES__ = null;
        for (var i = 0; i < early.length; i++) self.__akan.hot(early[i]);
      }).then(state).then(function (built) {
        self.__AKAN_SSR_EPOCH__ = built.epoch;
        return Promise.all([
          Promise.all(c.vendors.map(function (specifier) {
            return import(specifier).then(function (ns) { self.__akan.provide("vendor:" + specifier, ns); });
          })),
          script(c.prefix + built.vendorFile)
        ]).then(function () { return script(c.prefix + "app.js?g=" + built.generation); }).then(function () {
          // A patch broadcast before this tab's WebSocket connected reached only hello's generation.
          var hello = self.__AKAN_SSR_HELLO_GENERATION__;
          var state = self.__akan.inspect();
          if (typeof hello === "number" && state.started && !state.failed && state.target < hello) location.reload();
        });
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
