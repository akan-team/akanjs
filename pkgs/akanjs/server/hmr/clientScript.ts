import { SSR_DEV_ROUTE_PREFIX } from "./csrDevManifest";
import { isSyncNavigationEnabled } from "./wsHub";

// A classic inline script that runs before any module script, so it stays dependency-free. swapCss must drop both the
// SSR <link> and the CSR artifact's inline <style data-akan-css="active">, or every CSS save leaves two sheets.
export const HMR_CLIENT_SCRIPT = `(function(){
  if (self.__AKAN_HMR_INSTALLED__) return;
  self.__AKAN_HMR_INSTALLED__ = true;
  var syncNavigationEnabled = ${JSON.stringify(isSyncNavigationEnabled())};
  var syncNavigationClientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var clientKind = self.__AKAN_HMR_CLIENT__ === "csr" ? "csr" : "ssr";
  // The dev error page a failed render served: it runs no app, so any sign of a fixed build reloads it.
  var systemPage = !!self.__AKAN_HMR_SYSTEM_PAGE__;
  var proto = location.protocol === "https:" ? "wss:" : "ws:";
  var url = proto + "//" + location.host + "/_akan/hmr" + (clientKind === "csr" ? "?client=csr" : "");
  var attempts = 0;
  var socket = null;
  var lastBuildId = null;
  var refreshRuntimePromise = null;
  var refreshRuntime = null;
  var pendingRefreshRegistrations = [];
  var overlayEl = null;
  var overlayLabelEl = null;
  var overlayDetailEl = null;
  var overlayStyleEl = null;
  var overlayTimer = null;
  var overlayHideTimer = null;
  var overlayNextToken = 1;
  var overlayJobs = {};
  var buildErrorStates = {};
  var traces = self.__AKAN_HMR_TRACES__ = self.__AKAN_HMR_TRACES__ || [];
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
  // A CSR page has no import map to load it from; the registry dev bundle installs its own.
  if (clientKind === "ssr" && !systemPage) ensureRefreshRuntime().catch(function(err){
    console.warn("[akan-hmr] React Refresh runtime preload failed", err);
  });

  function connect(){
    try { socket = new WebSocket(url); }
    catch(e){ console.error("[akan-hmr] ws init failed", e); schedule(); return; }
    socket.addEventListener("message", function(ev){
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e){ return; }
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "hello") {
        // Not on open: the gateway takes the socket before its upstream answers, and closes it when that fails.
        attempts = 0;
        var dropped = Array.isArray(msg.failingPhases) && dropBuildErrorsExcept(msg.failingPhases);
        if (dropped && systemPage) {
          reloadForUpdate("the build that failed to render this page recovered");
          return;
        }
        if (clientKind === "csr") {
          if (csrGenerationMoved(msg.csrGeneration)) reloadForUpdate("missed a CSR update while disconnected");
          return;
        }
        if (systemPage) {
          if (lastBuildId !== null && msg.buildId !== lastBuildId) location.reload();
          lastBuildId = msg.buildId;
          return;
        }
        if (ssrRegistryReplaced(msg.ssrEpoch)) {
          reloadForUpdate("the dev server rebuilt the SSR registry while this tab held the previous one");
          return;
        }
        if (ssrRegistryGone(msg.ssrEpoch)) {
          reloadForUpdate("the dev server has no SSR registry yet: a new session or a config restart is building one");
          return;
        }
        if (ssrBootFailedBefore(msg.ssrGeneration, msg.ssrEpoch)) {
          reloadForUpdate("the SSR registry this tab failed to load was rebuilt");
          return;
        }
        if (typeof msg.ssrGeneration === "number") self.__AKAN_SSR_HELLO_GENERATION__ = msg.ssrGeneration;
        var sameRegistry = holdsSsrRegistry(msg.ssrEpoch);
        if (sameRegistry) catchUpSsrRegistry(msg.ssrGeneration);
        if (lastBuildId === null || msg.buildId === lastBuildId) {
          lastBuildId = msg.buildId;
          return;
        }
        // A restarted backend dropped whatever was sent meanwhile: the patches just caught up, then the refresh. Only
        // onto the registry this tab holds: a new dev session or a config restart builds another from generation 1.
        if (sameRegistry) refreshRsc({ buildId: msg.buildId });
        else location.reload();
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
      if (msg.type === "csr-update") {
        applyCsrUpdate(msg);
        return;
      }
      if (msg.type === "ssr-update") {
        applySsrUpdate(msg);
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

  function csrGenerationMoved(generation){
    if (typeof generation !== "number") return false;
    var current = self.__akan ? self.__akan.generation : self.__AKAN_CSR_GENERATION__;
    return typeof current === "number" && current !== generation;
  }

  function reloadForUpdate(reason){
    console.warn("[akan-hmr] reloading the page: " + reason);
    beginHmrOverlay("Reloading...", true);
    setTimeout(function(){ location.reload(); }, 30);
  }

  // Kept in the page so a latency probe can line up the build side's marks with when the page took the update.
  function recordTrace(kind, msg, receivedAt, appliedAt){
    traces.push({ kind: kind, generation: msg.generation, trace: msg.trace || null, receivedAt: receivedAt, appliedAt: appliedAt });
    if (traces.length > 64) traces.shift();
  }

  // A registry page (self.__akan) patches itself; a single-file CSR artifact can only reload.
  function applyCsrUpdate(msg){
    recordTrace("csr", msg, Date.now(), null);
    if (msg.reload || !self.__akan || typeof self.__akan.hot !== "function") {
      reloadForUpdate(msg.reason || "the CSR bundle was rebuilt");
      return;
    }
    self.__akan.hot(msg);
  }

  // A new dev server builds its registry from scratch, restarting the generations a tab would compare.
  function ssrRegistryReplaced(epoch){
    var own = self.__AKAN_SSR_EPOCH__;
    return typeof epoch === "number" && typeof own === "number" && own !== epoch;
  }

  // Certain, not assumed: a hello from a backend whose registry is not built yet names no epoch at all.
  function holdsSsrRegistry(epoch){
    return typeof epoch === "number" && self.__AKAN_SSR_EPOCH__ === epoch;
  }

  // No manifest on disk means .akan was cleared (a new akan start, a config restart): the registry this tab holds is
  // gone, the next starts over from generation 1, and its first build is announced to no tab. A new document waits for it.
  function ssrRegistryGone(epoch){
    return typeof self.__AKAN_SSR_EPOCH__ === "number" && typeof epoch !== "number";
  }

  // Behind only, counting patches still loading: a tab that booted from an app.js newer than the last update sent is
  // ahead, not stale. A registry that has not started catches up in the shim, once it has.
  function catchUpSsrRegistry(generation){
    var registry = self.__akan;
    if (typeof generation !== "number" || !registry || typeof registry.catchUp !== "function") return;
    if (registry.inspect().target < generation) registry.catchUp(generation, ${JSON.stringify(SSR_DEV_ROUTE_PREFIX)});
  }

  function ssrBootFailedBefore(generation, epoch){
    var failed = self.__AKAN_SSR_BOOT_FAILED__;
    if (!failed || typeof generation !== "number") return false;
    return generation > failed.generation || (typeof epoch === "number" && typeof failed.epoch === "number" && epoch !== failed.epoch);
  }

  // An SSR page in registry mode. One that has not loaded its registry yet keeps the update for the registry's start.
  function applySsrUpdate(msg){
    recordTrace("ssr", msg, Date.now(), null);
    if (systemPage) {
      reloadForUpdate("a save changed the client code of the page that failed to render");
      return;
    }
    if (ssrBootFailedBefore(msg.generation)) {
      reloadForUpdate("the SSR registry this tab failed to load was updated");
      return;
    }
    // Directly: a registry whose app.js never started would only queue it, and one that failed to start takes a reload
    // of its own generation too (its app.js may have booted beside the vendor file of the build before).
    var startFailed = !!(self.__akan && typeof self.__akan.inspect === "function" && self.__akan.inspect().failed);
    if (msg.reload && self.__akan && (!(msg.generation <= self.__akan.generation) || (startFailed && msg.generation >= self.__akan.generation))) {
      reloadForUpdate(msg.reason || "the SSR registry was rebuilt");
      return;
    }
    if (self.__akan && typeof self.__akan.hot === "function") {
      self.__akan.hot(msg);
      return;
    }
    var early = self.__AKAN_SSR_EARLY_UPDATES__ = self.__AKAN_SSR_EARLY_UPDATES__ || [];
    early.push(msg);
    if (early.length > 64) early.shift();
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
    if (msg.status === "ok" && systemPage) {
      reloadForUpdate("the build that failed to render this page recovered");
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
    var sameGeneration = phase === "backend" || phase === "route";
    var recovered = sameGeneration ? generation >= current.generation : generation > current.generation;
    if (!recovered) return;
    delete buildErrorStates[phase];
    showBuildRecovered(msg);
  }

  //? A backend that restarted since these went out, and sends each phase failing now right after its hello, never
  //? recovers the others: its route builds and statuses start over, so the fix of one is nothing it would report.
  function dropBuildErrorsExcept(failing){
    var dropped = false;
    for (var phase in buildErrorStates) {
      if (failing.indexOf(phase) >= 0) continue;
      delete buildErrorStates[phase];
      dropped = true;
    }
    if (dropped && !systemPage) showBuildRecovered({});
    return dropped;
  }

  // A render error belongs to no build phase and no status reports its fix; this page rendering again is the only sign.
  function clearRenderError(){
    if (!buildErrorStates.build) return;
    delete buildErrorStates.build;
    showBuildRecovered({});
  }

  function showBuildRecovered(msg){
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

  // After the registry applied every patch it was handed: the payload names the client modules those patches brought.
  var rscRefreshSeq = 0;
  var rscRefreshedSeq = 0;
  function refreshRsc(msg){
    var receivedAt = Date.now();
    // A newer refresh supersedes this one: it waits for the patches that came with it, which this wait did not.
    var seq = ++rscRefreshSeq;
    var refresh = function(){ if (seq === rscRefreshSeq) doRefreshRsc(msg, receivedAt, seq); };
    var settle = function(){
      return self.__akan && typeof self.__akan.whenSettled === "function" ? self.__akan.whenSettled() : null;
    };
    // A registry still booting holds the updates that came first; the payload may name what they bring. One whose boot
    // failed never starts, so it has nothing to wait for.
    var booting = self.__AKAN_SSR_BOOT__;
    var settled = booting ? Promise.resolve(booting).then(settle, function(){ return null; }) : settle();
    if (!settled) {
      refresh();
      return;
    }
    settled.then(refresh, refresh);
  }

  function doRefreshRsc(msg, receivedAt, seq){
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
      // One started before a newer refresh can finish after it; the newer one's build is what the page shows.
      if (!(seq < rscRefreshedSeq)) {
        rscRefreshedSeq = seq;
        lastBuildId = msg.buildId;
      }
      recordTrace("rsc-refresh", msg, receivedAt, Date.now());
      endHmrOverlay(overlayToken);
      clearRenderError();
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

  function swapCss(href){
    var overlayToken = beginHmrOverlay("Updating styles...");
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-akan-css", "pending");
    link.addEventListener("load", function(){
      var prev = document.querySelectorAll("link[data-akan-css=active], style[data-akan-css=active]");
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
