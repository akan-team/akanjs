// Browser-side HMR client. Delivered as a classic inline <script> (appended
// to the RSC bootstrap content) so it starts listening before any module
// script runs. Keep it small and free of dependencies — we cannot rely on any
// framework code being available when this executes.
//
// Protocol (see wsHub.ts `HmrMessage` for the TypeScript shape):
//   { type: "hello", buildId, cssAssets }  → initial handshake on connect
//   { type: "reload", buildId }          → full page refresh
//   { type: "rsc-refresh", buildId }     → RSC tree refresh without document reload
//   { type: "client-refresh", buildId }  → React Fast Refresh, with RSC fallback
//   { type: "css-update", cssAssets }    → atomic current-subroute <link> swap, no reload
//   { type: "sync-navigation", href }    → dev-only cross-client navigation sync
//   { type: "error", message }           → forwarded build error, console only
//   { type: "build-status", status }     → build error/recovery overlay
//   { type: "ok", generation }           → legacy build recovery
//   { type: "error", message }           → legacy forwarded build error
//
// The server-rendered HTML tags the "active" stylesheet with
// data-akan-css="active" (see rscWorker.tsx) so swapCss can remove the stale
// one after the new stylesheet has finished loading without a flash of
// unstyled content.
const SYNC_NAVIGATION_ENABLED =
  process.env.AKAN_PUBLIC_SYNC_NAVIGATION === "true" ||
  process.env.AKAN_PUBLIC_SYNC_NAVIGATION === "1" ||
  process.env.SYNC_DOMAIN === "true" ||
  process.env.SYNC_DOMAIN === "1";

