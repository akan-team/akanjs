---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

An app can now serve its default locale at unprefixed paths. Set `i18n.localePrefix` to `"as-needed"` in `akan.config.ts`, and `/pokemon/deoxys` is the English page itself. Before, every page lived under `/<locale>/…`, and an unprefixed path answered with a 307 to the locale the browser asked for. An app with one language, or with URLs fixed from outside (OAuth callbacks, QR codes, links in mail, a migrated site), could only meet them with raw `<a href>`s, which reloaded the whole page and went through that 307 on every click.

```ts
const config: AppConfig = {
  i18n: { defaultLocale: "en", locales: ["en", "ko"], localePrefix: "as-needed" },
};
```

- **The default stays `"always"`**, so an app that sets nothing serves and links exactly as before.
- **Under `"as-needed"` the default locale drops the prefix and the other locales keep it.** `<Link href="/types">` renders `/types` on an English page and `/ko/types` on a Korean one, and still navigates in place. So do `router.push`, a server `router.redirect()`, `setLang`, active-link matching, the 404 page's home link, `hreflang` alternates and `/sitemap.xml`. `setLang` to the default locale drops the prefix. A single-locale app has no prefix anywhere.
- **An unprefixed URL always means the default locale.** No Accept-Language redirect runs, so one URL is one locale for caches and search engines.
- **`/<defaultLocale>/x` answers with a 308 to `/x`**, so links from the `"always"` days keep working and land on the one canonical URL. The 308 is cached for a day, so an app that goes back to `"always"` stops redirecting within that time.
- **Native and CSR boots keep their locale paths.** Their routes match on the `/:lang` segment, so a `?csr=true` request without one is redirected to the default locale's prefixed path. An Android app link limited to a basePath lists the default locale's unprefixed path as well as its prefixed one, so links from before the switch still open the app.
- `akan preview` keeps an unprefixed path unprefixed under `"as-needed"`, except with `--csr`. The value reaches bundles as `AKAN_PUBLIC_LOCALE_PREFIX`, and the image env carries it when it is `"as-needed"`. `LocalePath` (`akanjs/common`) and a fourth `localePrefix` argument to `getPathInfo` build the same URLs in app code.
