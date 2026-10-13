// XXX: serialized with `toString()` into the view's HTML, so it may reach browser globals only, never an import or a
// binding of this module.
// Runs before the bundle. A `srcdoc` view throws on any cookie or storage access, and a proxy-origin view would share
// one storage with every other app the host renders there, so the view keeps both in memory, like a native shell.
// A host may block the `<base>` despite `baseUriDomains` (Claude does), so a root-relative asset — a stored file's
// `/api/...` URL — is pointed at the app's origin wherever it is written, before the browser fetches it. A srcset URL
// may hold commas (a `data:` URL does), so candidates part where the HTML parser parts them, not at every comma.
export const mcpAppViewRuntime = () => {
  const memoryStorage = (): Storage => {
    const items = new Map<string, string>();
    return {
      get length() {
        return items.size;
      },
      key: (idx: number) => [...items.keys()][idx] ?? null,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        items.set(String(key), String(value));
      },
      removeItem: (key: string) => {
        items.delete(String(key));
      },
      clear: () => {
        items.clear();
      },
    };
  };
  for (const name of ["localStorage", "sessionStorage"])
    Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
  const jar = new Map<string, string>();
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    set: (raw: unknown) => {
      const [pair, ...attrs] = String(raw).split(";");
      const at = pair.indexOf("=");
      if (at < 0) return;
      const name = pair.slice(0, at).trim();
      const attrOf = (key: string) => {
        const found = attrs.find((attr) => attr.trim().toLowerCase().startsWith(`${key}=`));
        return found === undefined ? undefined : found.slice(found.indexOf("=") + 1).trim();
      };
      const maxAge = attrOf("max-age");
      const expires = attrOf("expires");
      const expired =
        maxAge !== undefined && /^-?\d+$/.test(maxAge)
          ? Number(maxAge) <= 0
          : expires !== undefined && Date.parse(expires) < Date.now();
      if (expired) jar.delete(name);
      else jar.set(name, pair.slice(at + 1).trim());
    },
  });
  const origin = (window as unknown as { __AKAN_EMBED__?: { origin?: string } }).__AKAN_EMBED__?.origin;
  if (!origin || document.baseURI.startsWith(`${origin}/`)) return;
  const absolute = (url: string) => (url.startsWith("/") && !url.startsWith("//") ? `${origin}${url}` : url);
  const valueOf = (el: Element, name: string, value: unknown) => {
    if (typeof value !== "string") return value;
    if (name === "src" || name === "poster" || (name === "href" && el.tagName === "LINK")) return absolute(value);
    if (name !== "srcset") return value;
    return value.replace(
      /(^|,)(\s*)([^\s,](?:\S*[^\s,])?)/g,
      (_match, comma: string, space: string, url: string) => `${comma}${space}${absolute(url)}`,
    );
  };
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
    return setAttribute.call(this, name, valueOf(this, String(name).toLowerCase(), value) as string);
  };
  const fix = (el: Element) => {
    for (const name of ["src", "srcset", "poster", "href"]) {
      const value = el.getAttribute(name);
      if (value !== null && valueOf(el, name, value) !== value)
        setAttribute.call(el, name, valueOf(el, name, value) as string);
    }
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") fix(record.target as Element);
      else
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          fix(node as Element);
          for (const el of (node as Element).querySelectorAll("[src],[srcset],[poster],link[href]")) fix(el);
        }
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "poster", "href"],
  });
};
