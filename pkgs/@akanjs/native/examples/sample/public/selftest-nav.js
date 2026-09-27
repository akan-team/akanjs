// See selftest-nav.html. Plain script (not bundled). The data: frame reports to the app page
// (top); the others must neither load nor open an app outside the app.
(function () {
  function frame(src) {
    var f = document.createElement("iframe");
    f.src = src;
    document.body.append(f);
  }
  frame("data:text/html,<script>top.postMessage({ akanNativeSelftestNav: 'data frame loaded' }, '*')</script>");
  frame("akansample-nope://frame");
  frame("mailto:selftest@example.com");
})();
