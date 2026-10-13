// Every document of an unattended app on Windows, frames included: WebView2 runs a document-created script in each.
(() => {
  try {
    const ignore = () => {};
    const keep = (target, name, value) => {
      try {
        Object.defineProperty(target, name, { get: () => value, set: ignore, configurable: false });
      } catch {}
    };
    const isFile = (node) => !!node && node.localName === "input" && String(node.type).toLowerCase() === "file";
    const refused = (name) => new DOMException("an unattended app opens no dialog of the system's", name);
    keep(window, "print", ignore);
    for (const name of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]) {
      if (name in window) keep(window, name, () => Promise.reject(refused("AbortError")));
    }
    if ("share" in navigator) keep(navigator, "share", () => Promise.reject(refused("NotAllowedError")));
    const element = HTMLElement.prototype;
    const click = element.click;
    keep(element, "click", function () {
      if (!isFile(this)) return click.call(this);
    });
    const input = HTMLInputElement.prototype;
    const showPicker = input.showPicker;
    if (showPicker) {
      keep(input, "showPicker", function () {
        if (isFile(this)) throw refused("NotAllowedError");
        return showPicker.call(this);
      });
    }
    addEventListener(
      "click",
      (event) => {
        if (isFile(event.composedPath()[0])) event.preventDefault();
      },
      true,
    );
  } catch {}
})();
