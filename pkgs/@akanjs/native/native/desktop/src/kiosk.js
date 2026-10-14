// Every document of an unattended app on Windows and macOS, frames included: the engine runs a document-created script
// in each (lib.rs KIOSK_SCRIPT).
(() => {
  const ignore = () => {};
  const keep = (target, name, value) => {
    try {
      Object.defineProperty(target, name, { get: () => value, set: ignore, configurable: false });
    } catch {}
  };
  const isFile = (node) => !!node && node.localName === "input" && String(node.type).toLowerCase() === "file";
  const refused = (name) => new DOMException("an unattended app opens no dialog of the system's", name);
  const locked = new WeakSet();
  const lock = (win) => {
    if (!win || locked.has(win)) return;
    locked.add(win);
    keep(win, "print", ignore);
    for (const name of ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]) {
      if (name in win) keep(win, name, () => Promise.reject(refused("AbortError")));
    }
    if (win.navigator && "share" in win.navigator) {
      keep(win.navigator, "share", () => Promise.reject(refused("NotAllowedError")));
    }
    const element = win.HTMLElement?.prototype;
    if (element) {
      const click = element.click;
      keep(element, "click", function () {
        if (!isFile(this)) return click.call(this);
      });
    }
    const input = win.HTMLInputElement?.prototype;
    const showPicker = input?.showPicker;
    if (showPicker) {
      keep(input, "showPicker", function () {
        if (isFile(this)) throw refused("NotAllowedError");
        return showPicker.call(this);
      });
    }
    win.addEventListener?.(
      "click",
      (event) => {
        if (isFile(event.composedPath()[0])) event.preventDefault();
      },
      true,
    );
    //? A frame a script makes starts on about:blank, which no navigation loads, so the engine need not run this script in
    //? it: its window is locked when the parent reaches for it, or when the frame joins the document.
    for (const frame of [win.HTMLIFrameElement, win.HTMLFrameElement, win.HTMLObjectElement]) {
      const proto = frame?.prototype;
      if (!proto) continue;
      for (const name of ["contentWindow", "contentDocument"]) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        const get = descriptor?.get;
        if (!get) continue;
        try {
          Object.defineProperty(proto, name, {
            ...descriptor,
            get() {
              const value = get.call(this);
              try {
                lock(name === "contentWindow" ? value : value?.defaultView);
              } catch {}
              return value;
            },
          });
        } catch {}
      }
    }
    if (win.MutationObserver && win.document) {
      new win.MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!node.querySelectorAll) continue;
            for (const frame of [node, ...node.querySelectorAll("iframe, frame, object")]) {
              try {
                lock(frame.contentWindow);
              } catch {}
            }
          }
        }
      }).observe(win.document, { childList: true, subtree: true });
    }
  };
  try {
    lock(window);
  } catch {}
})();