export const HMR_CLIENT_SCRIPT = `(function(){
  if (self.__AKAN_HMR_INSTALLED__) return;
  self.__AKAN_HMR_INSTALLED__ = true;
  var syncNavigationEnabled = ${JSON.stringify(SYNC_NAVIGATION_ENABLED)};
  var syncNavigationClientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var proto = location.protocol === "https:" ? "wss:" : "ws:";
  var url = proto + "//" + location.host + "/_akan/hmr";
  var attempts = 0;
  var socket = null;
  var lastBuildId = null;
  var refreshRuntimePromise = null;
  var refreshRuntime = null;
  var pendingRefreshRegistrations = [];
  var refreshQueue = Promise.resolve();
  var overlayEl = null;
  var overlayLabelEl = null;
  var overlayDetailEl = null;
  var overlayStyleEl = null;
  var overlayTimer = null;
  var overlayHideTimer = null;
  var overlayNextToken = 1;
  var overlayJobs = {};
  var buildErrorStates = {};
  self.__AKAN_HMR_PHASE__ = null;
  self.__AKAN_DEV_SYNC_NAVIGATION__ = function(href, kind){
    if (self.__AKAN_DEV_SYNC_NAVIGATION_APPLYING__ || !syncNavigationEnabled || !socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify({
        type: "sync-navigation",
        clientId: syncNavigationClientId,
        href: new URL(href, location.origin).pathname + new URL(href, location.origin).search + new URL(href, location.origin).hash,
        kind: kind || "push"
      }));
    } catch(e) {
      console.warn("[akan-hmr] sync navigation send failed", e);
    }
  };

  // Bun's React Fast Refresh transform can emit top-level calls to these globals
  // even when we fall back to full reload instead of applying React Refresh.
  self.$RefreshReg$ = self.$RefreshReg$ || function(type, id){
    if (refreshRuntime) refreshRuntime.register(type, id);
    else pendingRefreshRegistrations.push([type, id]);
  };
  self.$RefreshSig$ = self.$RefreshSig$ || function(){ return function(type){ return type; }; };
  // Start installing React Refresh before the application module graph loads.
  // Injecting the runtime only on the first update is too late for React's renderer hook.
  ensureRefreshRuntime().catch(function(err){
    console.warn("[akan-hmr] React Refresh runtime preload failed", err);
  });

  function connect(){
    try { socket = new WebSocket(url); }
    catch(e){ console.error("[akan-hmr] ws init failed", e); schedule(); return; }
    socket.addEventListener("open", function(){ attempts = 0; });
    socket.addEventListener("message", function(ev){
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e){ return; }
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "hello") {
        if (lastBuildId !== null && msg.buildId !== lastBuildId) {
          location.reload();
          return;
        }
        lastBuildId = msg.buildId;
        return;
      }
      if (msg.type === "reload") {
        beginHmrOverlay("Reloading...", true);
        try { self.__AKAN_RSC_CLEAR_CACHE__ && self.__AKAN_RSC_CLEAR_CACHE__(); } catch(e){}
        setTimeout(function(){ location.reload(); }, 30);
        return;
      }
      if (msg.type === "rsc-refresh") {
        refreshRsc(msg);
        return;
      }
      if (msg.type === "client-refresh") {
        refreshClient(msg);
        return;
      }
      if (msg.type === "css-update") {
        var cssUrl = selectCssUrl(msg.cssAssets);
        if (cssUrl) swapCss(cssUrl);
        else {
          beginHmrOverlay("Reloading...", true);
          location.reload();
        }
        return;
      }
      if (msg.type === "sync-navigation") {
        if (!syncNavigationEnabled || msg.clientId === syncNavigationClientId || !msg.href) return;
        window.dispatchEvent(new CustomEvent("akan:sync-navigation", {
          detail: { href: msg.href, kind: msg.kind || "push" }
        }));
        return;
      }
      if (msg.type === "build-status") { handleBuildStatus(msg); return; }
      if (msg.type === "ok") {
        clearBuildErrorOverlay({
          phase: "build",
          generation: typeof msg.generation === "number" ? msg.generation : Number.MAX_SAFE_INTEGER,
          files: 0
        });
        return;
      }
      if (msg.type === "error") {
        console.error("[akan-hmr]", msg.message);
        showBuildErrorOverlay({ phase: "build", generation: 0, message: msg.message, files: 0 });
        return;
      }
    });
    socket.addEventListener("close", function(){ socket = null; schedule(); });
    socket.addEventListener("error", function(){ try { socket && socket.close(); } catch(e){} });
  }

  function schedule(){
    attempts = Math.min(attempts + 1, 6);
    var delay = Math.min(30000, 250 * Math.pow(2, attempts - 1));
    setTimeout(connect, delay);
  }

  function ensureOverlay(){
    if (overlayEl && overlayLabelEl) return overlayEl;
    if (!overlayStyleEl) {
      overlayStyleEl = document.createElement("style");
      overlayStyleEl.textContent =
        "@keyframes akan-hmr-spin{to{transform:rotate(360deg)}}" +
        ".__akan_hmr_overlay{position:fixed;left:16px;bottom:16px;z-index:2147483647;display:flex;align-items:flex-start;gap:9px;max-width:min(420px,calc(100vw - 32px));padding:10px 12px;border-radius:16px;background:rgba(17,24,39,.94);color:#fff;font:500 13px/1.25 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.28);pointer-events:none;opacity:0;transform:translateY(6px);transition:opacity .15s ease,transform .15s ease;backdrop-filter:blur(8px)}" +
        ".__akan_hmr_overlay[data-show=true]{opacity:1;transform:translateY(0)}" +
        ".__akan_hmr_overlay[data-status=error]{background:rgba(127,29,29,.96);border:1px solid rgba(252,165,165,.55)}" +
        ".__akan_hmr_overlay[data-status=ok]{background:rgba(6,95,70,.94);border:1px solid rgba(110,231,183,.45)}" +
        ".__akan_hmr_spinner{width:14px;height:14px;margin-top:1px;border:2px solid rgba(255,255,255,.32);border-top-color:#fff;border-radius:999px;animation:akan-hmr-spin .75s linear infinite;flex:none}" +
        ".__akan_hmr_overlay[data-status=error] .__akan_hmr_spinner,.__akan_hmr_overlay[data-status=ok] .__akan_hmr_spinner{animation:none;border-color:rgba(255,255,255,.72);border-top-color:rgba(255,255,255,.72)}" +
        ".__akan_hmr_body{display:flex;flex-direction:column;gap:3px;min-width:0}" +
        ".__akan_hmr_detail{font:400 12px/1.35 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:rgba(255,255,255,.82);white-space:pre-wrap;overflow-wrap:anywhere}" +
        "@media (prefers-reduced-motion:reduce){.__akan_hmr_overlay{transition:none}.__akan_hmr_spinner{animation:none}}";
      document.head.appendChild(overlayStyleEl);
    }
    overlayEl = document.createElement("div");
    overlayEl.className = "__akan_hmr_overlay";
    overlayEl.setAttribute("data-status", "updating");
    overlayEl.setAttribute("role", "status");
    overlayEl.setAttribute("aria-live", "polite");
    overlayEl.innerHTML = '<span class="__akan_hmr_spinner" aria-hidden="true"></span><span class="__akan_hmr_body"><span data-akan-hmr-label>Updating...</span><span class="__akan_hmr_detail" data-akan-hmr-detail></span></span>';
    overlayLabelEl = overlayEl.querySelector("[data-akan-hmr-label]");
    overlayDetailEl = overlayEl.querySelector("[data-akan-hmr-detail]");
    (document.body || document.documentElement).appendChild(overlayEl);
    return overlayEl;
  }

  function activeOverlayTokens(){
    return Object.keys(overlayJobs);
  }

  function latestOverlayLabel(){
    var keys = activeOverlayTokens();
    if (keys.length === 0) return "Updating...";
    return overlayJobs[keys[keys.length - 1]] || "Updating...";
  }

  function showOverlayNow(){
    overlayTimer = null;
    if (activeOverlayTokens().length === 0) return;
    if (hasBuildErrors()) {
      renderBuildErrorOverlay();
      return;
    }
    var el = ensureOverlay();
    el.setAttribute("data-status", "updating");
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }
    if (overlayLabelEl) overlayLabelEl.textContent = latestOverlayLabel();
    if (overlayDetailEl) overlayDetailEl.textContent = "";
    requestAnimationFrame(function(){ el.setAttribute("data-show", "true"); });
  }

  function beginHmrOverlay(label, immediate){
    var token = overlayNextToken++;
    overlayJobs[token] = label || "Updating...";
    if (!hasBuildErrors() && overlayLabelEl) overlayLabelEl.textContent = latestOverlayLabel();
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }
    if (immediate) {
      if (overlayTimer) clearTimeout(overlayTimer);
      showOverlayNow();
    } else if (!overlayTimer && (!overlayEl || overlayEl.getAttribute("data-show") !== "true")) {
      overlayTimer = setTimeout(showOverlayNow, 120);
    }
    return token;
  }

  function setHmrOverlayLabel(token, label){
    if (!overlayJobs[token]) return;
    overlayJobs[token] = label || "Updating...";
    if (!hasBuildErrors() && overlayLabelEl) overlayLabelEl.textContent = latestOverlayLabel();
  }

  function endHmrOverlay(token){
    delete overlayJobs[token];
    if (hasBuildErrors()) {
      renderBuildErrorOverlay();
      return;
    }
    if (activeOverlayTokens().length > 0) {
      if (overlayLabelEl) overlayLabelEl.textContent = latestOverlayLabel();
      return;
    }
    if (overlayTimer) {
      clearTimeout(overlayTimer);
      overlayTimer = null;
    }
    if (!overlayEl) return;
    overlayEl.setAttribute("data-show", "false");
    if (overlayHideTimer) clearTimeout(overlayHideTimer);
    overlayHideTimer = setTimeout(function(){
      if (overlayEl && activeOverlayTokens().length === 0 && overlayEl.parentNode) {
        overlayEl.parentNode.removeChild(overlayEl);
        overlayEl = null;
        overlayLabelEl = null;
        overlayDetailEl = null;
      }
    }, 180);
  }

  function handleBuildStatus(msg){
    if (msg.status === "error") {
      showBuildErrorOverlay(msg);
      return;
    }
    if (msg.status === "ok") clearBuildErrorOverlay(msg);
  }

  function showBuildErrorOverlay(msg){
    var phase = msg.phase || "build";
    var generation = typeof msg.generation === "number" ? msg.generation : 0;
    var previous = buildErrorStates[phase];
    if (previous && generation < previous.generation) return;
    buildErrorStates[phase] = {
      phase: msg.phase || "build",
      generation: generation,
      message: msg.message || "Build failed",
      files: typeof msg.files === "number" ? msg.files : 0
    };
    console.error("[akan-hmr] build failed", buildErrorStates[phase]);
    renderBuildErrorOverlay();
  }

  function renderBuildErrorOverlay(){
    if (!hasBuildErrors()) return;
    if (overlayTimer) {
      clearTimeout(overlayTimer);
      overlayTimer = null;
    }
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }
    var el = ensureOverlay();
    var phases = buildErrorPhases();
    var latest = latestBuildErrorState();
    el.setAttribute("data-status", "error");
    if (overlayLabelEl) overlayLabelEl.textContent = "Build failed: " + phases.join(", ");
    if (overlayDetailEl) overlayDetailEl.textContent = formatBuildStatusDetail(latest, phases.length);
    requestAnimationFrame(function(){ el.setAttribute("data-show", "true"); });
  }

  function clearBuildErrorOverlay(msg){
    var phase = msg.phase || "build";
    var current = buildErrorStates[phase];
    if (!current) return;
    var generation = typeof msg.generation === "number" ? msg.generation : 0;
    var recovered = phase === "backend" ? generation >= current.generation : generation > current.generation;
    if (!recovered) return;
    delete buildErrorStates[phase];
    if (hasBuildErrors()) {
      renderBuildErrorOverlay();
      return;
    }
    if (overlayHideTimer) clearTimeout(overlayHideTimer);
    var el = ensureOverlay();
    el.setAttribute("data-status", "ok");
    if (overlayLabelEl) overlayLabelEl.textContent = "Build recovered";
    if (overlayDetailEl) overlayDetailEl.textContent = formatBuildStatusDetail(msg);
    requestAnimationFrame(function(){ el.setAttribute("data-show", "true"); });
    overlayHideTimer = setTimeout(function(){
      if (activeOverlayTokens().length > 0) {
        showOverlayNow();
        return;
      }
      if (!overlayEl) return;
      overlayEl.setAttribute("data-show", "false");
      overlayHideTimer = setTimeout(function(){
        if (overlayEl && activeOverlayTokens().length === 0 && !hasBuildErrors() && overlayEl.parentNode) {
          overlayEl.parentNode.removeChild(overlayEl);
          overlayEl = null;
          overlayLabelEl = null;
          overlayDetailEl = null;
        }
      }, 180);
    }, 900);
  }

  function hasBuildErrors(){
    return Object.keys(buildErrorStates).length > 0;
  }

  function buildErrorPhases(){
    return Object.keys(buildErrorStates).sort();
  }

  function latestBuildErrorState(){
    var phases = buildErrorPhases();
    var latest = buildErrorStates[phases[0]];
    for (var i = 1; i < phases.length; i++) {
      var next = buildErrorStates[phases[i]];
      if (!latest || next.generation >= latest.generation) latest = next;
    }
    return latest;
  }

  function formatBuildStatusDetail(msg, failedPhaseCount){
    var parts = [];
    if (typeof msg.generation === "number" && msg.generation > 0) parts.push("generation " + msg.generation);
    if (typeof msg.files === "number") parts.push(msg.files + " file" + (msg.files === 1 ? "" : "s"));
    if (failedPhaseCount > 1) parts.push(failedPhaseCount + " failed phases");
    var prefix = parts.length > 0 ? parts.join(" · ") : "";
    if (!msg.message) return prefix;
    return prefix ? prefix + "\\n" + msg.message : msg.message;
  }

  function refreshRsc(msg){
    var started = performance.now();
    var overlayToken = beginHmrOverlay("Refreshing page...");
    try { self.__AKAN_RSC_CLEAR_CACHE__ && self.__AKAN_RSC_CLEAR_CACHE__(); } catch(e){}
    if (!self.__AKAN_RSC_REFRESH__) {
      console.warn("[akan-hmr] RSC refresh API unavailable, falling back to full reload");
      setHmrOverlayLabel(overlayToken, "Reloading...");
      setTimeout(function(){ location.reload(); }, 30);
      return;
    }
    Promise.resolve(self.__AKAN_RSC_REFRESH__({ buildId: msg.buildId })).then(function(){
      lastBuildId = msg.buildId;
      endHmrOverlay(overlayToken);
      console.debug && console.debug("[akan-hmr] RSC refreshed", {
        buildId: msg.buildId,
        generation: msg.generation,
        routeIds: msg.routeIds,
        changedFiles: msg.changedFiles && msg.changedFiles.length,
        durationMs: Math.round(performance.now() - started)
      });
    }, function(err){
      console.error("[akan-hmr] RSC refresh failed, falling back to full reload", err);
      setHmrOverlayLabel(overlayToken, "Update failed, reloading...");
      setTimeout(function(){ location.reload(); }, 250);
    });
  }

  function ensureRefreshRuntime(){
    if (refreshRuntimePromise) return refreshRuntimePromise;
    refreshRuntimePromise = import("react-refresh/runtime").then(function(mod){
      var runtime = mod.default || mod;
      if (!self.__AKAN_REACT_REFRESH_READY__) {
        refreshRuntime = runtime;
        runtime.injectIntoGlobalHook(self);
        self.$RefreshReg$ = function(type, id){ runtime.register(type, id); };
        self.$RefreshSig$ = runtime.createSignatureFunctionForTransform;
        for (var i = 0; i < pendingRefreshRegistrations.length; i++) {
          self.$RefreshReg$(pendingRefreshRegistrations[i][0], pendingRefreshRegistrations[i][1]);
        }
        pendingRefreshRegistrations = [];
        self.__AKAN_REACT_REFRESH_READY__ = true;
        self.__AKAN_REACT_REFRESH_RUNTIME__ = runtime;
      }
      return runtime;
    });
    return refreshRuntimePromise;
  }

  function refreshClient(msg){
    refreshQueue = refreshQueue.then(function(){ return doRefreshClient(msg); }, function(){ return doRefreshClient(msg); });
  }

  function setHmrPhase(phase){
    self.__AKAN_HMR_PHASE__ = phase;
  }

  function doRefreshClient(msg){
    var started = performance.now();
    var metadataAt = started;
    var importAt = started;
    var refreshAt = started;
    var overlayToken = beginHmrOverlay("Updating...");
    var fallbackToRsc = false;
    return ensureRefreshRuntime().then(function(runtime){
      setHmrOverlayLabel(overlayToken, "Fetching update...");
      var endpoint = new URL("/_akan/hmr/client-refresh", location.origin);
      endpoint.searchParams.set("url", location.href);
      if (msg.buildId != null) endpoint.searchParams.set("buildId", String(msg.buildId));
      return fetch(endpoint, { credentials: "same-origin", cache: "no-store" })
        .then(function(res){
          if (!res.ok) throw new Error("client-refresh metadata failed " + res.status + " " + res.statusText);
          return res.json();
        })
        .then(function(info){
          metadataAt = performance.now();
          var chunks = Array.isArray(info.chunks) ? info.chunks : [];
          if (chunks.length === 0) throw new Error("no client chunks returned");
          setHmrPhase("refresh-import");
          setHmrOverlayLabel(overlayToken, "Importing update...");
          return Promise.all(chunks.map(function(chunk){ return import(chunk); })).then(function(){
            importAt = performance.now();
            setHmrPhase("react-refresh");
            setHmrOverlayLabel(overlayToken, "Applying update...");
            try {
              runtime.performReactRefresh();
            } finally {
              setHmrPhase(null);
            }
            refreshAt = performance.now();
            lastBuildId = msg.buildId;
            console.debug && console.debug("[akan-hmr] React Fast Refresh applied", {
              buildId: msg.buildId,
              generation: msg.generation,
              chunks: chunks.length,
              routeIds: info.routeIds || msg.routeIds,
              changedFiles: msg.changedFiles && msg.changedFiles.length,
              metadataMs: Math.round(metadataAt - started),
              importMs: Math.round(importAt - metadataAt),
              refreshMs: Math.round(refreshAt - importAt),
              durationMs: Math.round(refreshAt - started)
            });
            endHmrOverlay(overlayToken);
          }, function(err){
            setHmrPhase(null);
            throw err;
          });
        });
    }).catch(function(err){
      console.warn("[akan-hmr] React Fast Refresh failed, falling back to RSC refresh", err);
      fallbackToRsc = true;
      endHmrOverlay(overlayToken);
      refreshRsc(msg);
    }).finally(function(){
      if (!fallbackToRsc) endHmrOverlay(overlayToken);
    });
  }

  function swapCss(href){
    var overlayToken = beginHmrOverlay("Updating styles...");
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-akan-css", "pending");
    link.addEventListener("load", function(){
      var prev = document.querySelectorAll("link[data-akan-css=active]");
      for (var i = 0; i < prev.length; i++) prev[i].parentNode && prev[i].parentNode.removeChild(prev[i]);
      link.setAttribute("data-akan-css", "active");
      endHmrOverlay(overlayToken);
    });
    link.addEventListener("error", function(){
      if (link.parentNode) link.parentNode.removeChild(link);
      endHmrOverlay(overlayToken);
    });
    document.head.appendChild(link);
  }

  function selectCssUrl(cssAssets){
    if (!cssAssets || typeof cssAssets !== "object") return null;
    var parts = location.pathname.split("/").filter(Boolean);
    for (var i = 0; i < parts.length; i++) {
      var asset = cssAssets[parts[i]];
      if (asset && asset.cssUrl) return asset.cssUrl;
    }
    return cssAssets[""] && cssAssets[""].cssUrl ? cssAssets[""].cssUrl : null;
  }

  connect();
})();`;
