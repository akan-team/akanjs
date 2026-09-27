// See selftest-frame.html. Plain script (not bundled): runs as-is inside the test iframe.
(async function () {
  var results = {};
  function attempt(name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(
        function (value) { results[name] = String(value); },
        function (error) { results[name] = "error: " + ((error && error.name) || error); }
      );
  }
  // A call with a visible side effect: the parent checks that the preference was not written.
  var body = JSON.stringify({ v: 1, id: 1, plugin: "preferences", method: "set", args: { key: "selftest.frame", value: "written by a frame" } });
  await attempt("ipc", function () {
    return fetch("/__akan_native/ipc", { method: "POST", headers: { "x-akan-native-ipc": "1" }, body: body }).then(function (r) { return "status " + r.status; });
  });
  await attempt("hello", function () {
    return fetch("/__akan_native/hello?n=0123456789abcdef0123456789abcdef").then(function (r) { return "status " + r.status; });
  });
  await attempt("webkit", function () {
    var h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.akanNative;
    return h ? h.postMessage(body).then(function (reply) { return "reply " + reply; }) : "absent";
  });
  await attempt("parent", function () { return typeof parent.__AKAN_NATIVE__; });
  // A fake port posted to the parent must not become its bridge.
  await attempt("fakePort", function () {
    var channel = new MessageChannel();
    var got = "";
    channel.port1.onmessage = function (e) { got = String(e.data).slice(0, 60); };
    parent.postMessage("akan-native:port", "*", [channel.port2]);
    return new Promise(function (resolve) { setTimeout(function () { resolve(got ? "answered " + got : "ignored"); }, 400); });
  });
  parent.postMessage({ akanNativeSelftestFrame: results }, "*");
})();
