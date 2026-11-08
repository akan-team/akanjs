# @akanjs/devkit

## 3.1.1

### Patch Changes

- 39d5902: Akan.js 3.1.1. Read **Upgrade notes** before deploying an app that runs 3.1.0: sessions, proxies, the status routes and a few boot checks change, and `akan lint` gains gates a workspace adopts with a baseline.

  **Security**

  - **Build files.** In 3.1.0, `/_akan/styles/` and `/_akan/fonts/` resolved an encoded `..` against the whole build folder, so a request such as `/_akan/fonts/..%2fserver%2fpages-<hash>.js` could read any file in it, the server bundle and `base-artifact.json` included, through the gateway too. They now serve only from the build's `styles/` and `fonts/` folders. Upgrade any internet-facing 3.1.0 deployment.
  - **Session cookie.** Outside local the session cookie is `__Host-jwt:<appName>`, a name a browser accepts only from the app's own host over HTTPS at `Path=/`, so a sibling subdomain or a parent domain can no longer plant one. A request that carries the session cookie more than once reads as signed out — on the server, in SSR fetches, on websockets and in the browser — and an `Authorization: Bearer` header still wins. The server expires the duplicated copies of an unprefixed session cookie it can name (a local server's `jwt:<appName>`, or a name a library adds with `SessionCookies.watch(name)` from `akanjs/common`) and logs the name, the count and the host, never a value. A cookie name is trimmed of space and tab only, as RFC 6265 does, so a name padded with other whitespace never reads as a `__Host-` cookie. Outside local, `libs/shared` moves its SSO state, sign-up token and refresh cookies to `__Host-` names too, and reads a refresh cookie sent twice as absent.
  - **SSO origin.** `libs/shared` no longer builds the provider's `redirect_uri` from a cookie the sign-in page set. The server takes the origin from the request, trusting `x-forwarded-host` and `x-forwarded-proto` only from a trusted hop, and outside local refuses a host that is not the app's own with `shared.error.invalidSsoOrigin`. The native SSO start uses the same origin and check.
  - **Status routes.** Outside local, `/_akan/app/health` answers an anonymous caller only `{ status }` (`running`, or `stopping` while it drains) with 200, and `/_akan/app/metrics` answers 401. `Authorization: Bearer <AKAN_STATUS_TOKEN>` unlocks both in full; `AKAN_LOG_STREAM_TOKEN` works too, and a token containing whitespace unlocks nothing. Both answers are `cache-control: no-store`; `/_akan/app/info` and `/_akan/bench/ping` stay public. Detail stays open wherever `AKAN_PUBLIC_ENV` is `local`, and `akan build` bakes in the workspace's own value, so never expose an image built with `local`.
  - **Client address.** `AKAN_TRUSTED_PROXIES` names the proxies whose forwarded headers count. Unset, it is loopback and the private and link-local ranges, as before, and the caller is `X-Real-IP`, else the leftmost `X-Forwarded-For` entry. Set to a list of addresses or CIDRs, `private`, or `none` (loopback alone), it replaces those ranges: `X-Forwarded-For` is walked from the right past every trusted hop, and `X-Real-IP` counts only when `X-Forwarded-For` is absent or its nearest entry is no address. `*` alone trusts every peer; beside other entries it is ignored with a warning, as 3.1.0 ignored it. A forwarded value counts only when it is an IP address, and `Ip`, `context.getClientIp()` and the websocket address report it in one spelling, with no port or IPv6 zone and an IPv4-mapped IPv6 address as IPv4: `IpLiteral.parse(text)` from `akanjs/common` gives an address your code stores or compares the same spelling. The gateway and a solo server take `X-Forwarded-Host`, `-Proto` and `-Port` only from a trusted proxy. We recommend listing your load balancer's and ingress controller's own addresses: `private` lets any peer at a private address, such as a pod or a VPN user, name any caller, so pair it with a NetworkPolicy that admits only the ingress.
  - **In-page agent requests.** The browser writes a `runAgentTurn` request's instructions, tools and transcript, so a caller past `setAgentAccess` could send a hand-built turn and use the app's LLM key as a plain LLM. `option.setAgentRequestPolicy((request, { account, ip }) => request)` sees each turn after the access guard and before the quota hook and the model, with tool names as the page published them, and returns the request to send — a server-fixed lead to the instructions, a tool allowlist, caps, a per-turn `model` — or throws an `Err` to refuse it (`agent.error.requestRefused` is new) before any stream opens. Compaction turns pass through it too, with no tools and the summarizer's instructions. Attachments, references and tool results are folded into the prompt after the policy runs, so a size cap counts them itself. Without a policy nothing changes.
  - **CLI sign-in.** `akan login` prints a code such as `BCDF-GHJK` beside the sign-in URL: type it on the sign-in page to approve, and never type a code that did not come from your own terminal. The URL and its QR code carry only a login id, `RemoteAuthCode.loginIdOf(deviceCode)` from `akanjs/common`; the device code the CLI polls with is never in the link, so neither the code nor the session can be taken from it. A cloud serving `/remoteAuth` itself asks for the code: it accepts a poll only by a device code in the UUID form the CLI mints, registers a short-lived pending login under `loginIdOf` it, rate-limits that anonymous poll, approves only when `RemoteAuthCode.matches(deviceCode, typed)` holds, expires the login after three wrong codes, and hands the session out once. A cloud that does not still signs the CLI in, without the code.

  **Upgrade notes**

  - **Sessions.** Every visitor of a server-rendered page signs in once more; a CSR bundle keeps the token it stored until its `libs/shared` refresh fails. Native apps keep `jwt:<appName>` in secure storage and stay signed in. The `jwt:<appName>` and bare `jwt` cookies and the bare `jwt` secret-storage key are no longer read, and sign-in, sign-out and `initAuth` delete them; code that reads the cookie by a hard-coded name calls `authTokenKey()`. The app shell no longer signs a visitor in from a `?jwt=` query parameter, and `initAuth` no longer writes back a cookie it only read. `cookies()` from `akanjs/fetch` and `getCookie` / `cookies()` from `akanjs/client` read a name sent more than once as unset, percent-decode values, and no longer unwrap `j:` JSON values; the new `cookieJar()` in both returns every occurrence, with `read(name)`, `all(name)` and `readJson(name)`. `setCookie` escapes whitespace, control characters, `;`, `,`, `"`, `\` and a lone `%`, so `getCookie` reads the value back; a `%XX` its caller encoded is written unchanged. `removeCookie` writes `Secure` when it deletes a `__Host-` or `__Secure-` cookie. Deprecated: `parseCookieHeader`, `readAuthToken` (use `readSessionToken(CookieJar.parse(header))`), `cookieHeaderHasAuthToken` and `AppWsData.cookies` (use `jar`).
  - **SSO hosts.** Outside local, SSO accepts only the app's own hosts: the `routes` domains in `akan.config.ts`, `AKAN_SUB_ROUTE_HOSTS`, `<app>-<environment>.<serveDomain>`, the `hostname` option or `HOST_NAME` (`BackendEnv.hostname` now also takes a list, such as the apex and `www`, whose first name is the one links, the issuer and mail use), `AKAN_ALLOWED_HOSTS` (which, once set, also refuses every host it leaves out) and `AppHosts.declare(hosts)` from `akanjs/common`. Declare every host users sign in on before upgrading. A build with `web: false` records no `routes` domains, so list its hosts in `AKAN_ALLOWED_HOSTS`. A sign-in or sign-up left unfinished across the upgrade starts again, and a web session cannot be refreshed past it. `getSsoOrigin`, `NativeSso.publicOrigin` and `shared.error.invalidSsoCallbackMissingOrigin` are removed, and `readRefreshTokenCookie` takes the request.
  - **Proxies.** A proxy at a public address that terminates TLS or rewrites `Host`, such as a CDN, must be in `AKAN_TRUSTED_PROXIES` even where you never set it: otherwise the app reads `http` and the inner host, so MCP OAuth metadata, the SSO `redirect_uri` and absolute URLs come out wrong and browser mutations are refused as cross-site. If you already set the list, a private-range ingress it does not name is no longer trusted (add it), and the caller now comes from the right-hand walk of `X-Forwarded-For`, not `X-Real-IP`, so your proxy must set or append `X-Forwarded-For`.
  - **Status routes.** A metrics scraper or monitor that reads the health or metrics body sends `Authorization: Bearer <AKAN_STATUS_TOKEN>`. Probes that read only the status code — the chart's probes, the desktop shell, `akan` commands — need nothing.
  - **Writes during a render.** `fetch.<mutation>()` or a socket `message` sent while a page renders now throws `base.error.mutationInRender` as the call is made, before anything is sent, so a `.catch()` on its promise does not swallow it. On the server that covers a route's `.render()`, `.guard()`, `.head()` and `.loading()`, a layout's `.notFound()` and `.error()`, any component rendered inside them, and the page behind a `.prompt()`; in a CSR bundle, a route stage's synchronous part. Move the write to a user action, or pass `{ duringRender: true }` as the call's option (`fetch.prepareSession(id, { duringRender: true })`) only for a write harmless to repeat and safe for anyone following a link to trigger; an OAuth callback page that completes a connection needs it and must check that its `state` was issued to the signed-in user. `.app()` loads still refuse every mutation. `akan quality` reports these calls as `akan.ssr.render-mutation`, reading a route file's stages and the functions it calls in that file.
  - **Boot checks.** An app now fails to boot where 3.1.0 served one of two declarations and dropped the other; rename one side of each pair the error names.
    - One refName with two shapes: scalar fields, enum values, or a model declared under a lib's refName without building on the lib's model (extending through `lib/__lib/lib.constant.ts` stays legal). A field's `secret`, `hidden` or `visual` kind is part of its shape. Likely hits: an app enum or scalar sharing a `libs/shared` name with other values, and an app model that leaves out one of the lib model's layers. Libs disabled with `disableLibs` are not checked, and a lib's own `agentTurn` scalar with other fields is refused, naming `akanjs` as the other owner. When a lib and the app both declare a refName, the app's declaration now wins in every registry.
    - One `fetch.*` name claimed twice (`[DI:fetch]`): a mounted generated endpoint, a slice's `xListInY` / `initXInY`, or a custom query, mutation, pubsub or message; and a pubsub and a message sharing a name (`[DI:socket]`). A native or desktop build already shipped still calls the old name.
    - Two internal jobs of one kind under one name (`[DI:internal]`): two `initialize`, two `destroy`, two `process`, or two of `cron`, `interval` and `timeout`. Renaming a `process` job moves it to a new queue, so drain the old one first; renaming a cron or interval starts a new lease.
  - **Service methods.** `transaction` and `afterCommit` are now methods of every service: rename a service method of either name. A custom `DatabaseAdaptor` implements `afterCommit(fn)`.
  - **WebSocket on first use.** The socket opens at a page's first subscribe or message instead of at load. An app that relied on it being open at load — reading `fetch.ws.connected`, listening for `"connect"`, or expecting a push before it subscribes — adds `.wsConnect(true)` to its root layout.
  - **Dictionaries.** `System.Provider` no longer takes a `dictionary` prop: remove it from a hand-written root layout. `Translator.withDefaultLocale` is removed; the build fills a locale's missing keys from the default locale.
  - **MCP.** An app slice that writes no `mcp` map now inherits every verb its lib's slice took off the shelf, root `mcp: false` included. An app extending a `libs/shared` model whose slice says `mcp: { cru: false }` (such as `admin` or `notification`) stops publishing those generated writes on `/mcp`; write `mcp: { cru: true }` on the app's slice to publish them again. HTTP is unchanged.
  - **Slices on the client.** An app's slice that extends a lib's replaces the lib's guards, `mcp`, person-only and `crud` maps whole on the client too, as the server mounts them. A verb the app sets to `None` no longer gets a client handler, so `fetch.createX` for it is undefined instead of answering 403.
  - **Library sort keys.** An app filter built from a library's filter carries the library's sort keys in its type, so an app dictionary that does not spread the library's dictionaries into `modelDictionary(...)` translates them in `.sort()`.
  - **Pubsub `null`.** Publishing `null` or `undefined` to a pubsub that is not `{ nullable: true }` throws an error naming the pubsub.
  - **Compression.** HTML, RSC and other text responses compressed as they stream carry no `Content-Length`, and a strong `ETag` on one becomes weak. `AKAN_HTTP_COMPRESS=0` still turns compression off.
  - **Desktop updates.** Install matching `akanjs` and `@akanjs/cli` (native build API 0.13.0). A self-hosted feed must serve `<os>-<arch>/<channel>/app.json`. Renaming a native target cuts its installed desktop apps off updates. Before you revoke a key or sign with a spare, publish a release signed with the first key, so apps built with 3.1.0 move to a 3.1.1 binary. `native.updates.publicKeys` refuses a non-canonical or small-order Ed25519 key, which would verify signatures nobody made: replace it with one `akan update-keygen` prints. A desktop app now updates itself by default; set `native.updates.automatic: false` to keep checking, downloading and applying in the app's own `updates` calls.
  - **`@akanjs/devkit`.** `CloudApi.getRemoteAuthToken` and `CloudApi.getRemoteSelf` throw on a failed request and give up after 20 seconds; `null` now means only "not approved yet" and "no sign-in from this session". `uploadRelease`, an unused helper importable only as `@akanjs/devkit/uploadRelease`, is removed. The native build types come from `akanjs/native/api` and `akanjs/native/config`, not the unpublished `@akanjs/native/api`.
  - **Workspaces.** An existing workspace adds `@akanjs/cli` at its `akanjs` version (`bun add -d @akanjs/cli@<version>`), so `bunx akan` runs Akan's CLI and not the unrelated npm package `akan`. A `local/` folder an earlier version left inside an app or library is no longer written; delete it.
  - **Lint gates.** `akan lint` now fails in an app or library that already breaks the size and write rules under **New**, until `akan quality baseline` records what is there: run it once and commit the `akan.baseline.json` files it writes. A CI job that runs `akan lint` needs the default branch's history (`actions/checkout` with `fetch-depth: 0`); in a shallow clone the gate fails rather than pass unchecked. A literal list limit above 500 (`no-oversized-list-limit`) is a lint error the baseline does not record, so lower it. `akan typecheck` now also checks an app's `script/` files, which nothing imports.
  - **Agent guide.** Run `akan agent install` and commit what it writes: `AGENTS.md`, the scoped `AGENTS.md` files, `.claude/rules/akan/`, `.claude/skills/akan-*`, `.agents/skills/akan-*` and `.cursor/rules/akan-*.mdc`. Your `CLAUDE.md` and `.cursor/rules/akan.mdc` pointers are kept. Nothing reads `docs/AI-DEVELOPMENT.md` or `docs/GENERATED.md` anymore, so a workspace created before this release can delete them; `akan doctor` reports them.

  **New**

  - **Navigation guards.** `router.addNavigationGuard(guard)` keeps a page with unsaved work. `guard({ kind, from, to })` is asked before every in-app move — `push`, `replace`, `back`, a `Link`, a deep link, the browser's back and forward, a native back button or swipe, and the in-page agent's `navigate` and `goBack` — and returns the function that removes it. `useNavigationGuard(guard)` from `akanjs/webkit` registers one for the page that is on screen. Answering `false`, throwing or rejecting keeps the page, and `router.navigation()`, which now also follows `back()`, rejects with `NavigationRefused`. A refused browser back or forward is undone before the page redraws, and an async guard that later allows it replays the move. Guards answer one at a time, and a move started while one decides is refused. Redirects, `notFound()`, `setLang` and moves off the origin are not asked; a closing tab is `beforeunload`'s.
  - **Transactions.** Every service has `this.transaction(fn)` and `this.afterCommit(fn)`. `transaction` runs `fn` as one database transaction over every model and returns its value, typed; when `fn` throws it rolls back and rethrows that error. A transaction opened inside another joins it with no savepoint, so what the inner one wrote before throwing still commits if the outer catches the error. On Postgres a failed statement aborts the whole transaction even when caught, so `transaction` rolls back and rethrows it. On SQLite it holds the database's only write lock, so keep `fn` short and never wait on the network inside it. `afterCommit(fn)` runs `fn` after the commit and before `transaction` resolves, never after a rollback, and at once outside a transaction; a callback that throws is logged, not thrown. Cache, `memory`, outside calls and `listenPost` listeners, live sync included, are not part of the transaction: the listeners run after the commit. A task the transaction started without awaiting never joins it once it has ended. `@Transaction()` from `akanjs/server` is deprecated in favour of `this.transaction`.
  - **Writes that keep `updatedAt`.** `{ touch: false }` leaves `updatedAt` as stored, so bookkeeping such as a lease heartbeat or a mirrored snapshot no longer reads as an edit in `updatedAt` periods and sorts. Query-level writes take it in their options (`updateOne`, `updateMany`, `updateById`) or as `.set(update, { touch: false })` on the generated `update<Filter>` / `updateOne<Filter>`, and run no hooks, as before. The document path takes it as `doc.save({ touch: false })`, `pickAndWrite(id, data, { touch: false })` and `pickOneAndWrite(query, data, { touch: false })`, with save hooks and live sync running as usual.
  - **Conditional `upsertById`.** `upsertById(data, { where })` writes over a stored row only when that row matches `where`, and never over a removed row unless `withRemoved: true` is passed too; an id no row holds is inserted. It is one statement on SQLite and Postgres, so a writer whose lease lapsed cannot land over a newer row, or bring back a removed one, between its check and its write. With `where` it answers `updateOne`'s result: `modifiedCount` is 0 when the stored row did not match, and `upsertedId` is set when it inserted. `where: {}` writes over any live row and refuses a removed one. Without `where`, `upsertById` writes as before.
  - **Env transform.** `option.transformEnv(fn)` in a lib's or app's `lib/option.ts` rewrites the server env once, as the server is built and before any option, lib or `env(...)` injection reads it. It runs in every replica, in `bun main.js ops …` and in the test server; each lib's transform runs in mount order and the app's last, each given what the one before returned. `fn` gets a copy, so code that imports the env module itself still reads its values.
  - **MCP curation and tests.** `option.setMcp()` takes `excludeSignals` and `excludeEndpoints`, which keep a whole signal or single entries, generated ones included, off `/mcp`'s `tools/list`, `tools/call` and views while HTTP still serves them. The lists from every lib and the app add up. The boot log reports each exclusion and warns about a name that matches nothing served. `akanjs/test` exports `getServedMcpCatalogue({ as, ui })`, the tools and prompts the running test server's `/mcp` lists a guest or a test agent's account across every page, with `findTool`, `undescribed` and `listingCost`; `ui: true` gives the listing of a client that draws MCP Apps views. `TestServer#servedMcpCatalogue` does the same for a server you start.
  - **In-page agent.** The agent is told that `navigate` and `goBack` replace the screen's tools, which arrive on its next turn, so a navigation ends the turn. An unknown tool name is answered with the tools listed now, noting when the screen changed under the call. `navigate` reports where a redirect or the not-found page actually took it, and answers a path with no route with the paths the screen links to. `OpenaiLlm` with `host` set to `https://api.openai.com/v1` keeps image input, as with no host, and `OpenaiLlm.acceptsOf(llmOption)` lets an app's own chat-completions adaptor claim the same.
  - **Faster pages.** Server-rendered HTML and RSC flight responses are compressed with brotli, or gzip for a client that takes only gzip, as they stream; the shell still reaches the browser before the render ends, and a disconnect still cancels the render. The akanjs.com home page drops from 444 KB to about 48 KB. Behind the gateway each replica compresses for the client's `Accept-Encoding`, and the gateway relays its bytes. Text responses from the web routes — `public/` files without a `.br`/`.gz` sidecar, `robots.txt`, `sitemap.xml`, the CSR shell — are compressed the same way, and a page in the HTML result cache keeps its compressed bytes, which `AKAN_HTML_RESULT_CACHE_MAX_BYTES` now counts. Every compressible response varies on `Accept-Encoding`, compressed or not. A page no longer carries its locale's dictionary in the RSC flight: a build writes one immutable module per locale, `/_akan/dict/<lang>-<hash>.js`, which the page preloads and a navigation into another locale loads before it commits. `akanjs/common` and `tailwind-merge` load once from the import map, recipes build on `tailwind-variants/lite`, and a server-rendered page no longer loads react-spring or the native plugins. A font in `rootLayout().fonts([...])` takes `preload: false`, loading when text first uses it. A `public/` file is served with `stale-while-revalidate=86400` beside its 5-minute `max-age`.
  - **UI exports.** `akanjs/ui` exports `SelectLanguage`, `ThemeToggle` and `DevModeToggle` by name; import them that way in a `"use client"` file, where `System.ThemeToggle` bundles the whole app shell. `akanjs/client` exports `isNativeApp`, `isNativeShell`, `nativePlatform`, `desktopPlatform` and `openExternalUrl`. `fetch.instance.connectOnUse()` is the socket's new default mode.
  - **View modal in the URL.** `Data.ListContainer` and `Model.AdminPanel` take `viewInUrl`, which keeps the open view modal in the URL as `?action=view&modelId=<id>` beside the page's other params: a link carrying them opens that record whether or not the loaded page lists it, a link to another record replaces the open one, and an id that fails to load closes the modal and drops them. They also take `renderViewTitle`, the view's own title (`false` drops its title bar). The view's bottom bar carries the record's `actions` other than "view", with labels: "edit" opens the edit form and goes back to the view when it closes or saves, "remove" asks the row's confirm and then closes the view, and a function form is asked with the record and its place on the loaded page (-1 when unlisted); `viewActions={false}` turns the bar off. The container draws one view modal, not one per row. `Model.ViewModal` draws a title bar only when given `renderTitle` and an action bar only when `renderAction` answers something other than `null`, and without an `id` opens for whichever record `view<Model>` loads. `Data.Item` cards are more compact.
  - **Desktop updates, protocol v2.** Desktop apps built with 3.1.1 read `<url>/<os>-<arch>/<channel>/app.json`, the signed envelope phones read: they trust every key of `native.updates.publicKeys` except `revokedKeys`, apply the revocations a release carries, and take only releases made for their own native target. `akan publish-update --revoke` and `--reset-sequence` work for desktop releases. For apps built with 3.1.0, `publish-update` still writes `<channel>.json` and `.sig` when the first key signs, and warns when a release is invisible to them.
  - **Desktop apps update themselves.** About 30 seconds after it starts and every hour after that, a desktop app looks for a release on its channel and downloads it in the background. As the app quits, the download moves into place without a relaunch, and the next launch runs it on trial, so a release that fails still rolls back. A quit while a release is on trial installs nothing, a debug build never updates itself, and on Windows and Linux only one running copy of an app without single-instance updates itself. `native.updates.automatic: false`, or a target's `updates.automatic`, leaves it all to the app's own `updates` calls. `updates.download()` called while a download runs, the background one included, now answers with that download instead of rejecting with `CANCELLED`.
  - **`akan push-update --platform desktop`** (or `macos`, `windows`, `linux`, with `--arch arm64|x64`) uploads to the Akan Cloud project the release `publish-update` last signed, unchanged: the envelope, the archive and the patches it names, the old pair when it is the same release, and a `release.json` naming the CLI version, the build time and the app's signer (the macOS Team ID, the Windows Authenticode subject, or none). The envelope must verify against the target's keys. The command prints whether the project published, staged or rejected the release, and the URL installed apps read. A desktop release can be up to 1 GiB.
  - **Desktop secrets.** A desktop app's carried server keeps a secret the user gives it, such as their own API key, with `NativeSecret.set(key, value)`, `get(key)` and `remove(key)` from `akanjs/server`, which ask the shell that started it. The shell keeps them encrypted in the server's data folder, with the key in the macOS Keychain, the Windows Credential Manager or the Linux Secret Service, under a store of the server's own (a debug build has its own), apart from the page's `secretStorage`, so no page script reads them. On macOS without a Team ID, any program of the same user can read that key through `security`. A read during the server's boot waits for the window, so read a secret when a request needs it. Anywhere but a carried server, `NativeSecret.available` is false and every call rejects without sending anything.
  - **`akan test <target> [files]`** runs only the comma-separated test files or folders you name, read from the target or the workspace root; it is the way to run one signal test. Outside production, a server or test started inside `apps/<app>` or `libs/<lib>` without `AKAN_RUNTIME_DIR` keeps its sockets and logs in the workspace root's `local/<apps|libs>/<name>/runtime`, where `akan test` and `akan start` put them, and leaves a live dev server's log socket alone.
  - **Locked images.** `akan build` writes a `bun.lock` beside the image's `package.json`, cut down from the workspace's lockfile to what the server needs with every locked version and the root's registry `overrides` and `resolutions` kept, and the generated Dockerfile installs it with `bun install --production --frozen-lockfile`. A workspace without a text `bun.lock` gets a warning and the unlocked install as before; a hand-written `docker` string adds `--frozen-lockfile` itself, and `patchedDependencies` and a pin to a path or a workspace package are not carried.
  - **`akan create-workspace`** puts `@akanjs/cli` in the new workspace's `devDependencies` at its own version, and `akan update` moves it with `akanjs` and `@akanjs/devkit`. `--dir` is resolved against the current directory, so `--dir /abs/path` creates `/abs/path/<name>`.
  - **`akan login`** saves the session as soon as the cloud hands it out and reads the account with retries, so a failed read no longer loses it. Network errors are retried with backoff and reported, a 4xx refusal other than 408 or 429 ends the wait with the cloud's reason, and a session the cloud does not take is cleared with a message to sign in again.
  - **Version mismatch.** When `akan`'s version differs from the workspace's `akanjs`, the warning names a command that fixes it: the same command through the matching CLI (`bunx -p @akanjs/cli@<akanjs version> akan …`, or `bunx akan …` when the workspace pins that CLI), plus `akan update` when the CLI is the newer one. It no longer prints for `akan update`, `akan create-workspace`, `--help` or `--version`.
  - **`akan verify [targets]`** syncs, lints with fixes, typechecks, fast-builds and checks SSR over what git reports as changed, in one run, and prints one header line plus one line per diagnostic, repeats folded, errors first, at most 20 (`--max <n>`, `0` for all). With no target it covers the changed files under `apps/`, `libs/` and `pkgs/`, typechecking a changed library too and a framework package against its own `tsconfig.json`. The build runs only when nothing failed before it. Each code comment added since the last commit is an `akan.comment.added` warning. `--files` replaces the git scope, `--lint-only` and `--no-build` shorten the run, `--format json` prints one JSON line, and it exits 0 on a pass, 1 on a failure and 2 on an unknown target. `akan code` runs it for its `akan_verify` tool and end-of-turn check, so a typecheck error now reaches the model, and `akan workflow apply` and MCP `run_validation` validate with it, typecheck and build included.
  - **Agent guide.** `AGENTS.md` keeps only the rules that apply everywhere, under 12 KB instead of about 83 KB, and lists 16 path rules and 16 skills that load only when they apply: Claude Code reads `.claude/rules/akan/<area>.md` and Cursor `.cursor/rules/akan-<area>.mdc` when a matching file is touched, and the procedures sit in `.claude/skills/akan-*` and `.agents/skills/akan-*`, whose `references/` hold the full guidelines. A rule a lint plugin or gate enforces names its check, and the Work Loop checks with `akan verify` and, after a page, UI or runtime change, `akan preview`. `akan agent install` gains the targets `rules`, `skills` and `hooks`, and `--check` writes nothing, lists the files install would create, change or remove, and exits 1 if there are any; it ignores the version stamp, so it fits a CI step. A generated file carries `<!-- akan:generated -->`: a file without it is yours, never removed and overwritten only with `--force`, and generated files a newer CLI no longer produces are removed. `akan doctor` warns with `agent-guide-oversized` when `AGENTS.md` plus the largest app or library `AGENTS.md` pass 80 % of the 32 KiB Codex reads, and with `agent-guide-leftover` for the old `docs/` guides. A new workspace's `.gitignore` keeps `.claude/settings.local.json`, `.claude/worktrees/` and `.claude/scheduled_tasks.lock` out of git. The `workspaceOnboarding` guideline is removed.
  - **Claude Code hooks.** `akan agent install hooks` adds opt-in hooks to `.claude/settings.json`, keeping every other hook there: an edit to a generated file is refused with a pointer to its source, an edited file is linted with fixes and a remaining error sent back, and before the session stops what it edited is checked with `akan verify`, a failure or an added comment sent back once. `all` never installs them.
  - **`akan preview <app> [paths]`** opens each page in a headless browser and prints one verdict line per page (`ok`, `warn` or `FAIL`) with its status, title, load time and where a redirect landed, then its uncaught errors, the server errors logged while it loaded, console errors and warnings, and layout problems; it exits 1 when a page failed. A page fails on a 4xx or 5xx, an empty body, the server's error page, the dev build overlay, an uncaught or console error, a server error or a timeout, and warns on a console warning, a page wider than the viewport, text the colour of its background or a dropped daisyUI colour class. It reuses this checkout's dev server on the app's port, or starts `akan start <app>` and stops it afterwards (`--keep` leaves it running; its output goes to `local/apps/<app>/runtime/preview/server.log`). Paths are comma-separated, a path without a locale gets the default one, and `--changed` adds the pages uncommitted page and layout changes reach, `/` when no route changed, at most 8. `--csr` boots each page as a native app does, `--desktop` uses 1280×800 instead of 390×844, `--screenshot` saves a PNG, `--timeout` defaults to 60 seconds and `--format json` prints the full report. The engine is Bun.WebView: WebKit on macOS, so nothing is downloaded, and an installed Chrome or Chromium elsewhere (`--engine`). `@akanjs/devkit/preview` exports `PreviewView` and `PreviewChrome`, and the `akan code` preview check now reports console warnings too.
  - **Client errors in the dev log.** In `akan start`, every page the dev server serves, in a browser, a CSR boot or a native shell, reports its uncaught errors and unhandled rejections, logged as `ClientReport` error records naming the page, its boot and a native shell's platform and target, so `akan logs` and the dev terminal show them. A page reports at most 50, with control characters stripped.
  - **`akan context --app <app>`** lists the app's routes: path, file, search keys, and whether a guard applies, its own or a layout's. Past 60 routes the largest folders fold into one line each; `--format json` lists every route.
  - **Size and write gates.** For an app or library, `akan lint` fails on what no check caught before, and each failure names its rule and, where one exists, the `akan workflow plan …` command that builds the right shape:
    - **Size** (`akan.size.file`, `akan.size.component`): a `Zone`, `Util`, `Template`, `Unit`, `View`, `*.store.ts`, or `ui/` / `webkit/` file over 400 lines; a service or document over 500; an abstract over 300; a component or hook over 250.
    - **Store reach** (`akan.component.store-access`): a component or hook reaching `st` more than 16 times, form setters aside.
    - **Where a write starts** (`akan.write.placement`): a `fetch.<mutation>` outside a `*.store.ts`, or a writing `st.do.*` in `ui/` or `webkit/`, which take the write as a prop or hook argument instead.
    - **Chained writes** (`akan.store.multi-write`, `akan.store.root-write-chain`, `akan.component.write-chain`): two or more writes, or one per item in a loop or a `map`, sent by one store action, store `static` or component or hook handler, directly, through a sibling action or through another store via `RootStore`. Exclusive paths count apart, and a retry or a poll counts its write once.
    - **Per-item service calls** (`akan.service.call-in-loop`): a service method an `endpoint` or `slice` reaches that calls a service, a model or a generated query once per item. `internal` jobs, counted loops and a `get<Model>` / `load<Model>` in a `map` callback, which the DataLoader batches, are spared.
  - **Baselines.** `akan quality baseline` writes an `akan.baseline.json` at each app or library root that needs one, recording each breach under its rule with what was measured (`--force` rewrites one). After that `akan lint` fails only on what grows or is new, and lowers an entry as its code shrinks. It refuses a baseline that adds or raises an entry against its copy at the default branch's fork point, and with `--no-fix` one above what the code measures. A size, store-reach or per-item entry may be added or raised when its key carries a `reasons` line; the write rules take no exceptions. `akan quality scan` counts each app's adopted debt and reasoned exceptions (`akan.baseline.exceptions`), and `libs/shared` and `libs/util` ship their own baselines.
  - **Write-path workflows.** `akan workflow plan add-mutation` builds a whole write path in one apply: the document chain method, the service method, the mutation, a one-line store action, the dictionary entry and signal test stubs. `--guard` is required and checked against the guards the target reaches, `None` refused, and a name another reachable module claims is refused as the server would refuse it at boot. `--with <ref>.<method>` runs other writes inside the mutation's `this.transaction()`, `--after <ref>.<method>` runs side effects in `this.afterCommit()`, and either is refused when the workflow cannot supply its arguments. Under a guard that only checks sign-in, the service method gets a `TODO` for the acting user's right to the record and the tests a refusal to fill in; a `Public` mutation gets a rate limit. `akan workflow plan create-interaction` creates a `webkit/use<X>.tsx` hook over a pure `common/<x>.ts` class and its test, for drag, selection, keyboard and layout logic that would otherwise grow inside a component.
  - **Lists past 500 rows.** A client list asked for more than 500 rows is still served 500, and the server now logs it once per list. The lint rule `no-oversized-list-limit` fails on a literal limit above 500 in `fetch.<model>List<Suffix>(…, skip, limit)`, in `{ limit }` passed to `fetch.init…`, `st.do.init…` or `st.do.refresh…`, and in `st.do.setLimitOf…`. A store list asked for more than 500 reads `hasMoreOf…` as true after a full 500, so `loadMoreOf…` fetches the rest instead of stopping.
  - **`akan quality scan`** also warns about a `lib/` module or `ui/` entry whose comments pass 1 % of its lines once it holds five (`akan.comment.density`), a `// deprecated` comment that should be a `/** @deprecated */` tag (`akan.comment.deprecated-marker`), an export in an app's `common/`, `webkit/`, `srvkit/` or `ui/` that only tests use (`akan.global.test-only-export`), and a `*Kind` / `*Type` / `*Mode` enum value compared in three or more files outside its module (`akan.global.kind-branch`).

  **Fixes**

  - `save()` on a document of a model with a `field.secret` field, or one read with a `select`, writes only the fields it changed, as for any other document, and after `refresh()` too. It wrote back every field the document held, undoing what another write changed in between, such as a counter's increment or a status move. A field the read left out is written only when you set it. Outside production, saving a document that was never read, which still writes every field it holds, logs a warning once per model.
  - A pubsub publishes `0`, `false` and `""`, which it dropped with `Failed to serialize data`; a `{ nullable: true }` pubsub (or one returning `Any`) delivers `null`, and publishing `undefined` to it delivers `null`.
  - An endpoint's answer keeps the `""` a nullable `String` field holds, so a field declared `field(String, { default: "" })`, in a model or an embedded scalar, reaches the client as `""` rather than `null`. An argument or input left `""` is still sent as not given.
  - A `router.push`, `router.replace` or `router.enterDeepLink` called before the router is initialized, as from a page's mount effect, waits for it instead of throwing `Router is not initialized`.
  - `fetch.ws` listeners on `"connect"` and `"disconnect"` fire. The `.reconnect()` overlay runs only where `AKAN_PUBLIC_ENV` is `local`.
  - In the browser, a Korean `RecentTime` or `dayjs().locale("ko")` no longer falls back to English after hydration.
  - A server-rendered page's client components read their own request's locale and path while other requests render, and an `x-locale` header counts only when it names one of the app's locales.
  - `usePageLocation()` on an SSR page reads the URL's query, so `?filter=` links, the dashboard's selected tile and `viewInUrl` see it. It read none there: the SSR page wrapper carried no search params and never followed a shallow replace. The server render now reads the request's query and the base store starts from the address bar, so the first browser render matches it; the pathname stays the one the page was rendered for.
  - A HEAD request to a page, or a request the page redirects after its render has started, no longer logs `[SSR] render failed`. The status and `Location` it answers are unchanged.
  - The built-in 404 page hydrates without a hydration error in an app whose root layout sets `.theme("dark")` or `.theme("light")`, which put a `data-theme` on `<html>` the 404 document never named.
  - The `Clipboard` button from `akanjs/ui` has an accessible name, `base.copy`.
  - A toast shown with a `duration` of 0 or less, such as `msg.loading(key, { key, duration: 0 })`, stays until a toast with its `key` replaces it or the user closes it. It disappeared at once.
  - In `Data.ListContainer` and `Model.AdminPanel`, editing a record the loaded page does not list opens the edit form, where it opened nothing. A dialog whose title or action slot goes away no longer keeps showing the last one.
  - A streamed API response is no longer buffered whole before it is sent: from the producer's first pause it streams out compressed. A body complete when the handler returns is compressed with its length as before, and a stream that passes 4 MiB before its first pause is sent uncompressed. `application/wasm` is compressible, and a `.br`/`.gz` sidecar beside a `.wasm` in `public/` is served.
  - A plain GET on the websocket path answers `426 Upgrade Required` instead of `500`, at the gateway too, so a crawler or an uptime probe no longer counts as a server failure.
  - A fetch client created after another in the same process, such as a lib's on the server, finds the endpoints the earlier one registered.
  - A service declared with `serve(..., { serverMode })` is enabled or not by the `SERVER_MODE` in effect when the server boots, not when its module is imported.
  - A desktop app whose carried server gives up during a trial before the window opens quits into the previous release instead of waiting behind the alert, and until it restarts it offers, downloads and applies nothing, so it can no longer move the rolled-back release back. A rollback whose file moves failed keeps the release it moves back, and the tries it counted, for the next start. An app is never offered the release it was built from.
  - A macOS desktop app no longer takes minutes to download an update while its window is hidden or covered: `download()` holds an App Nap activity until it ends, through the shell's new `activity.begin` / `activity.end` ops, which still allow idle system sleep.
  - In `akan code`, a sub-agent started by `task` runs on the model the session is on, the one `--model` or `/model` chose, with that model's `models.json` entry. It ran on `deepseek/deepseek-flash` whenever DeepSeek had a key.
  - `akan push-update` exits 2 when the project rejects a release or refuses it with a `release.error.*` key, for phone packs too, and every 400 refusal prints the data it carries.
  - A workspace that typechecks code reaching `@akanjs/devkit/akanConfig`, `/pipeline` or `/mobile` no longer fails with `Cannot find module '@akanjs/native/api'`.
  - `akan lint`, `akan typecheck` and every sync that formats generated files run where only Bun is installed, and `akan lint <app>` passes for an app whose libs carry env modules.
  - A new app's `tsconfig.json` no longer names the Next.js TS plugin or `.next/types`, a new workspace's `bunfig.toml` no longer loads `bun-plugin-tailwind`, and `akan doctor` warns (`config-leftover`) about those lines in an existing workspace.
  - When a desktop app quits and its carried server outlasts the grace, the shell waits for the killed server to exit, so on Windows the server's files are no longer still locked after the quit.
  - On Windows, `akan verify-dist-package` names a dist file with `/` and leaves out its `node_modules`, as on macOS and Linux.
  - In `akan start`, a tab's hot-update socket connects through the dev gateway again. Under Bun 1.4.4 the replica refused it, so a save no longer reached an open tab.
  - A desktop or iOS build no longer stops when the file `android.googleServices` names is missing. Only an Android build reads it, and that build still stops without it.
  - On macOS, `akan start` measures the dev builder against `AKAN_BUILDER_MAX_RSS_MB` by the memory it holds, as the builder reports it. Pages it already freed no longer count, so a builder that gave memory back is no longer replaced, and a fresh one no longer makes a low ceiling look unmeetable.
  - A workspace, app, library, package, module, service, scalar, CRUD page or migration the CLI creates is written as Biome prints it, as are the `.mcp.json` and `.cursor/mcp.json` that `akan mcp-install` writes, so the first `akan lint` no longer rewrites files nobody has touched.
  - A new app in a workspace created with `--libs true` imports `Auth` from `@libs/shared/ui`. Its root layout imported `@shared/ui`, a name nothing in the workspace resolves.
  - `akan workflow apply` of `add-enum-field`, or of `add-field --type enum`, works on the sample `task` module a new workspace ships, where it failed with `primitive-post-edit-dictionary-verify-failed` and wrote nothing: the enum block landed inside the dictionary's header comment. `akan workflow plan add-field` takes `--surfaces template,unit` and `--include-in-light`, the inputs `akan workflow explain add-field` lists, and explain prints each camelCase input's flag beside it.

- Updated dependencies [39d5902]
  - akanjs@3.1.1

## 3.1.0

### Minor Changes

- ce817b6: A module's `serve(ref, { operationMode: ["edge"] }, …)` mounts only in the operation modes it lists, and `modules: ["@edge"]` / `AKAN_MODULES=@edge` names every module that lists edge; a selection now also mounts the targets of its modules' relation fields. `native.desktop.server` takes `{ profile, modules }`: `profile: "edge"` bundles `env/env.server.<env>.edge.ts` in place of the environment's own file, which no longer reaches the computers the app is installed on, and the build refuses a profile file whose secret-named keys hold a value; `akan build <app> --profile edge` does the same for an image. Machine tokens: `MachineToken.issue({ kind, id, version })` signs an Ed25519 JWT with `AKAN_MACHINE_PRIVATE_KEY` (`akan machine-keygen <file>` writes one), a server with that key or `AKAN_MACHINE_PUBLIC_KEY` sets `account.machine` from a verified token on HTTP and websocket calls and strips any other, and `.with(Machine)` reads it.
- ce817b6: `akan build-desktop` and `akan publish-update` sign only with `--sign` and notarize only with `--notarize` (as does `akan-native build` / `update publish`): `AKAN_NATIVE_MACOS_*` and `AKAN_NATIVE_WINDOWS_*` name the identity and no longer decide to use it, and a build that finds them set without the flag says it is unsigned. A release build or `publish-update` of an app that carries its server, signed or not, first searches that server for every secret value of the workspace's server env files and refuses it with the file and key paths, and an env file it cannot evaluate stops the release; one line then names the identity and the service a signed app goes to. The SSR route bundle now takes the server env plugin too, so a build carries only its own environment's app env there and a profile build swaps the libs' env defaults in it as it does in the backend. `akan publish-update --arch arm64|x64` publishes a desktop release for another CPU into that CPU's feed folder.

  Upgrade note: signing and notarizing are opt-in. A CI that only sets `AKAN_NATIVE_MACOS_*` or `AKAN_NATIVE_WINDOWS_*` now builds and publishes unsigned macOS and Windows apps, after a line saying those variables went unused and a warning that the app is not signed, and an installed signed app refuses such an update. Add `--sign true` to `akan build-desktop` and `akan publish-update`, and `--notarize true` for macOS, to sign and notarize as before.

- ce817b6: The `external-view` native plugin (`akanjs/client/native/external-view`) shows a third-party page first-party over a desktop window: a browser profile of its own, navigation held to the origins it was opened for, an init script for the top document, `evaluate`, a trusted `sendKey`, `capture` of its content, `setMuted`, `clearData`, autoplay with sound by default, and `load` / `loadFailed` / `gone` (it reloads, and is rebuilt when its browser process ends, counting `restarts`) / `consoleMessage` (warn and up by default, with source and line, rate-capped) events — every method on Windows, most on macOS 14+. The `window` plugin adds `placeOnDisplay({ display | index, bounds, unit: "logical" | "physical", fullscreen })`, `setDecorations`, `setCursorVisible`, `setMinSize` and `create({ frameless })`, and `native.desktop.window.frameless` opens the main window without a frame. `AkanServer.start({ schedules: false })` runs no internal.
- 17aa243: `akan build` writes one single-file view per `.app()` to `mcp-apps/<name>.html`, beside `csr/`. The server reads it for that app's `ui://<app>/apps/<name>` resource. `akan start` writes the views to `.akan/artifact/mcp-apps/` when a host first reads one, and again after a save, without rebuilding the CSR bundle.

  - **What a view bundles.** The view bundles the app's page with its `.render()`, `.head()`, `.loading()` and `.guard()` replaced by functions that draw nothing. It therefore carries only the modules the page's `.app()` loads reach.
  - **Its root layout.** The view sits under the root layout that renders `System.Provider`. That layout's `McpAppRoot` gives it the theme, fonts and providers, and the `_overrides.tsx` over the page re-skin it as they do the page: one on the root layout's folder, or on a folder above it that holds no layout of its own, wraps that layout as it does on the web, so it also reaches the toasts and approvals the layout draws. A synced lib page, linked under `page/(libs)`, is trimmed like any other.
  - **Size.** A host loads one file, so a view inlines every module its loads reach, a `lazy(() => import(…))` included. The view build marks each `const X = lazy(…)` pure, so one that nothing renders — a barrel's, the page's own that only its `.render()` drew, or one an `_overrides.tsx` manifest's import brings in — is dropped with the module it imports. A `lazy()` called anywhere else stays.
  - **Names.** An `.app()` name must be a string literal that matches `^[A-Za-z0-9_-]{1,64}$`, on a chain written as the `export default` expression itself; a chain bound to a name and exported as `export default x` or `export { x as default }` fails the build. Two pages that declare one name fail the build, and so do two names that differ only in case, whose files would collide on a case-insensitive disk.
  - **Rebuilds.** Views are built aside and moved into place one file at a time, so a host that reads a view while `akan start` rebuilds them gets the previous view or the new one. A file the bundler emits beside a view reaches no host, so it is dropped with a warning.
  - A desktop server stage carries `mcp-apps/`. The font pruner keeps a font that only a view references.

- ce817b6: `akan sync` now refuses a test at the `lib/` root and a module test that is not named after the one module file it covers. A module keeps one suite per role (`chatMessage.signal.test.ts`, `ChatMessage.Zone.test.tsx`), so `chatMessage.trim.signal.test.ts` is refused just like `chatMessage.trim.signal.ts`. `akan quality scan` reports a test at the `lib/` root under `akan.layout.lib-facet-file`. Upgrade note: move a `lib/<model>.signal.test.ts` into `lib/<model>/`, fold every `<model>.<topic>.signal.test.ts` into `<model>.signal.test.ts` as a `describe` block, and move a suite that drives several modules into `srvkit/`, like `libs/shared/srvkit/guards.signal.test.ts`.
- ce817b6: A module's `*.signal.test.ts` / `*.service.test.ts` may import the runtime's `node:*` and `bun:*` modules (`no-import-external-library-in-test.grit`); third-party packages stay refused there.
- ce817b6: Phone web bundle updates move to protocol v2.

  - **Path:** a binary reads only its own native API's manifest, `<url>/<platform>/<channel>/<nativeApi>.json`, so two store generations on one channel each take their own fixes.
  - **Envelope:** that file is one envelope holding the manifest's bytes, the signer's `keyId` and the signature, so a CDN can never pair a new manifest with an old signature.
  - **Keys:** `native.updates.publicKeys` lists 1 to 3 trusted keys, the online signing key first. `publicKey` stays as the one-key form.
  - **Revocation:** a manifest can carry `revokeKeys`, plus `resetSequence` to recover from a polluted sequence. A key may revoke only keys listed before it, and a revocation is kept for good on the device.
  - **Publishing:** `akan-native update publish` carries the channel's revocations forward into each new envelope and refuses to sign with a key they revoke, so a routine publish never undoes a revocation.
  - **Store build:** `bundle.json` records the binary's update URL, key ids and `embeddedSequence`.
  - **Server-side helpers:** `openEnvelope`, `keyIdOf` and `updateDecision` are exported for a server that signs or registers releases.

  Desktop app updates keep protocol v1 and trust the first key.

  Upgrade note: no phone binary that shipped with `updates` reads the new layout. Rebuild the binary before publishing, and point a signer at the new path. `akan pack-update` writes a schema 2 template.

- ce817b6: CLI fixes for the OTA and Akan Cloud commands:

  - **One exit-code rule for the OTA commands.** `akan pack-update --against`, `akan push-update` and `akan register-binary` exit 2 when the pack needs a new store build. `push-update` also exits 2 when the project rejects the release. Any other failure exits 1. Each command's `--help` lists these codes.
  - **Akan Cloud refusals are read from the status and the whole response body**, so a server `Err` key is found wherever it sits in the body. When the server asks a pack commit or binary registration to retry, the CLI waits at least its `Retry-After`, and stops at once if that wait would pass the deadline. A storage PUT that gets a 429 or 503 also waits its `Retry-After`, up to a minute.
  - **Runner prompts fail fast when stdin is not a terminal.** This covers picking a script for `akan script`, installing a database mode's packages, choosing the scp env server, entering a Windows test target, going on past a platform test that did not pass, and confirming a `deploy-akan` publish. Each one used to read the piped input as its answer. Each now fails with what to pass or set instead.
  - **A malformed pipeline secret name is never echoed back** by `akan upload-secret` or `akan remove-secret`. Such a "name" is often a value pasted in the wrong place, and the refusal lands in terminal scrollback and CI logs.
  - **`deploy-akan`** writes each versioned `package.json` with its trailing newline, and so does the CLI dist.
  - **A template's static file** (an image or a font) is kept when the caller passes `overwrite: false`, which text files already did. Before, it was copied over the user's file.

  devkit adds `ExitCodeError` (a command exits with its code) and `assertPromptable(problem, { choices, remedy })` to `@akanjs/devkit/commandDecorators`. `@akanjs/devkit/cloud` gains `CloudHttpError` (status, whole body, headers), `PipelineSecrets` and `CloudUpdates`, and `@akanjs/devkit/mobile` gains `UpdatePackFolder`, the one reader and writer of a pack folder. Cloud `HttpClient` failures are `CloudHttpError`s, with the same message as before.

  Upgrade note: a CI step that answered one of the runner prompts above through stdin now fails. Pass the argument or set the value the error names.

- ce817b6: A phone web bundle release can start revoking an update signing key, and the config keeps the revocation.

  - **Start one:** `akan publish-update --platform ios|android --revoke <keyId,...>` (`akan-native update publish ios|android --revoke <keyId>`, repeatable) revokes keys of `updates.publicKeys`; `--reset-sequence` adds `resetSequence` to that release. `akan update-keygen` prints each key's keyId.
  - **Keep it:** `native.updates.revokedKeys` lists the keyIds every phone release revokes, so a release published from a fresh checkout still revokes them. A release carries `revokedKeys`, the channel's published revocations and `--revoke` together, and warns about a revocation the list does not hold.
  - **New binaries:** a phone build trusts none of the keys `revokedKeys` lists, though `updates.publicKeys` still holds them, so a fresh install never takes a release a revoked key signs. A config whose `revokedKeys` covers every key is refused. A desktop release signed with a revoked first key warns that installed desktop apps keep trusting it until a binary with another first key replaces them.
  - **Refused before the build:** a keyId the key ring does not hold, more than 16 revoked keys, `--reset-sequence` without a revocation, either flag on a desktop release, and a signing key the release revokes or that is listed before a key it revokes. The error names where the revocation came from and the key to sign with (`AKAN_NATIVE_UPDATE_KEY` picks its file).
  - **API:** `publishUpdate` and `checkPublishUpdate` take `revoke` and `resetSequence`, and `checkPublishUpdate` validates the `updates` settings too; `updateKeygen` returns `keyId`. The native build API is 0.12.0.

  Upgrade note: the akan CLI needs native build API 0.12.0, so install matching versions of akanjs and @akanjs/cli; an older one is refused.

- ce817b6: Fixes for over-the-air updates on a phone, plus the upload commands they were missing.

  - **Hung releases:** a release on trial whose page hangs in a script now rolls back while the app runs.
    - The ready timer starts with the page, not when it finishes loading.
    - A page that does not answer gets a fresh renderer: a new web view window on iOS, an ended renderer process on Android.
  - **Downloads:** update downloads ask for `*/*`, so a CDN that injects scripts into HTML responses can't change the signed bytes.
  - **Inlined dictionary:** the dictionary a build inlines into the client bundle is key-sorted, so the same commit gives the same bytes.
  - **`native.devtools: true`:** opens the web inspector of a release build, for an internal test target only.
  - **`akan push-update <app> --platform`:** packs an update and uploads it to the Akan Cloud project, which signs and publishes it.
    - The pack goes straight to the project's storage, so a proxy's request time limit can't cut off a large one. Only the files the pack's manifest lists go up, though a pack folder keeps every earlier pack's files.
    - `--pack <dir>` uploads a folder `akan pack-update` already wrote instead of packing again, so one pack built in CI can be checked, then uploaded as it is.
    - It exits 2 when the pack needs a new store build or the project rejects it, and stops without retrying when the project says the upload was already used.
  - **`akan register-binary <app> --platform --distribution`:** registers the store build `release-*` made, with a pack of the same commit, which goes up and stops the same way. It refuses when the two provide different native APIs.

- ce817b6: `updates.report: { url }` has a phone post what became of each web bundle release, so whoever publishes sees rollback rates.

  - **Events:** downloaded, applied, confirmed, rolled back (timeout, relaunch, hang, failed check at start) and failed (download, file hash, disk, signature, manifest).
  - **When:** at the next launch or return to the foreground, 20 to a request. Events wait until the server takes them, at most 100.
  - **Identity:** a random install id that lasts as long as the install, not a device identifier, and nothing about the user.
  - **Store builds:** `bundle.json` names the address, so a server registering the binary can check it is its own.

- ce817b6: `akan pack-update` records each pack in `<out>/pack.json`: app, target, platform, env, channel, app id and version, native API, web hash, file count and size. With `--against`, the record also carries the compatibility result. A pack that needs a new store build now exits 2 instead of 1, after writing `pack.json` and `compat.json`; any other failure exits 1 and leaves no `pack.json`. The same commit, env and target pack to the same bytes.

  That last guarantee needed an akanjs fix. A library's generated `getSerializedSignal` macro read every signal any other client in the build process had applied, so whether a lib's chunk carried the app's whole registry depended on Bun's transpiler cache. The macro and `FetchClient.from()` now read `ownSerializedSignal`, the signals a client was built with. Merged signals no longer keep keys set to `undefined`. Run `akan sync` to regenerate `lib/sig.ts`.

  Upgrade note: a CI step that took exit 1 from `akan pack-update --against` to mean "needs a new store build" checks for 2 now, since 1 is any other failure. Run `akan sync` once on every app and library, so its generated `lib/sig.ts` reads `ownSerializedSignal`.

- ce817b6: An app's pipeline can ship its native web bundle over the air: `{ use: "ota", targets?, platforms? }` runs after `deploy` in its own `ota` phase, followed by an `after-ota` slot. It is opt-in, so an app without it runs build → docker → deploy as before. By default it packs every native target that declares `native.updates` for both iOS and Android, and a named target without `updates` is a plan error. The plan's step carries `with: { app, targets, platforms }`, and `akanjs/common` exports `pipelineOtaPlatforms` and the `PipelinePlanOtaStep` type. An executor parsing plans with an older `akanjs/common` refuses a plan that holds `ota`.
- 8ba25ec: Data migrations: a change that reshapes stored documents ships a script in `apps/<app>/script/migration/`, which every environment runs the same way.

  - **`akan create-migration <name> <app>`** writes `script/migration/<yyyyMMddHHmm>_<name>.ts`, a default-exported `migration(title)` from `akanjs/server` with empty `.plan()`, `.apply()` and `.verify()` stages, which also takes `.param()`, `.rollback()` and `.config()`. A migration writes only through `table(refName)`, which records every value it changes.
  - **`akan migrate <app> [list|plan|apply|verify|rollback] [id]`** runs them locally, and `bun main.js ops migrate` takes the same arguments in a built image. `plan` prints a `planHash`, and `apply --expect <planHash>` refuses when the data changed since that plan was reviewed. `--json` prints the result as the last line, even when the command line itself is refused; the exit code is 0 on success, 2 when the command, a parameter or the id is wrong, 3 when verify finds problems (an apply's changes stay committed), and 1 otherwise.
  - **Runs are recorded in the app's own database** (`_akan_migration_run`, `_akan_migration_change`) under a lease, so one runs at a time; `db-export` and `db-import` carry them along, and no insight query can read them. `rollback` restores what an apply changed, deletes the rows it inserted or copied, skips a row edited since, and still works once the script is deleted, then with the default undo. `.config({ transaction: false })` commits as it goes, and a failed run is left `partial` to resume.
  - The generated `server.ts` exports a `migrations` manifest of that folder, and the `Err` lint rule leaves `script/migration/**` alone, since an operator reads its messages.

- ce817b6: Apps declare their build pipeline in `akan.config.ts`. `pipeline: { stages, env, after }` in an app's config lists its stages in order — the built-in `{ use: "build" | "docker" | "deploy" }` actions plus shell stages (`{ name, sh | steps }` with `when`, `env`, `secrets`, `timeout`, `retry`, `allowFailure`) — and an app without one runs build → docker → deploy as before. A new workspace-root `akan.config.ts`, typed `WorkspaceConfig`, holds the stages around every app: `pipeline: { before, after, post, env, timeout }`, with `parallel` and `matrix: "apps"` stages. `akan pipeline dry-run | validate | plan` turns both into the plan Akan Cloud runs, locally and without running anything; it exits 0 with a plan, 1 with an envelope of errors and 2 for anything else. `akanjs/common` exports the plan schema and its strict parser (`PipelinePlanSchema`).

  `akan upload-secret <NAME>`, `akan list-secrets` and `akan remove-secret <NAME>` manage write-only pipeline secrets per project, optionally per branch (`--branch debug|develop|main`). A value comes from `--file`, piped stdin or a hidden prompt, never from an argument. A step lists the names it reads in `secrets`. Anyone who can push to the repository can make a step print a secret, as with GitHub Actions secrets.

  Upgrade note: `akan.subspace.ts` is no longer read. Move its content under `subspace` in the workspace-root `akan.config.ts` (`const config: WorkspaceConfig = { subspace: { … } }`). The root config never travels to a subspace.

  Upgrade note: delete `akan.subspace.ts` after moving its content. `akan subspace push` and `akan subspace pull` refuse while it is still at the workspace root, and a push removes any copy of it from the subspace.

- ce817b6: `@akanjs/devkit/subspace` keeps the push and pull flow; its report text moved to `SubspaceReport` (`@akanjs/devkit/subspaceReport`) and its work on a subspace's clone to `SubspaceClone` (`@akanjs/devkit/subspaceClone`).

  Upgrade note: code that imported these from `@akanjs/devkit/subspace` reads them from the new modules:

  - `formatSubspaceStatuses`, `formatSubspacePushResults`, `formatSubspacePullResult`, `formatSubspaceEnvUpload` and `formatSubspaceDiff` are `SubspaceReport.statuses`, `.pushResults`, `.pullResult`, `.envUpload` and `.diff`.
  - `Subspace.anchorFile`, `memberDirs`, `subspaceOwnedDirs`, `secretsMarkers` and `holdDir` are static fields of `SubspaceClone`.
  - `Subspace.workspaceOnlyEntries` is gone; `Subspace.retiredConfigFile` names the file a subspace never receives.

- ce817b6: `akan subspace plan <name>` prints what `akan subspace push` would ship, worked out from the checkout alone — no fetch, no remote, no clone: the apps and the libraries their closure pulls in, the file count, which workspace-root entries are pushed, excluded or left to the subspace's own copy, the root dependencies pruned from its manifest, and anything that would make a push refuse: a dirty working tree, a leftover root `akan.subspace.ts`, a branch outside `pushableBranches`, or a `bun.lock` resolving from a loopback registry, read from `HEAD` (`git show HEAD:bun.lock`) as a push reads it. It exits 1 when any of them is there. `--format json` prints the same as data. `akan subspace push` and `pull` also refuse while a root `akan.subspace.ts` exists.
- ce817b6: `akan typecheck` takes a library too (`akan typecheck <lib>`: its `server.ts`, `client.ts`, `index.ts` and pages), and checks the target's own `*.test.ts` / `*.spec.ts` as well, which nothing imports and Bun runs unchecked; `--tests false` leaves them out, and a build's typecheck phase still does. Each mode keeps its own tsconfig and incremental cache under `.akan/typecheck`. Upgrade note: `akan typecheck` now checks tests and specs by default, so type errors they already had can fail a CI run that passed before; fix them, or pass `--tests false` for the old scope.
- ce817b6: A desktop app's carried server takes `desktop.server: { env, restart, watchdog }`: variables over the image's (secret-named ones and the stage's own refused at build), `restart: "forever"` or a count of crashes before giving up, and a health-route watchdog that restarts a hung server. `desktop.webview2: "standalone"` embeds the whole WebView2 Runtime in the Windows setup. `updates.setChannel({ channel })` moves an installed desktop app to another manifest, and `akan publish-update --upload s3://<bucket>/<prefix>` uploads the release, its manifests last. Fixes: `Model.New` opens under its own `modal`; two `Model.New`s of one model on different slices open only the pressed one's form; the top inset slots clip at a 0 inset and follow iOS's keyboard pan; `Layout.BottomTab` matches tabs by segment with per-tab `exact` and `match`, keeps the badge under `renderTab` and marks the current tab `aria-current="page"`; a multipart mutation's other body args arrive typed as in a JSON body.
- ce817b6: The workspace-root `akan.config.ts` takes `cloud: { host }`, the cloud the CLI uses when a command names no `--host`. This lets a workspace on a self-hosted Akan Cloud skip passing `--host` every time. It applies to login, env, secret, subspace and tunnel commands. The host must be https, or http on this computer.

### Patch Changes

- b1165ba: `AKAN_BUILD_METAFILE=1 akan build <app>` writes the bundler's metafile for each backend entry (`main`, `server`, `rscWorker`, `console`) to `local/build-meta/<app>/<entry>.json`, which says which inputs put how many bytes into which output. Outside `dist/`, so an image never carries it, and off by default, since a server metafile is the size of its module graph.
- bb71ed3: `akan build` bakes into its page and CSR bundles the `AKAN_PUBLIC_REPO_NAME` and `AKAN_PUBLIC_SERVE_DOMAIN` its Dockerfile carries, read from the workspace `.env` as `AKAN_PUBLIC_ENV` already was. A shell that exported a different value used to win in the bundles alone, so a cloud CSR bundle or native app dialed `<app>-<env>.<the shell's domain>` while the image served the `.env`'s. When the `.env` outranks a value the shell exported for one of the three, the build now says which ones and what it used (`AKAN_PUBLIC_ENV` from `--env` excepted).
- 2082ccd: Akan.js now requires Bun 1.4.4: every package's `engines.bun` reads `>=1.4.4`. akan-native's doctor fails on an older Bun and warns on any other, with `bun upgrade --version 1.4.4` as the fix. Before 1.4.4, bun:sqlite counted the rows a full-text index's triggers wrote, so `updateManyByQuery` and `removeManyByQuery` on a model with search fields reported far more `matchedCount` and `modifiedCount` than the documents they changed.

  Upgrade note: 3.0.2 accepted Bun 1.4.0; run `bun upgrade --version 1.4.4` first.

- 8ba25ec: A failed `akan typecheck` or `akan build` prints its diagnostics once, on stderr. The CLI's error handler printed them a second time on stdout, so anything reading both streams got every diagnostic twice.
- ce817b6: CLI fixes:

  - **No prompt on a piped or closed stdin.** A missing argument, option, app, library, package or module fails at once with an error that names it. Before, the prompt read the piped input as its answer and printed it: `echo "$TOKEN" | akan upload-secret` without a NAME echoed the token into the log.
  - **`akan build`** bakes the build's own environment into the route and CSR bundles. That is the root `.env`'s `AKAN_PUBLIC_ENV` (`--env` on a desktop or mobile build): the same environment the server env plugin and the Dockerfile use. A shell `AKAN_PUBLIC_ENV` that named another one used to make SSR throw "env/env.server.<env>.ts is not in this build".
  - **A workspace on an older akanjs.** A workspace whose native API is older than 0.12.0 is refused with "install matching versions of akanjs and @akanjs/cli", instead of crashing on a missing function.

  Upgrade note: a CI step that relied on answering a prompt through stdin now fails fast; pass the argument on the command line.

- ce817b6: Security: a server-side call to another server no longer carries the visitor's session. Server code answering a visitor's request used to send the visitor's `Authorization` header or auth cookie, and their `x-real-ip`, with every call it made, so a `fetch.clone({ origin })` toward another origin handed that server the visitor's token for this one. Now only a call to this server forwards them; a clone toward another origin, any clone of one, and a call given another `{ origin }` send only the client's own `jwt`, the one `fetch.clone({ jwt })` was given. Upgrade note: a server that relied on the forwarded session now receives a signed-out call; give the clone the token it should send (`fetch.clone({ origin, jwt })`).
- ce817b6: `akan` cloud commands read `--host` and the root `cloud.host` the same way: as the URL's origin and path, with a trailing slash removed, so a trailing slash, an uppercase host or a default port no longer names a separate sign-in. Upgrade note: a login saved under a host spelled with a trailing slash, in uppercase or with `:443` is not found under the normalized spelling; run `akan login` once more.
- 18f0bd8: Fixes from a CodeQL code-scanning and code-quality pass:

  - The `"use client"` check that the build runs on every module no longer backtracks exponentially on leading block comments (about 30 one-line comments hung the build), and it no longer reads `/* a */ x /* b */ "use client"` as a directive.
  - A package `exports` wildcard target with more than one `*` has every `*` replaced, as Node does, in the build's resolver and the barrel-imports plugin.
  - A tunnel agent ignores a gateway heartbeat outside 1 s to 5 min and keeps the 30 s default; Bun runs a NaN, negative or over-2^31 interval every millisecond.
  - The in-page agent's screen text prints no `data:` or `vbscript:` link, in any letter case, as it already printed no `javascript:` one.
  - A markdown link label or a mention label no longer spans a `[` or `@[` where another one starts: `[a [b](u)` links `b`.
  - `web_fetch` decodes `&amp;` last, so `&amp;lt;` reads as `&lt;`, and strips `</script >`-style end tags.
  - Native: `google_services.xml` escapes backslashes, a share refuses a `vbscript:` link, and the dev shim escapes `<`, `>`, U+2028 and U+2029 in the values it inlines.
  - `trimSlashes` and `trimTrailingSlashes` in `akanjs/common` trim in linear time; the framework's slash, email, translation and route-parsing regexes are now linear with the same results.

- 9c87ed3: `akan lint` checks React's own hooks. Biome's `useHookAtTopLevel` runs on every `.tsx` under `apps/` and `libs/` except tests, and reports a `useState`, `useEffect` or other `use…` call behind a condition, in a loop or after an early `return`. The shared Biome config had it off, so such a call passed lint and broke the hook order only at runtime.

  `no-conditional-st-hook` judges an `st` hook by the nearest function around it. An `st` hook at the top of a component defined inside `useMemo` or picked by a module-level ternary passes, as does one in a `for` loop's initializer, which runs once. The rule now also reports an `st` hook in a default value, on the right of `||=`, `&&=` or `??=`, in the arguments of an optional call such as `props.format?.(st.use.x())`, written with computed access such as `st["use"].x()`, and in a render function passed by name, such as `renderList={renderList}`.

  Upgrade note: a workspace whose components call a React hook conditionally now fails `akan lint` until the hook moves to the top of the component.

- 50afb48: A Tailwind class with a bracket nested inside its arbitrary part, such as `[[data-theme=light]_&]:block`, `has-[[aria-expanded=true]]:opacity-100`, `[&_[data-slot=x]]:p-2` or `[&:has([data-state=open])]:p-1`, now compiles. The source scanner cut each one at the inner `]`, so Tailwind never saw the class and its rule was left out of the built CSS without a warning. The candidate cache's version is bumped, so the scanner reads every file again on the next build instead of reusing the cut classes.
- bd6f9e6: Dependency refresh for the published packages:

  - **React 19.3.1** (`react`, `react-dom`, `react-server-dom-webpack`), together with the 19.0.9 / 19.1.10 / 19.2.9 backports of the same day.
  - **Majors**: `chalk` 6, `commander` 15, `fontaine` 1, `firebase` 13 (optional peer), `happy-dom` / `@happy-dom/global-registrator` 21 (optional peers; CSS and iframe loading are now off by default).
  - **Minors and patches**: `lexical` and every `@lexical/*` 0.52, `typebox` 1.3.37, `@biomejs/biome` 2.5.14, `@inquirer/prompts`, `@tailwindcss/node` / `tailwindcss` 4.3.3, `dayjs`, `immer`, `ignore`, `ora`, `string-width`, `subset-font`, `tailwind-merge`, `tailwind-variants`, `protobufjs`, `react-icons`, `@react-spring/web`, `@playwright/test`, `@types/bun`, and `bullmq` / `ioredis` to their latest 5.x.

  Held back on purpose: `typescript` 7 (no compiler API, which devkit's scanners and transforms need), `ink` 7/8 (drop bracketed-paste markers and mouse reports from `useInput`, which `akan code`'s paste and wheel scrolling read), `ioredis` 6 (RESP3 by default) and `bullmq` 6 (backend rewrite), which need the conformance suite against real Redis, and `@biomejs/biome` 2.5.15 (reports `Object.keys(…).sort()` and other string sorts under `useArraySortCompare`).

  Upgrade note: a workspace pins `react` / `react-dom` to `19.3.1` to match the `akanjs` peer range.

- d9cfc2d: `akan subspace push` keeps whatever root `Jenkinsfile` and `akan.config.ts` a subspace has, a `Jenkinsfile` an earlier push left there included, and never delivers the workspace's.

  `akan build` reads the workspace `.env` as Bun's own loader does: an unquoted value ends at its first `#`, and a quoted one at its closing quote. An inline comment used to stay in the value, so `AKAN_PUBLIC_SERVE_DOMAIN=example.com # prod domain` reached the app's domains and its Dockerfile, whose `ENV` line Docker refused (`can't find = in "#"`). The image, its bundles and its domains now take `example.com`.

  Upgrade note: a subspace no longer receives the workspace's `Jenkinsfile`, which 3.0.2 pushed into every subspace. The copy an earlier push left becomes the subspace's own, so change it there. Quote a `.env` value that holds a `#`, as Bun's own loader already required.

- ce817b6: An external view shows `native.backgroundColor` until its page's first frame, and a Windows app's executable names the app as its company when `desktop.publisher` is unset instead of keeping Bun's own ("Oven"), which Explorer and Windows Firewall's prompt showed.
- 9ee3a60: Guideline text (`akan guideline show <name>`, MCP `get_guideline`) catches up with 3.1.0:

  - `workspaceOnboarding`, `conventions` and `ssrRule` gate a signed-in layout with `.guard(() => signedIn())` from `@libs/shared/webkit`, which a new workspace has only with `create-workspace --libs true`. `ssrRule` says a crawler gets a late redirect as a real 3xx.
  - `queryRule` and `workspaceRecipes` count `purge<Filter>` among a filter's methods, and `queryRule` says which queries a purge refuses.
  - `workspaceRecipes` and the `akan-store` skill list `invalidate<Model>()`, and the `workspaceRecipes` page sample no longer awaits its view.
  - `transportRule` adds a 408 and a 409 `idempotencyInFlight` to what `retry` retries.
  - `modelDocument` points search at a `text` role rather than a `"text"` index.
  - `runtimeRule` says an edge server starts with `/mcp` off and that `operationMode` scopes whole modules.
  - `workspaceOnboarding` says only `--sign true` code-signs a `publish-update` release.
  - `conventions`, `runtimeRule` and the READMEs name Bun 1.4.4, and the `mcp`, `apps` and `modern` server options describe the edge default and MCP Apps as shipped.

- ce817b6: Windows desktop apps:
  - An uninstall no longer leaves the app's exe behind when a watchdog starts the app again meanwhile. The stop step kills whatever starts from the folder until nothing runs, and deletes the exe in that same pass.
  - A setup no longer fails when a watchdog starts the app again between the stop and the folder swap. The stop step moves the install folder to `<folder>.setup-old` in the pass that finds nothing running; the setup then checks the unpacked files and moves the folder back when they are incomplete, before the second rename puts the new files in place.
  - A setup run with `/S` shows no "Verifying installer" window over a kiosk. NSIS shows it whatever `/S` says, so the setup no longer CRC-checks itself.
  - Two launches from different kinds of session no longer both run as the first instance. Before, a launch from an SSH or service-started session and one from the desktop each started their own server on the same data, because the single-instance pipe name hashed USERDOMAIN, which differs between those sessions. The pipe name now comes from the account SID in the process token, read through `bun:ffi`, and from the profile folder only where the token cannot be read. A running instance of the older build is not found across the upgrade, but the setup stops it first anyway.
  - A gate plugin is waited for up to 30 s, not 3, so a slow single-instance check can no longer let a second launch start its server before it exits.
  - The launch phase's own deadline, on every desktop OS, is 45 s, the gate, setup and ready waits added up, where it was 18 s, so a launch whose gate is still deciding is no longer ended early.
  - A setup's or uninstall's stop step that hangs is ended after a minute and counts as a failed stop. A setup then reports the app in use, where before it waited as long as the stop did.
  - The running instance logs one line when another launch hands over to it, with the argument count only, so a launch with no console of its own still leaves a trace.
- ce817b6: `native.backgroundColor` (one color or `{ light, dark }`) is what a native window shows before its page paints, and the splash's default, so a dark screen no longer flashes white. `native.desktop.publisher` names a Windows app's publisher in Apps & features, in its setup program and in its executable. On Windows, `window.setCursorVisible(false)` hides the pointer over the window's external views too, in every document they load, until it is shown again.
- 645b859: A native plugin's `ios.sources` and `android.sources` accept the extglob forms Bun 1.4.4's glob added: `!(…)`, `@(…)` and `+(…)` (for example `ios/!(Preview).swift`). They used to be read as one literal file name and failed the build with "source … not found". `?(…)`, `*(…)` and brace ranges such as `{1..3}` already reached the glob.
- def5a20: Every native build and update pack records the `AKAN_PUBLIC_*` values its web bundle inlined in `bundle.json` as `web.publicEnv`, with a `web.publicEnvHash`; `pack.json` carries the hash too. Keys `akan.config.ts` derives are left out. A target with `updates` refuses a value an update could not carry: a key naming a secret, a non-string, a control character, or more than 256 keys or 64 KiB.

  `--public-env <file>` on `release-ios`, `release-android`, `pack-update`, `push-update` and `register-binary` builds the web bundle with exactly those values, taken from a JSON map or a store build's `bundle.json`; the shell's and `.env`'s other `AKAN_PUBLIC_*` are dropped. `pack-update --against` repeats what that store build recorded, and a pack whose values differ needs a new store build (exit 2). `register-binary` repeats what the store build recorded.

- ce817b6: Native app fixes:

  - **Desktop updates keep the installed app's signer.**
    - On macOS, an app signed with a Developer ID team refuses a downloaded release that the same team did not sign.
    - On Windows, an app whose exe has a valid Authenticode signature refuses a release whose exe isn't signed by the same subject. The check runs in PowerShell, Constrained Language Mode included. Where AppLocker, SRP or WDAC keeps PowerShell from running, a signed app refuses every release, since none can be checked; update such PCs with the installer.
    - An ad hoc or unsigned installed app takes releases as before.
    - A refused release is recorded as failed (`NOT_ALLOWED`) and is not offered again.
  - **Phone web updates packed on Windows** (`akan pack-update`, `akan-native update publish`) list the files in subfolders with `/`. They listed them with `\`, which phones refuse, and their web hash now matches a store build made on another OS.
  - **iOS:** a pending web bundle becomes the trial when the first window asks for its page, not at launch. A silent push that launches the app in the background no longer starts a trial that the next launch rolls back as `relaunch`.
  - **Android:**
    - A destroyed activity's ready timer no longer fires after `recreate()` and rolls back the trial its new activity runs.
    - A downloaded web bundle can no longer be pruned between its move into place and its staging.

  Upgrade note: build every desktop release the way the installed app was signed, with `--sign` and the same `AKAN_NATIVE_MACOS_*` / `AKAN_NATIVE_WINDOWS_*` identity. A signed installed app now refuses an unsigned or differently signed release, so republish that release signed.

- ce817b6: `router.push` / `router.replace` take `{ shallow: true }`: on an SSR page a query-only change writes the URL and the store without asking the server for the page, and back/forward between such entries stays shallow. `Tooltip` draws on the overlay layer and flips to the side with room, so it no longer clips inside a scrolling list or widens it. An SSR document links `rootLayout().manifest()` at `/manifest.webmanifest` (the basePath's own when it is visible), which the server answers, instead of a `data:` URL. An input smaller than 16px is drawn at 16px on a touch screen, where iOS would zoom into it, and a caller's own `text-*` still sets its size. `BottomSheet` reports a dismissal once and never on mount, locks the page while open, pads for the safe area, and opens on the overlay layer above the frame. Upgrade note: `Tooltip`'s bubble is no longer in the DOM until it opens; a test that read it beside its trigger reads the trigger's own text instead.
- 07b8248: A new lint rule, `no-conditional-st-hook`, runs on every `.tsx` under `apps/` and `libs/`. It reports an `st` hook that does not run on every render:

  - The hooks it checks are `st.use.*`, `st.slice.<name>.use.*`, `st.sel`, `st.ref`, and the last step of `st.tool(…)` (`.exec` / `.card`), `st.useState(…)` (`.init`) and `st.expose(…)` (`.value`).
  - It reports them on the right of `||`, `&&` or `??`, in a ternary branch, an `if` / `else` body, a `switch` case, a loop or a `catch` block, and in a callback that a component hands to a call or a JSX prop.

  Biome's `useHookAtTopLevel` cannot see these hooks, because their names do not start with `use`. A skipped call shifts every later hook by one slot, and production React does not check the order. A later `useRef` then gets another hook's frozen store value, and the screen crashes with "Cannot add property current, object is not extensible".

  The fix is to read each hook into its own `const` at the top of the component, then combine the values.

  The rule does not report a hook after an early `return`, or one inside a local helper the component calls.

  Upgrade note: `akan lint` now fails on these call sites. One common case is a hook inside `Load.Units`' `renderList`. `Load.Units` calls it only while the list is non-empty, or when `renderEmpty={false}`. Move the hook into the component that renders `Load.Units`.

- ce817b6: A server env profile build (`akan build --profile <p>`, `native.desktop.server.profile`) swaps each lib's env defaults as it swaps the app's: for the lib's `env/env.server.testing.<p>.ts`, which the build refuses when a secret-named key holds a value, or for the defaults with every secret-named value left out, named in a build warning. A secret name is one `Logger.isSecretKey` masks, and everything under such a key counts, so an `iapVerify` or service-account block is left out whole; under any key, a URL holding a password or a secret-named query parameter is a secret too. A profile file that imports the file it replaces is refused, and so is a lib default a JSON snapshot cannot hold (a function, `Map`, `Set`, `Date`, class instance, bigint or non-finite number) unless the lib has a profile file.

  Upgrade note: a desktop app that carries its server is refused a release build or `publish-update`, signed or not, while that server's bundle holds a secret value of the workspace's server env files; build its server with a profile (`native.desktop.server.profile`).

- 2c5b833: `LibsqlDatabase` is removed, along with the `@libsql/client` optional peer dependency, `LibsqlDatabaseConfig`, the `database.libsql` server env and the `LIBSQL_URL` / `LIBSQL_URI` / `LIBSQL_AUTH_TOKEN` variables. No database mode used it: `single` and `multiple` run on `SqliteDatabase`, `cluster` on `PostgresDatabase`. Upgrade note: an app that applied `LibsqlDatabase` itself moves to `SqliteDatabase` for a local file or to `cluster` mode for a shared server.
- 6b5646e: - The akan CLI runs in a workspace with no root `.env`: the workspace root is the folder with `package.json`, `tsconfig.json` and an `apps/`, `libs/` or `pkgs/` folder. Unset, `AKAN_PUBLIC_REPO_NAME` falls back to the origin remote's name and `AKAN_PUBLIC_SERVE_DOMAIN` to `localhost`; `akan build` and the redis/postgres tunnels refuse either fallback for any environment but `local`.
  - The theme contrast check reads every theme block. It used to read every other block, and none after an `@source` line, so on the framework stylesheet it checked only the light theme. `akan lint` may now report contrast failures in a `:root` or dark theme that were always there.
  - `declaredCustomProperties` skips a whole `@theme` block, nested `@keyframes` included, and ignores tokens inside comments. Theme CSS and the generated `useClient.ts` are parsed in linear time.
  - `akan agent install` writes an `AGENTS.md` about 60% smaller: the conventions guideline keeps the rules and points at the on-demand guidelines for the detail, and a new `pageRule` guideline covers routing.
- 5914378: A `.loading()` on a layout that sits at a root boundary — `(group)/_layout.tsx`, or `(group)/<segment>/_layout.tsx` such as `(docs)/docs/_layout.tsx` — now reaches the route's Suspense boundaries. The generated wrapper that takes that layout's place in the route stack re-exported `NotFound`, `Error` and `pageConfig` but not `Loading`, so the stage was dropped silently: a streamed render flushed the shell around an empty content area, painting the footer directly under the header until the page arrived.
- ee190b9: On Windows, a generated root layout named its layout files with backslashes, as in `page\_layout.tsx`. The names appear in the route-convention errors that `resolveRouteModule` and `assertGuardOnChain` throw. They now use `/` on every OS (`page/_layout.tsx`), so the generated file reads the same everywhere.
- ce817b6: `rootLayout().viewport({ fitCover, interactiveWidget, themeColor })` writes the document's `viewport` and `theme-color` meta, on the server and in the CSR shell; a native app draws under the notch by default, and a per-theme `themeColor` follows a theme switch. Route heads now merge root first: a deeper `.head()` replaces the `<title>`, a `<meta>` with the same `name` or `property`, and a canonical, manifest or icon link, and keeps the rest. Upgrade note: a page that restated its root's manifest, icon or theme tags can drop them, and an ancestor's head now renders under every page that writes its own.
- 17aa243: A route can check who may open it before anything on it renders. `rootLayout()`, `layout()` and `page()` take a `.guard(fn)` stage, declared at most once per route. It receives the route's typed arguments and `lang` (a layout's guard gets no `children`). It refuses with `router.redirect()` or `router.notFound()`, or with `getSelf({ unauthorize })` from a guard. The new `signedIn()` helper in `libs/shared/webkit` does the last of these.

  - **Server render.** Every guard in the chain runs in order before any layout body starts, root layout first, and before the route's arguments are checked. A redirect after an awaited query is now a real 307, and a not-found is a 404. Before this, a refusal raised inside a layout body after I/O arrived as a late, in-stream redirect. A query inside a guard that the server refuses with 403 or 404 (an owner check, for example) answers not-found, so the page does not tell anyone the record exists.
  - **Client navigation.** A page's layers wait for its guards. Their verdict is kept by what the guards read, so a move that changes only a query no guard reads keeps it. It lasts while a layer of that location is on screen. Only the page in front asks: a parked page, or the one under the current page during a swipe back, asks nothing. Back in front, a cached page included, it asks again in the background while what it drew stays; a refusal moves the router and blanks it, and a failure shows as a failed render. A legacy page keeps the props it was let in with while a new location is checked. A guard that moves the router ends the chain, and the page draws nothing. A refused or failed check runs again when its layer is retried. Root layouts are drawn once for every page and are not gated themselves, but their guards still run in each page's chain, and a legacy page under them waits for them too.
  - **A refusal shows nothing of what it refused.** The not-found page that a guard's `router.notFound()` answers is drawn under the layouts above the refusing guard only, with no route head; a guard that throws a string is cut the same way. A path no page matches asks the guards of the layouts its not-found would be drawn under first: a redirect answers as one, and a refusal keeps only the layouts above it.
  - **`guard` is a stage only.** A legacy module (a default function beside named exports) that exports `guard` fails to load and fails `akan build`, a legacy root layout included.
  - **MCP.** A page prompt runs its route's guards before its bodies, so a refusal ends the prompt as a redirect or a not-found. `prompts/list` and the app tools in `tools/list` show only the screens whose guards admit the caller. In a listing, no arguments are known yet: a guard that reads one counts as admitting the caller there, and is checked again when the prompt or tool is called. If the guards do not answer within the list wait, the list is served unfiltered, and the calls are still checked. `resources/list` shows a UI host only the views of the apps it may call. A caller's listing verdict is kept for 5 seconds, so a host that lists tools, prompts and resources in a row runs the guards once.

  A generated root layout passes the user layout's guard through. When there is no ancestor root, it composes the app root's guard and the user layout's guard with the new `RouteGuards.compose`.

- 63479ae: The files `akan page` writes, and those of the app and library component and scalar scaffolds, now pass `biome check` as written, instead of starting with a blank line and leaving imports unsorted. The CRUD page scaffolds and the sample app's task pages hand each `fetch.init*` / `view*` / `edit*` result to its section unawaited, so the page shell is sent first and each section fills in behind its own boundary, and the single-page CRUD scaffold gives `Model.New` a `trigger` instead of a `className` it does not take. The conventions guideline's page body rule says the same: await only what the shell reads, through one `Promise.all`. Scaffolds (`akan create-*`, `akan page`, workspace and package templates) format only the files they wrote: an existing file they left alone is no longer reformatted.
- ce817b6: The refusal a desktop build gives when its server bundle holds an env secret names the bundle file and the env file with `/` on every OS, as the rest of akan's messages do, instead of `apps\demo\env\…` on Windows.
- 576df96: An MCP App view or CSR shell that draws `@lexical/code-prism` under a `lazy()` component no longer fails with `ReferenceError: Prism is not defined` (a host shows "The page failed to load."). These single-file bundles don't split, and Bun (1.4.4 included) runs a module that only an `import()` reaches with its ESM imports ahead of its CommonJS ones, whatever their order, so the Prism language files ran before the `prismjs` they extend. A vendor module's bare import of a module that may run late now goes through a shim that imports the same specifier, so it runs where it is written. ES module targets and packages that declare `sideEffects` are left to the bundler, so a bundle changes by the shims alone.
- b56d305: The generated barrels (`cnst`, `db`, `dict`, `sig`, `st`, and the facet indexes) list modules in name order instead of the order the filesystem returns them, so two machines building the same commit produce the same CSR bundle. A store action or state key that two stores both define was decided by that order; it is now decided by module name.
- ce817b6: `akan subspace push` and `akan subspace plan` name the setting behind a refused branch: `` Branch "x" is not pushable. `subspace.pushableBranches` in the workspace root akan.config.ts allows: main, develop, debug ``. The message used to say only where the subspace settings live.
- ce817b6: `fetch.clone({ retry })` and a call's `{ retry, idempotencyKey }` retry an unreachable server, a 502/503/504 and a 429 after its Retry-After on a jittered backoff, within the call's one deadline; a mutation retries under one `Idempotency-Key`, and the server runs a mutation once per key, caller and arguments, answering a repeat with the first result (409 `base.error.idempotencyInFlight` while it runs) — a signed-out call, or one whose handler returns a `Response`, runs every time. The websocket client reconnects on a jittered exponential backoff (`ws: { reconnect, headers, tls, onStateChange, onRevoked, onError }`), sends a server-side client's token with the upgrade, numbers each room's frames, drops a repeat and calls `onResync` at a hole, and a resubscribe gets the frames it missed since its own subscribe replayed by a solo server on the built-in pub/sub (a Redis-backed or custom adaptor, and a `pubsub(Binary)` room, resync instead). `Model.upsertById(data, { preserveTimestamps })` writes a record under its own id with no hook. An insight field sums with `accumulate: { $sum: "<field>", ...condition }`. A `process` job's backoff takes `maxDelay` and its internal an `onFailed` dead-letter hook. Fixes: a live slice's `.live({ payload: "id" })` reaches its rooms; Tailwind v4's `top-(--x)` shorthand compiles; the root layout's manifest link is in the document head, where Chromium reads it.
- Updated dependencies [4fc3902]
- Updated dependencies [ce817b6]
- Updated dependencies [ed26089]
- Updated dependencies [8aaa0c6]
- Updated dependencies [ce817b6]
- Updated dependencies [b1165ba]
- Updated dependencies [2082ccd]
- Updated dependencies [1c577db]
- Updated dependencies [ce817b6]
- Updated dependencies [7cb97fa]
- Updated dependencies [1dd54bf]
- Updated dependencies [78e785e]
- Updated dependencies [63479ae]
- Updated dependencies [a597881]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [63479ae]
- Updated dependencies [ce817b6]
- Updated dependencies [18f0bd8]
- Updated dependencies [b1165ba]
- Updated dependencies [63479ae]
- Updated dependencies [bea9eb7]
- Updated dependencies [ce817b6]
- Updated dependencies [a6577eb]
- Updated dependencies [297f437]
- Updated dependencies [531ab68]
- Updated dependencies [8bf9f8e]
- Updated dependencies [bd6f9e6]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [2c5b833]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [77411ef]
- Updated dependencies [70ebbb4]
- Updated dependencies [ea39ba0]
- Updated dependencies [b1165ba]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [b1165ba]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [b1165ba]
- Updated dependencies [9ee3a60]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [6294981]
- Updated dependencies [113fab2]
- Updated dependencies [ce817b6]
- Updated dependencies [2cb9c0f]
- Updated dependencies [ee01a4c]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [b1165ba]
- Updated dependencies [ce817b6]
- Updated dependencies [0c1f96b]
- Updated dependencies [658e59a]
- Updated dependencies [5a94516]
- Updated dependencies [509ba6f]
- Updated dependencies [ce817b6]
- Updated dependencies [b1165ba]
- Updated dependencies [f6b70d8]
- Updated dependencies [17aa243]
- Updated dependencies [ce817b6]
- Updated dependencies [3e275c2]
- Updated dependencies [7b8c6c7]
- Updated dependencies [63479ae]
- Updated dependencies [50afb48]
- Updated dependencies [4ed48d0]
- Updated dependencies [63479ae]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [e200ce1]
- Updated dependencies [fe1e27d]
- Updated dependencies [ce817b6]
- Updated dependencies [f949da0]
- Updated dependencies [ce817b6]
- Updated dependencies [b1165ba]
- Updated dependencies [9bf9181]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [ac753ff]
- Updated dependencies [ce817b6]
- Updated dependencies [17aa243]
- Updated dependencies [6e5a402]
- Updated dependencies [3b7e57d]
- Updated dependencies [ce817b6]
- Updated dependencies [1324d30]
- Updated dependencies [329bd79]
- Updated dependencies [2c5b833]
- Updated dependencies [ce817b6]
- Updated dependencies [c184074]
- Updated dependencies [6b5646e]
- Updated dependencies [ce817b6]
- Updated dependencies [17aa243]
- Updated dependencies [2c5b833]
- Updated dependencies [6183f95]
- Updated dependencies [8201174]
- Updated dependencies [ce817b6]
- Updated dependencies [fd52c2c]
- Updated dependencies [8ba25ec]
- Updated dependencies [ce817b6]
- Updated dependencies [bb7a8cd]
- Updated dependencies [f5c1f70]
- Updated dependencies [b1165ba]
- Updated dependencies [b7e969e]
- Updated dependencies [471665c]
- Updated dependencies [92a62ca]
- Updated dependencies [6dabbf8]
- Updated dependencies [b1165ba]
- Updated dependencies [ce817b6]
- Updated dependencies [181789d]
- Updated dependencies [a1b32c7]
- Updated dependencies [ca888e7]
- Updated dependencies [63479ae]
- Updated dependencies [ce817b6]
- Updated dependencies [ce817b6]
- Updated dependencies [587d530]
- Updated dependencies [ce817b6]
- Updated dependencies [b1165ba]
- Updated dependencies [00e39db]
- Updated dependencies [cebac7d]
  - akanjs@3.1.0

## 3.0.2

### Minor Changes

- be8ed50: New lint rules: `no-unguarded-endpoint` warns on an endpoint, named slice or root slice that declares no guards, and `no-double-brace-placeholder` refuses `{{name}}` in a dictionary error/translate entry. `no-throw-raw-error` also warns on a raw `Error` constructed without `throw`, and `no-inline-color` warns on color literals in SVG color attributes and `el.style` writes.
- af66669: Native builds moved from `apps/<app>/.akan/native/<target>` to `dist/native/<app>/<target>` (`build/<platform>`, `dev/<platform>`, `web`, `bin`, `updates`). It sits outside `dist/apps/<app>`, which every `akan build` empties, so a signed release waiting for upload survives the next build. Upload what is waiting in an old `.akan/native/<target>/updates` and delete the folder: `akan start` keeps it and warns until then. A CI step that collects installers reads `dist/native/<app>/*/build/*/` now, and `pack-update`'s default output is `dist/native/<app>/<target>/updates/<platform>`.
- af66669: The macOS dmg `build-desktop --installer true` makes opens on a drag-to-Applications window: no toolbar, sidebar or status bar, 128 pt icons of the app and the Applications link on a background with an arrow between them (1x and 2x in one multi-resolution TIFF), and the app's icon on the mounted disk (`.VolumeIcon.icns`). Its own files (`.background`, `.VolumeIcon.icns`, `.DS_Store`, `.fseventsd`) are hidden. The window is a `.DS_Store` written directly while a read-write image is mounted, never through Finder or AppleScript, so a headless CI builds the same image; the compressed image is made afterwards and is what gets signed, notarized and stapled. `native.desktop.dmg` (a target's too) replaces the background (`background`, `background2x`, or `false`) and moves the window and the icons (`window`, `iconSize`, `textSize`, `app`, `applications`, in points); the default background lines up with the default positions only.
- be8ed50: `akan sync` prunes a root-declared dependency nothing imports and realigns every root-declared entry to the root's version; `package.json#akan.keepDependencies`, `externalLibs` and `trustedDependencies` are always kept. `akan install-library` keeps the root's versions and only adds what the root lacks.

### Patch Changes

- af66669: `akan build-desktop` builds for this computer's CPU without asking; `--arch arm64|x64` picks another one. Any CLI option declared both `enum` and `nullable` is now `null` when left out instead of prompting for one of its choices.
- af66669: Upgrading may stop `akan sync` (and every command that runs it, `build-desktop` included) with a scan-convention error on a hand-written `index.tsx`, `index.jsx` or `index.mts` at the root of `ui/`, `webkit/`, `srvkit/`, `common/` or `plugin/`. Bun loads that file ahead of the generated `index.ts` while TypeScript checks `index.ts`, so a name only the generated barrel exports typechecks and is undefined at runtime. Delete the file: the generated barrel re-exports every file and folder of the facet. A namespace it built belongs in `<facet>/<Folder>/index.tsx`, which the check leaves alone.
- be8ed50: Generated barrels, module indexes and `akan.*.json` are written exactly as Biome prints them, so `akan lint --no-fix` passes right after a sync.
- af66669: A native build's `--env` reaches its CSR bundle. The CSR builds passed `env: "AKAN_PUBLIC_*"` to `Bun.build`, which inlines the `.env` Bun read when the process started and ranks it above `define`, so `build-desktop --env debug` shipped the root `.env`'s `AKAN_PUBLIC_ENV=local` and called `http://localhost:8282`, and `akan build` baked back the operation mode and ports it had just dropped. Every `AKAN_PUBLIC_*` now comes from `process.env` through `define` alone, and `akan build` drops `AKAN_PUBLIC_CLIENT_PORT` / `AKAN_PUBLIC_SERVER_PORT` from `process.env` as well, so a port in `.env` is no longer baked in.
- af66669: A Linux desktop app's window is named after its app id (X11 `WM_CLASS`, Wayland `app_id`), so a dock or task bar finds its `<app id>.desktop` and shows that entry's name and icon instead of a generic one; the dock plugin's badge and progress name the same entry. The AppImage `build-desktop --installer true` makes carries `<app id>.desktop` with `StartupWMClass=<app id>` and `<app id>.png`, so the entry AppImageLauncher or appimaged installs under another file name still matches the window. The hidden entry that handles the app's deep links now shows the app's icon (installed as `~/.local/share/icons/hicolor/256x256/apps/<app id>.png`), and from an AppImage it starts the AppImage itself (`$APPIMAGE`) rather than the mount point it ran from, which is gone once the app quits, so a link opened after quitting the app no longer fails.
- af66669: A `--env local` release build (`build-*`, `release-*`, `start-* --release true`, `publish-update`) calls the app's own dev server: its `env.runtime.json` names `PUBLIC_AKAN_SERVER_URL=http://localhost:<dev port>`, the port `akan start` gives the app (`AKAN_DEV_PORT`, else its place among the apps). Before, it always called 8282, which in a workspace with several apps is another app or nothing. A target that carries its server keeps the URL its server hands the page at launch, and an `AKAN_PUBLIC_SERVER_URL` the bundle was built with still wins.
- be8ed50: `akan quality scan` no longer flags a non-exported interface or type declared beside a class.
- 73a81da: Let non-local single database mode development servers continue when the Redis SSH tunnel is unavailable, warning with the SSH target and underlying connection errors and setting an explicitly unavailable Redis host instead of falling back to a local Redis instance. Working tunnels remain available to custom Redis adaptors, while multiple and cluster modes still require Redis and local development remains unchanged.
- Updated dependencies [be8ed50]
- Updated dependencies [af66669]
- Updated dependencies [be8ed50]
- Updated dependencies [be8ed50]
- Updated dependencies [be8ed50]
- Updated dependencies [be8ed50]
- Updated dependencies [be8ed50]
- Updated dependencies [be8ed50]
- Updated dependencies [af66669]
- Updated dependencies [af66669]
- Updated dependencies [bd55713]
- Updated dependencies [be8ed50]
- Updated dependencies [be8ed50]
- Updated dependencies [be8ed50]
- Updated dependencies [be8ed50]
- Updated dependencies [a789952]
- Updated dependencies [be8ed50]
- Updated dependencies [be8ed50]
  - akanjs@3.1.0

## 3.0.1

### Minor Changes

- 4871ae5: New lint rule `no-static-in-object-light-model` for `*.constant.ts`: a `static` on an `XObject` or `LightX` class is an error. The full model `via(XObject, LightX, …)` mixes in their prototypes only, so such a static never reaches `X`; declare it on `XInput` (or a scalar), `X`, or `XInsight` instead.

### Patch Changes

- Updated dependencies [4871ae5]
- Updated dependencies [4871ae5]
- Updated dependencies [4871ae5]
  - akanjs@3.1.0

## 3.0.0

### Minor Changes

- ccf2ae2: A CSR dev page — `?csr=true`, `/__csr`, and every native dev build — updates in place on save instead of reloading.

  - `akan start` serves the CSR page as a module registry: each module is its own factory, and a save sends only the
    modules it changed. A component edit keeps hook and DOM state (React Fast Refresh), a store edit keeps the store,
    and a build error shows the overlay and recovers without a reload.
  - A page or layout edit swaps that route in place through `replacePages`: the page stack, history and stores stay,
    and so does the state of the components under the edited page or layout. A `*.constant.ts`, an added or removed
    route, a new npm dependency or a signal/dictionary change still reloads.
  - `AKAN_DEV_CSR=artifact` brings back the single-file dev bundle, which reloads on every save. `akan build` and a
    release mobile build are unchanged.
  - HMR sockets now say what they are: a CSR page connects as `/_akan/hmr?client=csr` and gets `csr-update` instead of
    the SSR `reload` and `rsc-refresh`, and a page that missed an update while disconnected reloads
    when it reconnects.

- ccf2ae2: A Windows desktop app can share its screen without the picker

  `native.desktop.screenCapture: "auto"` in `akan.config.ts`, or `desktop.screenCapture` on one target, makes the
  Windows app answer the page's `getDisplayMedia()` with the first screen at once, without the picker and without a user
  gesture, for remote support on a screen nobody attends. It is Chromium's switch for automated media tests and covers
  every media request, so leave it off in an app whose pages ask for a camera or a microphone. The default `"picker"`
  keeps the picker; macOS and Linux ignore it.

- ccf2ae2: `akan build-desktop --installer` makes a Windows setup program

  On Windows the build adds `<file>-<version>-<arch>-setup.exe`, made with NSIS (`winget install NSIS.NSIS`). It installs
  for the current user under `%LOCALAPPDATA%\Programs\<app name>`, where the updates plugin swaps the app without an
  administrator, with a Start menu shortcut and an uninstall entry. `/S` installs silently and `/RUN` starts the app
  afterwards, and a PC without the WebView2 Runtime gets it. The program is not code-signed yet.

  - What can fail without touching the installed app comes first: WebView2, then the new files, unpacked beside the
    folder. Only then is a copy of the app running from the folder stopped, found by its path, and the folder swapped by
    two renames. A swap that fails puts the old folder back, and with `/RUN` the app left in place starts again.

  - The uninstaller lives beside the app folder (`<folder>.uninstall.exe`), not in the folder an update replaces, so
    Settings › Apps can still remove an updated app. It finds the folder from the uninstall entry and removes it with
    whatever updates left beside it (`.previous`, unpacked or failed releases) and itself, the launch-at-login entry and
    the updates state; the server's data stays. An uninstaller that cannot be
    written there (a `/D=` right under a drive root) fails the install.
  - The Start menu shortcut and the app `/RUN` or the last page starts work in `%LOCALAPPDATA%`: Windows cannot rename a
    folder some process works in, which is what applying an update does.
  - `/RUN` starts the app after a silent install only; an interactive one offers it on its last page.
  - Run again without `/D=`, it installs into the folder the uninstall entry names, so a reinstall replaces the copy
    already installed wherever it was put, and a setup started while another one runs refuses to start.
  - A silent install that cannot finish exits with 2: files it could not write (the script is long-path aware, and the
    build warns when the deepest file nears 260 characters under `%LOCALAPPDATA%\Programs`), a WebView2 Runtime still
    missing after its setup ran (an interactive install asks), or a `/D=` folder holding someone else's files.
  - An update the app confirms sets the version Settings › Apps shows.

- ccf2ae2: `akan start-desktop <app>` (alias `sd`) runs a native target as a desktop app on this computer — macOS, Windows or
  Linux, whichever it is — the way `start-ios` and `start-android` run it on a phone: a debug build whose pages come
  from `akan start` through the dev gateway, so every save shows up, or with `--release` a release build of its own
  bundle. It takes `--target`, `--env`, `--release` and `--write`. `NativeApp` accepts the desktop platforms, and
  `NativeApp.desktopPlatform()` names this computer's.
- ccf2ae2: An app and a lib ship native plugins of their own from a `native/` folder

  A plugin the runtime has no builtin for sits in `apps/<app>/native/<id>/` (or `libs/<lib>/native/<id>/`), the folder
  named after the id in its `native-plugin.json`. It is listed nowhere: every mobile and desktop target of the app
  ships it, and its manifest says what runs on each platform. A lib's plugins reach only the apps that depend on it; an
  app's own plugin wins an id a lib also uses, and two libs claiming one id stop the build. `akan sync`, `akan doctor`
  and `akan quality scan` accept the folder.

  The page API is written with `definePlugin` from `akanjs/client/native` (which also exports `defineWebPlugin`,
  `createLiveValue`, `useLiveValue` and `usePluginEvent`), and the desktop part with `defineDesktopPlugin` from the new
  `akanjs/native/desktop`. A `native/` folder is out of the scope of `no-throw-raw-error` (a plugin throws
  `AkanNativeError`) and of `no-web-only-api-outside-webkit`. A plugin a target names by folder in `native.plugins` is now
  granted by its id instead of its path, and ships once when it is also the app's own `native/<id>`. A desktop plugin's
  `ctx.launch.exit(code)` after its setup ran past the launch phase's 3 s quits the app, since its window exists by then.

- ccf2ae2: An installed app updates itself: a phone its web bundle over the air, a desktop app the whole app.

  - `native.updates: { url, publicKey, channel?, readyTimeout? }` in `akan.config.ts`, per target too, the target's
    fields winning. It brings the runtime's `updates` plugin. A channel left unnamed is the backend env the binary is
    built for (`main`, `develop`, `debug`, …), so a `build-desktop` app (`debug` unless `--env` names another) takes
    only the releases published for that env.
  - The CSR frame confirms a release on trial once the first page is on screen, in every native shell (an unconfirmed
    one is rolled back at the next launch). On a phone it also keeps the bundle current by itself: at start and on each
    return to the front it looks for a newer one and downloads it, and it runs from the next cold start. A desktop
    release is the whole app and a relaunch, so the app checks, downloads and applies it on its own schedule. A dev
    build's pages are left alone. `akanjs/client/native` exports `updates`, `markReady` and `useUpdateState`.
  - `akan update-keygen <app> [--platform]` makes the signing key of the app's id once and prints its public half.
    `akan publish-update <app>` builds a release on this machine and signs it: the whole app for this computer's desktop
    OS and CPU (with the app's server when `desktop.server` says so for the target, as for `build-desktop`), or the
    web bundle for `--platform android|ios`. It writes the manifest and its files under `.akan/native/<target>/updates`,
    to upload to `updates.url`, on the channel of its `--env` (`main` unless named). `--channel` names only the manifest
    written, not the channel the release follows, so a pilot group gets a target whose `updates.channel` is the pilot's.
  - The updates folder holds only what is uploaded, and whoever can reach `updates.url` reads it: the updater sends no
    credentials, and a desktop release is the whole app, with the carried server's `private/` (the app's and its libs')
    and its env file.
  - `akan pack-update <app> --platform ios|android [--target] [--env] [--out]` writes an unsigned phone update instead,
    for a signer that keeps the key elsewhere: `files/<sha256>`, `bundle.json` and `manifest.template.json`, the
    manifest with `channel`, `sequence` and `bundle` left for the signer. `--against <store bundle.json>` also checks
    the bundle runs in that store build, writes `compat.json`, and fails when it needs a new binary. The signing
    contract is in the native runtime's architecture notes: fill the three fields, sign exactly the bytes you upload,
    upload `files/` first.
  - `publish-update` refuses a `--channel` outside the names `updates.channel` accepts (lowercase letters, digits, `.`,
    `_`, `-`) before it builds, and numbers a release past the one its channel already has in the updates folder,
    warning when this computer's clock is behind it. Apps compare against the time their own build was made, so keep the
    building and the publishing computers' clocks in step.
  - While a desktop release is on trial, `updates.check()` answers `available: false` for it and `updates.apply()`
    rejects with `NOT_ALLOWED`: applying would replace the app a failed trial goes back to.
  - A release of a desktop app that carries its server is confirmed only once that server answered ready and stayed up
    for 5 s, and only while it is up; its trial clock (`readyTimeout`) starts then, so a server slow on its first run
    (its new files being scanned) costs no rollback. A server that gives up, or is not up within 120 s of the start,
    rolls the release back at once; the release stays downloaded for the next apply, and its third such failure
    excludes it for good.
  - A desktop release's manifest says whether it carries a server, and an installed app refuses one that differs from
    itself before downloading anything (`check()` answers `available: false`, `download()` rejects with
    `NOT_ALLOWED`), since either way its pages' backend would change place. `publish-update` refuses, before it builds,
    a desktop release whose server presence differs from the channel's previous one: publish it on another channel
    (`updates.channel`), or remove that `<channel>.json` from the output folder to start the channel over. Turning
    `native.desktop.server` on or off for an app already installed takes a reinstall.
  - On Windows an app started from its install folder (the installer, the Start menu, Explorer) applies and rolls back
    updates: Windows renames no folder a process works in, so the app moves to its local data folder before the webview
    starts, and the update helper and the app it starts work elsewhere.
  - The update state and the unpacked releases live in the app's local data (`%LOCALAPPDATA%\<app id>\akan-native-updates`
    on Windows), and plugins get that folder as `ctx.appLocalDataDir`.
  - An app installed under another folder name (`/D=`, a renamed `.app`) takes updates; a download older than a
    reinstalled build is dropped; a Windows swap that did not happen (a file stayed locked, the helper never ran) keeps
    the release downloaded for the next apply until its third such failure excludes it. Reinstalling the app clears the
    list of releases the earlier install refused.
  - `publish-update` checks every target before anything builds — its `updates` settings, its native config, the
    signing key on this computer, and whether its channel's previous release carries a server as it would — so a CI
    without the key stops at once and a publish never releases only the first targets. It writes `<channel>.json`
    together with its signature.
    The channels `bundle`, `manifest.template` and `compat` are refused. `akan start` keeps `.akan/native`, where
    releases wait to be uploaded, and the `bin` downloads in `.akan/cache/bin`.

- ccf2ae2: An app image carries the server env of the environment it runs and no other.

  - `env/env.server.ts` imports every environment's file, so `akan build` used to bundle all of them into `server.js`:
    anyone holding the image of one environment could read the keys of every other. The backend build now keeps only
    `env.server.<AKAN_PUBLIC_ENV>.ts`, the environment the generated Dockerfile fixes, and swaps each other
    environment's file (`local`, `testing`, every branch) for exports that refuse to be read. Booting such an image under
    another `AKAN_PUBLIC_ENV` stops with `env/env.server.<name>.ts is not in this build` instead of running on a
    config it does not have. Nothing in `env/` needs to change.
  - An app's generated `server.ts` no longer re-exports `env` from `env.server.testing.ts`, which put the testing env in
    every image. Signal tests read it from the file. A script or test that imported `env` from an app's `server.ts`
    imports `./env/env.server.testing` instead. A lib's `server.ts` still exports it, since each app's
    `env.server.type.ts` spreads it as the lib's defaults.
  - Keys that already shipped in an image stay readable in it. Rotate them.
  - A build for a named `--env` (a mobile or desktop build) writes that env into the Dockerfile too, so the image boots
    the environment its `server.js` carries.

  **Breaking for an image started under another `AKAN_PUBLIC_ENV`, and for code importing `env` from an app's
  `server.ts`:** the image stops at boot until it runs the environment it was built for, and the import moves to
  `./env/env.server.testing`.

- ccf2ae2: A desktop app nobody attends recovers its page, relaunches itself and opens as a kiosk

  `native.desktop.recovery: "reload"`, for the app or one target, loads a page whose web process ended (a crash, a hang,
  out of memory) again, once per end, instead of showing an error page after the second end, waiting longer after each
  end in a row (1 s, doubling to a minute). It relaunches the app when the webview's browser process ends, where the app
  used to quit: at once the first time, then after 1 s doubling to a minute while each relaunched app dies within a
  minute, and after ten in a row it exits with code 1 instead of restarting for good.
  `native.desktop.window: { fullscreen, skipTaskbar }` opens the main window borderless fullscreen and without a taskbar
  button (Windows, Linux) from its first frame; a plugin's launch phase decides the same per launch with
  `ctx.launch.setWindow`. `app.relaunch()` ends the app and starts it again in a new process on the desktop and Android,
  and reloads the page on the web; one process starts one new app, however many windows or calls asked for it.
  `native.android.autoplay: true` lets media play with sound without a tap first, as it already does on iOS and the
  desktop.

  An app relaunched by an update on Windows no longer quits the moment it starts when `akan start-desktop` had started
  the one before it.

- ccf2ae2: A desktop app can carry the app's own server: with `native: { desktop: { server: true } }` in `akan.config.ts`, or
  `desktop.server` on one target, `akan build-desktop`, `akan start-desktop --release` and `akan publish-update` put the
  backend `akan build` made into the app, so it works on one computer with no backend elsewhere.

  - The build stages what the backend build wrote into `apps/<app>/.akan/desktop/server` — `main.js`, `server.js`, the
    chunks, `akan.build.json`, `private/`, and any `.node`, `.wasm` or file asset a bundled package brought — without the
    Dockerfile, the RSC worker, the console, `csr/` and `public/`. Its packages install there first
    (`bun install --production --prefer-offline`, without the RSC renderer and the drivers of every database mode but
    `single`), before `akan build` runs, so a computer that cannot reach the registry or find them in Bun's cache stops at
    once. The app needs `single` in `database.modes`; the command says so before it builds.
  - The backend is built for the command's own `--env`, not the workspace's `AKAN_PUBLIC_ENV` (the root `.env` usually
    names `local`), so `server.js` holds that environment's `env.server.<env>.ts` and no other.
  - What it carries is readable in plain text by anyone with the app: `private/` (each lib's too, under
    `private/libs/<lib>`), that `env.server.<env>.ts` and the server env defaults of the libs it uses (each lib's
    `env.server.testing.ts`). Keep deployment secrets out of them. It has no `public/`, and its working
    folder is its data folder: read a runtime file from the app folder (`AKAN_APP_DIR`, else the folder of `Bun.main`),
    never from `process.cwd()`.
  - At launch the shell starts it as a child on its own Bun (`BUN_BE_BUN`, with `.env`, `bunfig.toml` and
    auto-install off) on a loopback port, and hands the page its URL as `PUBLIC_AKAN_SERVER_URL`. The port of the last
    session comes first and a fresh one is picked only when it is taken, so an address registered somewhere usually
    stays valid from one launch to the next. The window waits for it up to 8 s.
  - It runs API only, `operationMode` edge, database mode `single`, SSR, CSR and MCP off, bound to 127.0.0.1 with every
    other Host refused. Any program on the computer can still call that port, so guard its endpoints as a network
    server's. It keeps its SQLite data, files, logs and a per-install JWT secret in the app data folder's
    `server/`, and a debug build, which has the release app's id, in its own `server-debug/`. On Windows that folder is
    `%LOCALAPPDATA%\<app id>\server`, not the Roaming folder a profile copies on every sign-in and an organisation may
    put on a file share, where SQLite's WAL does not work. Bun's transpiler cache goes to
    `<server data>/runtime/transpiler-cache`.
  - It trusts the operating system's CAs (`--use-system-ca`), as the page does, and gets the proxy and CA variables
    (`HTTP(S)_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `NODE_USE_SYSTEM_CA`) and the desktop session's
    (`DISPLAY`, `WAYLAND_DISPLAY`, the session bus, the audio server, `XDG_*`, and Windows' `ProgramFiles`, `ComSpec`,
    `PATHEXT` and the like), so a `bin` tool reaches what the page reaches and can open the screen, the audio server or a
    shell.
  - `AkanApp` takes `BUN_BE_BUN` off `process.env` at boot and gives it back only to a spawn of its own executable (the
    ops snapshot, which also gets the server's runtime flags), so a `bin` tool built with `bun build --compile` starts as
    itself rather than as the Bun CLI. A child started with `Bun.spawn` and no `env` still gets the environment the
    process started with, so pass `env: process.env`.
  - A crash restarts it on the same port (1 s doubling to 30 s; the fifth in a row gives up with an alert). A server that
    exits before its first ready starts again 250 ms later, on the same port while it is still free, so one that cannot
    boot gives up while the window still waits for it and the window opens at once with the alert. A server
    that cannot start at all (an unreadable `jwt.secret`, a data folder that cannot be made) still hands the page a
    loopback URL and shows the same alert once the window is up, so the page never falls back to the backend its bundle
    was built for. A restart that throws counts as one failure. Its standard error, and its standard output until it is
    ready, also go to `server/runtime/logs/server-output.log`, where a server that fails before it listens leaves its
    reason.
  - Quitting the app stops it within its 1 s shutdown budget, inside the launcher's 1.5 s grace, and a server still
    there after the grace is killed. On macOS and Linux it leads its own process group, and whatever it started ends
    with it: the launcher ends the group when the app quits, and when the app was killed or crashed — even while the
    server was still starting — the server sees its parent gone and ends the group itself, SIGTERM first and SIGKILL a
    second later. A process started `detached` leaves the group. On Windows the job object ends them all with the app.
  - It runs in one process: a `main.ts` or an env asking for a gateway and replicas (`replica`, `solo: false`,
    `AKAN_SOLO=false`, `AKAN_REPLICA`, `AKAN_COMMAND_TYPE=start`) does not boot in the app, and says which.
  - A native plugin follows the server with `ctx.server.state` and `ctx.server.onState` (`starting`, `up`,
    `restarting`, `gaveUp`, `stopped`), and a page with the `app` plugin's `serverState` event, so an app nobody attends
    can act on a server that gave up (`app.relaunch()`, say).
  - `XAUTHORITY`, `PULSE_COOKIE`, `PULSE_RUNTIME_PATH` and `XDG_DATA_DIRS` reach it too. A second launch that hands
    over to the first starts none. The single-instance plugin comes with it.
  - `akan start-desktop` without `--release`, for such a target, follows this checkout's dev server already answering on
    the app's dev port, or starts `akan start` in the same command and opens the app once it serves; it asks for one
    target before it starts one, needs `single` as a release does, and stops at once when that dev server fails to boot
    (a replica's crash loop included) instead of waiting it out. Ctrl+C or closing the app stops the app, then the dev
    server it started, then the local database, one after another, and exits 130.
  - `akan start-desktop --release` of such a target shows the carried server's lines at the level its logger wrote them.
  - `AkanAppConfig.getProductionEnv()` is the env the image runs with; the Dockerfile's `ENV` lines come from it (same
    keys and order, without the two blank lines the template used to leave).

- ccf2ae2: `akan build-desktop --arch arm64|x64` picks the CPU a Windows or Linux desktop app runs on

  A desktop app is still built on its own OS, now for either of its CPUs: the Rust library is built for that target,
  the executable with `bun build --compile --target=bun-<os>-<arch>`, the carried server installs with
  `bun install --cpu=<arch>` so its addons' prebuilt binaries are that CPU's, and each `bin` entry is that platform's.
  The setup program and the AppImage name the CPU they hold. A macOS app is Apple silicon only: Intel Macs are not a
  target, so `--arch x64` on macOS is refused.

- ccf2ae2: `bin` in `akan.config.ts` puts executables in a desktop app, and the build says what the image installs that the app does not

  A desktop app ran whatever `ffmpeg` the user's computer had on its PATH, if any, and a Finder-launched app sees only
  `/usr/bin:/bin:/usr/sbin:/sbin`. `bin` names an executable and, per platform (`darwin-arm64`, `win32-x64`, …), where it
  comes from: a download with its `sha256` (an archive takes `file`, the executable inside it) or a path next to the
  declaring `akan.config.ts`. `build-desktop` and `start-desktop` fetch the file for the computer they build on, check it,
  and carry it in the app's `bin/`, which the app puts first on its PATH: the carried server's `spawn("ffmpeg")` runs
  that file, and a native plugin finds it in `ctx.binDir`. A download is kept as `download` plus its URL's extension
  (`.zip`, `.tar.xz`, `.exe`, …), never under a name the URL spells. Bun's own `spawn` without `env` reads the environment the app
  started with, so a plugin passes `env: process.env` to run one by name. A lib's entries reach the apps that depend on
  it, and an app's own entry of the same name wins. macOS builds sign every executable the app carries, in `bin/` and
  in the carried server, found by its Mach-O header rather than its name, so one a package ships without an extension
  passes Developer ID signing and notarization too. The image does not read `bin`: it still installs through `docker`.

  `build-desktop` of a target that carries its server now warns when the image runs `docker` steps (or the app writes
  its own Dockerfile) and the app carries no `bin`, since the carried server runs none of those steps.

- ccf2ae2: `desktop.server: { omit }` carries the desktop app's server without packages only the image needs

  `native: { desktop: { server: { omit: ["rclnodejs"] } } }` carries the server as `server: true` does, minus the named
  packages and whatever only they pull in: an addon tied to the image's system (a ROS install), or code only a process
  the desktop app never starts loads. The image's `package.json` keeps them, `externalLibs` included; the desktop
  server's `package.json`, its `bun install --production` and the addon check do not see them. A package another
  dependency still installs stops the build, naming the dependents, and the targets that carry one build's server must
  omit the same packages.

- ccf2ae2: A desktop app's server reads the files the user picks, with no copy and no path in the page

  `filePicker.pickFiles({ forServer: true })` (also `pickDirectory` and `saveFile`; `filePicker` is now exported from
  `akanjs/client/native`) copies nothing on the desktop, whatever the file's size: its FileRefs serve the originals,
  and each result carries a grant. The server exchanges the grant with `NativeFile.resolve(grant, "read" | "write" |
"folder")` from `akanjs/server`, or `NativeFile.resolveIn(folderGrant, relative)`. The carried server asks the shell
  that showed the dialog over its IPC channel, so it reaches what the user picked and nothing else; a debug build
  that carries its server does the same. Behind a dev build without one, `akan start` checks the grant's signature
  instead, in `operationMode` local only. A phone or the web refuses `forServer`.

  `resolveIn` judges a relative path by where it lands once the links on it are resolved — through its nearest existing
  folder when the file is about to be written — so a link inside the granted folder cannot take it elsewhere, and a
  dangling link is refused. A name that starts with two dots (`..cache/x`) is inside the folder, not above it.

- ccf2ae2: `akan build-desktop --installer true` on Linux adds an AppImage

  The app folder gains an `AppRun`, a `.desktop` entry naming the app's icon and its `deepLinks.schemes`, and a 256px icon,
  and is packed with `mksquashfs` behind the AppImage type 2 runtime, pinned to a dated release and checked by its
  digest. The AppImage needs only the WebKitGTK 4.1 and GTK 3 the folder already needs, and runs without FUSE through
  `--appimage-extract-and-run`. It runs from a read-only image, so the updates plugin cannot replace it: an app with
  `updates` is warned to publish a new AppImage for each release.

- ccf2ae2: A macOS desktop release can be downloaded: Developer ID signing, the hardened runtime, notarization and a dmg

  `akan build-desktop` signs with a Developer ID when `AKAN_NATIVE_MACOS_IDENTITY` names one in a keychain, or
  `AKAN_NATIVE_MACOS_CERTIFICATE` + `_CERTIFICATE_PASSWORD` a `.p12` (imported into a keychain made for the build and
  deleted after it, for CI). Every Mach-O file is signed inside out with the hardened runtime and a secure timestamp, and
  the executable gets Bun's JIT entitlements plus the camera's or microphone's when a usage text asks for them;
  `native.desktop.entitlements` adds the app's own. With `AKAN_NATIVE_MACOS_NOTARY_KEY` + `_KEY_ID` + `_ISSUER` (an App
  Store Connect API key) or `_NOTARY_PROFILE`, the app is notarized, stapled and checked with `spctl`.
  `--installer true` on macOS adds a dmg with an Applications link, signed, notarized and stapled the same way.
  `publish-update` signs a macOS release with the same identity, since the updater checks the installed app's signature.
  A release that is not signed with a Developer ID, or not notarized, warns that Gatekeeper blocks a downloaded copy.

- ccf2ae2: A native platform section takes its own `indexPath`

  `ios.indexPath`, `android.indexPath` and `desktop.indexPath` win over the section's (or the target's) `indexPath` on
  that platform, so one target opens the phones on `/mobile` and the desktop app on `/` with no `--target`. It moves
  both the dev build's first page and the `indexPath` a release bundle carries.

- ccf2ae2: Mobile apps build and run on `@akanjs/native` instead of Capacitor.

  The runtime ships inside `akanjs` (vendored, not published on its own), so an app installs nothing extra for it.
  It generates each target's native projects under `.akan/native/<target>/build/<platform>` and loads the web
  root it assembles in `.akan/native/<target>/web` from the production CSR build — nothing native is committed.

  - **Configuration (`akan.config.ts`).** A `native` section, and each of its `targets`, takes `appName`, `appId`,
    `fileName`, `version`, `buildNum`, `basePath`, `indexPath`, `icon`, `splash`, `permissions`, `plugins` (builtin
    ids such as `iap`), `deepLinks`, `ios.{infoPlist, entitlements, files}` and
    `android.{manifest, application, activity, googleServices, files}`; a target overrides the section field by field.
    `files` maps where a file lands (a path in the iOS app bundle, `res/<type>/<file>` or `assets/<path>` on Android)
    to its source. A Capacitor-era key fails, naming the keys the section takes.
  - **Plugins declare, they do not edit projects.** `AkanPlugin.native` names the permission it serves and what the
    target then needs: native plugins, usage texts, plist and entitlement entries, Android permissions and features.
    It replaces `capacitor.configureNative`, `editIosAppDelegate` and `runtimePackages`. A release build names each
    plugin's default permissions as its capabilities.
  - **Commands.** `build-`, `start-` and `release-ios|android` go through the runtime. `start-*` follows `akan start`
    (it refuses when no dev server answers), runs one target at a time and takes `--device` (and `--team`/`-T` on
    iOS); `--release` runs a release build of its own bundle. `release-ios` takes `--team` and `--ad-hoc`;
    `release-android` builds an `.aab` by default (`--assemble-type apk` for an `.apk`), signed from
    `MYAPP_RELEASE_STORE_FILE`, `MYAPP_RELEASE_STORE_PASSWORD` and `MYAPP_RELEASE_KEY_ALIAS` (plus
    `MYAPP_RELEASE_KEY_PASSWORD` when the key has its own), which it checks before anything builds. `build-*` take
    `--debug`, and
    `akan doctor --ios` adds the native toolchain checks.
  - **Pages.** `akanjs/client/native` wraps the native plugins a page uses, and `isNativeApp()` is true only inside
    a shell. `Device` reads the runtime's device plugin and safe-area variables, `storage` the shell's preferences,
    and the new `secretStorage` keeps the JWT and refresh tokens in the OS credential store (cleared on the first
    launch after a reinstall). `useCamera` is one hook — the native sheet asks camera or library and answers an
    upright JPEG data URL — and `useGeoLocation` answers the flat native position. A native release bundle opened at
    `/` starts on its target's home, and a target opened in a browser is a web device.

  **Breaking, with a migration path.**

  - Delete the app's `ios/`, `android/`, `mobile/` folders and `capacitor.config.*`: `akan sync`, `akan doctor` and
    `akan quality scan` now refuse them in an app root and say why.
  - Move Capacitor settings to the keys above; `google-services.json` goes to `native.android.googleServices`, and
    `GoogleService-Info.plist` is no longer needed.
  - Removed: `-g/--regenerate`, `--open`, `--allow-provisioning-updates`, `configure-app`, `codepush`,
    `release-source`, `capacitor.base.config`, `useContact`, `useCodepush`, the native path of `useSpeech`, and every
    `@capacitor/*`, `@capacitor-community/*`, `@capgo/*`, `capacitor-plugin-safe-area`, `cordova-plugin-purchase`
    and `@trapezedev/project` dependency — `akanjs` no longer lists them as peers.
  - `baseSt` drops `deviceToken`; the notification store owns it.

- ccf2ae2: `native` in `akan.config.ts` replaces `mobile`, with each platform's settings in a section of its own

  **Breaking:** `mobile` is gone with no fallback; a config that still has it, or a key that moved, stops and names the
  new place. `native` and each of `native.targets` take the same fields, a target merging objects key by key and
  replacing lists and every other value, and without `targets` the app has one target, `default`. The next `akan start`
  removes the old `.akan/mobile`.

  The agent guide `akan agent install` writes now covers native apps: the `native` section, the `start-*` / `build-*`
  commands and updates, with the full contract in the `runtimeRule` guideline.

  | Before                                                                             | Now                                                                                                                                   |
  | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
  | `mobile`                                                                           | `native`                                                                                                                              |
  | `mobile.native.X`, `targets.<t>.native.X` (`plugins`, `ios`, `android`, `desktop`) | `native.X`, `native.targets.<t>.X`                                                                                                    |
  | `native.push.android`                                                              | `android.push`                                                                                                                        |
  | `native.privacy`                                                                   | `ios.privacy`                                                                                                                         |
  | `assets.icon`, `assets.splash`                                                     | `icon`, `splash`                                                                                                                      |
  | `files["ios/<path>"]`                                                              | `ios.files["<path>"]`                                                                                                                 |
  | `files["android/res/…"]`, `files["android/assets/…"]`                              | `android.files["res/…"]`, `android.files["assets/…"]`                                                                                 |
  | `deepLinks.ios.teamId`                                                             | `ios.teamId`                                                                                                                          |
  | `deepLinks.android.sha256CertFingerprints`                                         | `android.sha256CertFingerprints`                                                                                                      |
  | `indexPath` on a target only                                                       | on `native` too, inherited by every target                                                                                            |
  | root and target `plugins` joined, Android XML lists appended                       | the target's list replaces                                                                                                            |
  | `.akan/mobile/<target>/native/<platform>`                                          | `.akan/native/<target>/build/<platform>`                                                                                              |
  | `.akan/mobile/<target>/{dev,updates,web,bin}`                                      | `.akan/native/<target>/{dev,updates,web,bin}`                                                                                         |
  | `AkanMobileConfig`, `AkanMobileTargetConfig`                                       | `AkanNativeAppConfig` (resolved: `AkanNativeAppResult`), `AkanNativeTarget`; `AkanNativeSettings` is what `native` and a target share |
  | `AkanMobileUpdatesConfig`, `AkanMobileAppId`, `AkanMobileTargetDeepLinks`          | `AkanNativeUpdatesConfig`, `AkanNativeAppId`, `AkanNativeDeepLinks`                                                                   |
  | `AkanMobileNativeConfig`                                                           | `AkanNativeIosConfig`, `AkanNativeAndroidConfig`, `AkanNativeDesktopConfig`                                                           |
  | `AkanMobileTargetAssets`, `AkanMobileTargetFiles`                                  | removed: `icon`, `splash` and each platform's `files`                                                                                 |
  | `MobilePermission`, `MobileEnv`, `AppConfigResult.mobile`                          | `NativePermission`, `NativeEnv`, `AppConfigResult.native`                                                                             |

- 5f53462: `akan subspace upload-env <name>` sends one subspace's env to the cloud workspace it deploys from

  A subspace's `env/` values were the one thing the mirror had no way to move. Push holds them back and pull
  leaves them alone — deliberately, because the values belong to the repo that deploys — so getting a changed
  value into a customer's deployment meant running `akan upload-env` from somewhere that had both the values and
  that customer's `AKAN_WORKSPACE_ID`, which is nowhere: a workspace has every customer's values and exactly one
  id, its own.

  `SubspaceDeclaration` now carries an optional `workspaceId`, the cloud workspace that subspace deploys from,
  and `akan subspace upload-env <name>` uploads against it. `akan.subspace.ts` is a workspace-only entry that no
  push ever ships, so declaring every customer's id there puts none of them in a customer's repo.

  What is uploaded is the slice a push ships — the declared apps, the libraries their closure pulls in, and those
  apps' `secrets` globs — and nothing else. The whole workspace would be the simpler thing to send, and it is the
  wrong one: an env archive is replaced whole on arrival, so one customer's cloud workspace would end up holding
  every other customer's secrets. `CloudRunner.gatherEnvFiles` takes that scope and an archive path (the slice
  lands in `local/env.<name>.tar`, never over the full `local/env.tar`), while the `akan:secrets` block it
  maintains in the root `.gitignore` keeps being written from every app in the workspace — narrowing that file to
  one slice would silently un-ignore every other app's secrets.

  Because the upload replaces an archive in a repo you are not standing in, three things are refused rather than
  guessed: a subspace with no `workspaceId`, a subspace declaring this workspace's own id (a slice uploaded there
  would leave the workspace's next `download-env` short of every other app), and two subspaces declaring the same
  id. The command asks for confirmation before it replaces anything, naming the subspace and the cloud workspace;
  `-F, --force` skips the question, and with no terminal to ask in the command refuses instead of assuming yes.
  (`-f` is already `--format` and `-y` already `--verify`.)

  The direction is one-way on purpose. There is no `subspace download-env`: it would write a customer's values
  over the workspace's own copies, and which of the two is right is not something a command can know.

- ccf2ae2: `trustedDependencies` in `akan.config.ts` names the packages whose install scripts run where the app is installed

  `bun install --production` skips every dependency's install and postinstall scripts unless the package is trusted, so
  a native addon that builds itself at install time (one that ships no prebuilds) reached the image unbuilt and failed
  at its first call. An app or a lib now lists those packages in `trustedDependencies`; the built `package.json`
  carries the list, and both the image and a desktop app's server run their scripts. A lib's list reaches every app.

- ccf2ae2: Three grit rules keep app and lib code off the browser APIs that behave differently inside a native app, and each
  message names what to use instead.

  - `no-document-cookie` (error): an `app://localhost` page on iOS, macOS and Linux keeps no cookies, so
    `document.cookie` reads empty and drops writes in the app. Use `getCookie` / `setCookie` / `removeCookie` from
    `akanjs/client`.
  - `no-web-storage` (error): `localStorage` / `sessionStorage` work in the shells but bypass the store akanjs picks
    per platform and throw during SSR. Use `storage`, or `secretStorage` for credentials, from `akanjs/client`.
  - `no-web-only-api-outside-webkit` (warning): `navigator.share` / `canShare`, `navigator.serviceWorker`,
    `Notification.requestPermission` / `.permission`, `navigator.geolocation` and `navigator.vibrate` belong in a
    `webkit/` hook that branches on `isNativeApp()`.

  The first two apply to `apps/**` and `libs/**` outside tests, the third to the same files outside `webkit/`.

  **Breaking for a workspace that reads Web Storage or cookies directly:** `akan lint` now fails there. Move the
  call to the `akanjs/client` helpers, or keep it with `// biome-ignore lint/plugin: <reason>`.

- ccf2ae2: A Windows desktop release is signed with Authenticode

  With `AKAN_NATIVE_WINDOWS_CERTIFICATE` + `_CERTIFICATE_PASSWORD` (a `.pfx`), `AKAN_NATIVE_WINDOWS_THUMBPRINT` (a
  certificate in the store) or `AKAN_NATIVE_WINDOWS_SIGN_COMMAND` (a JSON array run once per file with `{file}`, for Azure
  Trusted Signing or a cloud HSM), `akan build-desktop` signs every PE file of the app — the executable, its DLL, the
  server's addons and `bin` — SHA-256 with an RFC 3161 timestamp (`AKAN_NATIVE_WINDOWS_TIMESTAMP_URL`), and verifies them.
  `--installer` signs the setup program and, through makensis's `!uninstfinalize`, the uninstaller it writes; the
  settings reach the signer through the environment only. `publish-update` signs a Windows release the same way, and an
  unsigned release build warns that SmartScreen flags a downloaded copy.

### Patch Changes

- 5f53462: fix(tunnel): reach the tunnel control plane at its real path, and report the status instead of parsing the error page

  `akan tunnel` and `akan start --share` could not open a share at all: `CloudApi` called `/api/requestTunnel`,
  `/api/tunnelListInSelf` and `/api/revokeTunnel`, none of which exist. An endpoint's path carries the model's
  refName — `fetch.serializer.ts` takes it from `sliceCls.srv.cnst?.refName` — so every database module's endpoints
  sit under a segment of their own and the service modules beside them do not. `tunnel` is a database module; its
  neighbours in the same file, `uploadEnv` and `getRemoteSelf`, belong to the `_cloud` service module and have no
  `cnst` to take a prefix from. The three paths now carry `/tunnel/`, with a note saying why they differ from the
  methods above them.

  **The 404 was invisible, which is the more expensive half.** `HttpClient.get` and `post` called `response.json()`
  without looking at `response.ok`, so the control plane's HTML error page reached the user as
  `JSON Parse error: Unrecognized token '<'` — a parse error where the status line had already said `404 Not Found`.
  Both now read the status first and throw with it, matching `getFile`, which has always done so.

  Three failures were being swallowed the same way and now surface:

  - `uploadEnv` returned the parsed error body, which is a truthy object, so **a failed env upload reported success**
    and the project went on to build against env that never arrived.
  - `getRemoteSelf` and `getRemoteAuthToken` are written to catch and answer `null`; with nothing thrown they
    answered an error object instead.
  - `refreshAuthToken` fed a rejected response straight into `toAccessToken`, minting a token from it.

- ccf2ae2: fix: a dev server whose replica crash-loops reports it at once

  When an app's `init` threw at every boot, the gateway gave up on the replica and waited for a code change, but the dev
  host kept reporting the app as starting: `akan start` showed no reason and held its next wave of apps for 180 s, and
  `akan start-desktop` waited 180 s before it gave up. The host now reports the app `failed` with the gateway's message
  as soon as it gives up; `akan start` keeps running and shows the app ready again after the fix is saved.

- ccf2ae2: A CSR page or layout whose async render throws says so, a cached page whose layout redirected renders again, and a
  dev client module that imports a macro builds.

  - An async render that rejected used to leave its layer blank with nothing in the console, since the promise's
    failure was dropped. It is now logged with the stack and the layer it belongs to (`render of page 2 of
/:lang/home failed: …`).
  - `akan:debug:frame` takes `memory` besides `1`: the frame trace goes to `window.__AKAN_FRAME_TRACE__` (the last
    2000 events) instead of the console. A native dev build mirrors each console call over the bridge, which slows the
    frame enough to hide a timing bug; `memory` does not. Async page and layout renders add `layer.render`,
    `layer.settle` and `layer.fail` events.
  - A cached page whose layout redirected renders that layout again when it is back on screen. Signed out, a
    layout that sends the person to the sign-in page kept its empty result, so the page stayed blank after the sign-in
    brought them back (a native app opens its home first, so it always did). A render that issued a redirect while it
    ran is now rerun the next time its page becomes current; `router.redirectCount()` is what it compares.
  - `window.__AKAN_DUMP_FRAME__()` reports the frame's location, stack and phase and every recent async page and
    layout render: settled or pending, still awaited, drawn. It records only the latest state, so it does not change
    the timing a trace would.
  - `akan start` no longer fails a dev client build with `ReferenceError: __akanMeta is not defined` when a file
    imports a macro (`useClient.ts`'s `with { type: "macro" }`) whose modules read `import.meta` at the top level.
    Bun applied the dev build's `import.meta` rewrite to the macro's modules too, and ran them where nothing declared
    the rewritten name; such a file now has its macros run by a build of its own first.

- ccf2ae2: A native dev build's API calls and sockets go through the dev gateway, so a phone on the same network — or the
  simulator, the emulator and a desktop app — reaches `akan start` without a reversed port.

  - A page the gateway served calls its own origin: `getEnv().serverHttpUri` is `<page origin><api prefix>` and the
    websocket follows it, unless `AKAN_PUBLIC_SERVER_URL` names a server. A release build is unchanged.
  - The iOS, Android and desktop hosts carry the method, the body and the request headers, `authorization`
    included, to the gateway; the gateway relays the app's `<prefix><websocketPrefix>` socket. Android hands the
    host no request body, so a call that carries one goes to the gateway's `http://localhost` origin directly and
    the server answers its CORS.
  - A desktop dev build opens the target's start page instead of `/`, and builds when the web root has no
    `index.html` yet.
  - `NativeWebDir` lists the web root in `/`-separated paths on Windows too.

- ccf2ae2: A native app can sign in through the system browser and hear the callback on every desktop OS.

  - `akanjs/client/native` exports `authSession` and its `AuthSessionApi` type, the runtime's system-browser sign-in,
    and `isNativeShell()`, true in any native shell; `isNativeApp()` stays iOS and Android only.
  - `getServerOrigin()` in `akanjs/base` is the server's origin as a browser outside the page opens it. For a page the
    native dev gateway served, that is the dev server (`http://localhost:<dev port>`), not the app origin the page
    calls; otherwise it is the origin of `getEnv().serverHttpUri`.
  - A native dev build on Android reverses the dev server's port as well as the gateway's, so a browser on the device
    reaches it.
  - A target with `deepLinks.schemes` ships `single-instance`. Windows and Linux open a link by starting the app again,
    and the hand-over is how the link reaches the running app. A second launch of such an app now hands over and exits
    instead of opening a second window, and a desktop debug build keeps the release app id, so it does the same while
    the release app runs.
  - In an app with basePaths whose only target names none, `start-*` and `build-*` without `--target` ask for a basePath
    instead of opening the root, which has no CSR page.

- 3ebd8e1: fix(agent): stop a workspace's agent guide and lint config from freezing at the release that created it

  `createWorkspace` copies the whole `templates/workspaceRoot` tree — 21 `.cursor/rules/*.mdc`, `AGENTS.md`,
  `biome.json`, `tsconfig.json` — but the only maintenance path, `generateAgentRules`, rewrites three of them, and
  `akan agent install` refreshes only the `akan:agent` block inside `AGENTS.md`. Twenty-one files created, three
  maintained: everything else was a one-time copy that no framework release could ever reach. Adding one lint rule
  meant writing the same sentence into `AGENTS.md`, `.cursor/rules/lint-enforced-rules.mdc`, its `.mdc.template`,
  `AGENTS.md.template`, `biome.json`, and `biome.json.template` — and even then, no existing workspace saw it.

  Four changes, ordered by how much drift each removes.

  **Lint config now extends a config shipped in the package.** `@akanjs/devkit/biome.base.json` carries the
  formatter, the rule set, and every grit plugin registration; a workspace `biome.json` is `extends` plus its own
  `files.includes`. Biome resolves the specifier through node*modules (it does not consult the package `exports`
  map), and `plugins` paths inside an extended config resolve from the entry config's directory, so the
  `./node_modules/@akanjs/devkit/lint/*.grit`form the template already used is correct. Rule changes now reach a
workspace on`bun update`with no command to run. Two merge behaviours decided the split:`overrides`concatenate,
so the generated-file opt-out moved there from`files.includes`, which \_replaces* and would silently drop the base
list the moment a workspace added one exclusion of its own. Because Biome moves rules between groups across minors
(`noUnnecessaryConditions`is`nursery`at 2.4 and`suspicious`at 2.5, and the old position is a hard error), the
base config and the Biome version travel together:`biomeBase.ts`pins the version`createWorkspace`installs
instead of resolving`latest`.

  **The conventions body moved into the managed block.** It now ships as the `conventions` guideline and renders
  between the `akan:agent` markers, so `akan agent install` refreshes it. `AGENTS.md.template` carried a _second_,
  independently written 990-line convention guide — not a copy of the repo's 791-line one, a parallel fork — which
  became the `workspaceOnboarding` guideline. Onboarding renders only outside the framework monorepo, where it would
  otherwise double an always-loaded file for readers who are changing Akan rather than building on it. The two
  guides still overlap and would repay a merge.

  **The 20 duplicate Cursor rules are gone.** `akan.mdc` is `alwaysApply: true` plus `@AGENTS.md`, so the per-topic
  `.mdc` files were a second copy of the same rules drifting on their own schedule. This repo had all 20 and no
  `akan.mdc` at all; it now has the pointer and nothing else.

  **`akan doctor` reports drift.** The block is stamped with the `@akanjs/devkit` version that rendered it, and
  doctor warns `agent-guide-stale` (or `agent-guide-unstamped`) with `akan agent install agents-md` as the repair.

  **`repoName` no longer comes from the folder name.** `WorkspaceExecutor.fromRoot` defaulted to
  `path.basename(process.cwd())`, so every generated file that names the repo — the `AGENTS.md` title, its `- Repo:`
  line — depended on what each person called the directory they cloned into, and the committed diff never settled.
  It now resolves from the `origin` remote, falling back to the directory name when there is no git or no remote.
  `AKAN_PUBLIC_REPO_NAME` is deliberately not consulted: that is a deployment namespace (queue prefixes, cache keys,
  secret paths) which a monorepo hosting several products legitimately points elsewhere.

  Two bugs surfaced on the way. `## Validation` listed `akan quality scan` and `akan quality ssr` in a _generated_
  section — hand-added, and due to be wiped by the next install; they are in the generator's list now. And
  `no-throw-raw-error` exempted `apps/akan/env/**` by name, so `apps/minimal/env/*` failed a rule the guide said did
  not apply to `env/`; the exemption is `**/env/**`. Lint output over the whole repo is otherwise byte-identical
  before and after, and formatter output is unchanged.

  Biome itself moves to **2.5.8** in the same change, so the shared config targets the current release rather than
  freezing the ecosystem at 2.4.4 — workspaces created before this already installed a 2.5.x, and pinning backwards
  would have made adoption a downgrade. The jump adds 263 diagnostics across the monorepo, but only **32 of them are
  in `apps/` and `libs/`** (30 `noUnnecessaryConditions`, 2 `useArrayFind`) and the rest are in the framework's own
  `pkgs/`. No scope regressed from passing to failing: `akan lint minimal`, the one green scope, is still green, and
  `apps/akan`, `libs/util`, and `libs/shared` were already failing on 2.4.4 with pre-existing errors. Every grit
  plugin was re-verified against 2.5.8. `noUnnecessaryConditions` stays at `error` and now reports 220 repo-wide,
  190 of them in `pkgs/` — a real backlog, and a deliberate one to leave visible rather than downgrade to a warning.

  Existing workspaces keep working untouched — they simply stay frozen at the release that created them, which
  `akan doctor` now reports. The migration guide walks through adopting the change in four steps, only one of which
  needs a human decision.

- ccf2ae2: `akan.config.ts` reaches the native settings a store release needs, and an app keeps a different id on each store.

  - `native.android.push` (channel, `smallIcon` relative to the app folder, `color`) and `native.ios.privacy` (the iOS
    privacy manifest) pass through, per target too.
  - `native.icon` takes `{ image, backgroundColor }` and `native.splash` the runtime's `{ image, backgroundColor,
autoHide, timeout }`, besides a path.
  - `appId` is a string or one per platform — `{ ios, android, default }` — for an app whose listings already carry
    different ids. The app-link files serve each platform's own id.

- 2d8de1c: fix(build): a barrel's own export wins over the same name a star re-export brings when imports are flattened

  The `barrelImports` rewrite turns `import { X } from "pkg"` into an import of the file `X` lives in. It read a barrel
  top to bottom and kept the first file it met for each name, so in `export * from "./a"; export { X } from "./c";`
  it sent `X` to `./a` — while in JavaScript a module's own export, named or declared, shadows whatever its stars
  bring, and `import("pkg").X` is `./c`'s. A flattened import could therefore bind a different value than the
  unflattened one. Each module's own exports are now mapped before its stars are walked, which is the ES rule; a name
  two stars both bring still goes to the first. No barrel in this repository had such a name, so its builds are
  unchanged.

- c45ac6c: perf(build): bundle every route's client entries in one pass instead of one per route

  `AllRoutesBuilder` ran a `RouteClientBuilder` per route, and each one calls `Bun.build`. Entries were already
  deduplicated globally through `knownEntries` — 169 routes produced 128 client entries — but **chunk splitting is
  scoped to a single `Bun.build` invocation**, so any dependency shared by entries that landed in different
  invocations was emitted once per invocation.

  In `apps/akan` that meant four complete copies of mermaid's parser layer. Six client entries reach
  `import("mermaid")` — `pkgs/akanjs/ui/Constant/Mermaid.tsx`, `Constant/Doc.tsx`, `apps/akan/ui/ModalTests.tsx`,
  `Docs/ConstantDocsDemo.tsx`, `Docs/Mermaid.tsx`, `SampleSchema.tsx` — and they were first discovered by four
  different routes, so each pass emitted its own 32-chunk, 868KB copy. The macro payload in `lib/useClient.ts` was
  duplicated the same way.

  Discovery now runs for every route first and the collected entries go through one build. Discovery does no
  bundling and is already cached per file, so the extra pass costs almost nothing.

  |                             | before | after  |
  | --------------------------- | ------ | ------ |
  | `.akan/artifact/client`     | 26 MB  | 8.1 MB |
  | `.akan/artifact/client-ssr` | 17 MB  | 4.7 MB |
  | chunks                      | 605    | 258    |
  | mermaid copies              | 4      | 1      |
  | build time                  | 12.9s  | 10.1s  |

  Client entries stay at 128 and the emitted manifest is unchanged: same 169 `routeIds` in the same order, the same
  151 `clientManifest` keys, and the same 114 `ssrManifest.moduleMap` entries. mermaid is still reached through
  `await import(...)`, so its chunk stays lazy and out of the initial load.

  **Only the production path changes.** `AllRoutesBuilder` is constructed once, by `applicationBuildRunner` with
  `command: "build"`. Dev keeps one build per route through `incrementalBuilder`, which is what makes an incremental
  rebuild cheap, and `discoveredEntries` / `clientDepsByEntry` — consumed only there — are untouched.
  `RouteClientBuilder` takes an optional `entries` list that skips discovery; dev never passes it.

- 2d8de1c: fix(build): each reason a failed bundle gives names the file and line it points at

  `akan build` and `akan start` listed the bundler's reasons under "Bundle failed" as bare messages, so
  `Could not resolve: "./not-there"` never said which file imported it. Each reason now carries the location Bun
  reports, relative to the workspace root:

  ```
  Bundle failed
    Could not resolve: "./not-there" (apps/demo/ui/Broken.tsx:2:22)
  ```

  A reason Bun gives no location for prints as before, and a file outside the workspace keeps its absolute path. An
  error a plugin raised while loading a file names that file without a line, unless its message already names it.

- ccf2ae2: fix(dev): the incremental builder's default memory ceiling is 2GB, up from 1.2GB

  - With no `AKAN_BUILDER_MAX_RSS_MB` set and no memory limit to take a share of, `akan start` now recycles its
    builder past 2GB instead of 1.2GB. apps/akan's builder peaks near 950MB holding the SSR registry's patcher through
    a route build, and arming CSR adds a second patcher, which left 1.2GB little room above ordinary work.
  - A container limit or `AKAN_MEMORY_LIMIT` still sets the ceiling at 35% of it, and `AKAN_BUILDER_MAX_RSS_MB=0` still
    leaves the builder unbounded.

- 5f53462: fix(cli): scaffolds name their guards, and the mobile and package commands do what they say

  Guards and templates:

  - The module scaffold's slice is `{ root: Admin, get: Public, cru: Admin }` when the workspace mounts libs/shared,
    and `{ root: None, get: Public, cru: None }` — closed until you name a guard — when it does not; its sample slice
    and the sample app's `inPublic` take `init({ guards: [Public] })`. `cru: Public` is gone.
  - `akan add-mutation` / `add-slice` write `mutation(Boolean, { guards: [None] })` / `init({ guards: [None] })` and
    import `None`, and their surface step returns a review note instead of stopping as unsupported.
  - The sample app's `SignedIn` admits only a caller with an identity (`id`, or libs/shared's `self` / `me`); a guest
    carries an account object too and used to pass. `CurrentUserId` reads the same three places, and the sample's
    task fixtures sign a user in through libs/shared when it is installed. Its spec holds no assertions.
  - Every scaffolded abstract has the current shape — a title, one sentence and `## Rules` — instead of six headings
    of placeholder text: `create-module` writes `# <model> Abstract` with its guard and soft-removal rules,
    `create-service` writes `# <service> Service Abstract` and `create-scalar` `# <scalar> Abstract`, each with a
    placeholder sentence and two placeholder rules. The sample app's task, noti and workHistory abstracts state their
    real invariants instead of describing the module layout. The dead `module/__model__.abstract.md` template is
    removed.
  - `create-crud-page` imports from the module's own client (`@libs/<lib>/client` for a lib module), and
    `create-package` writes a tsconfig that extends the workspace root from any depth and references no missing file.
  - `akan add-field --default now` (and every Date default) writes a thunk, `() => dayjs()`.

  CLI and mobile:

  - iOS usage-description keys map to Apple's real Info.plist keys (`NSPhotoLibraryAddUsageDescription`,
    `NSPhotoLibraryUsageDescription`, both location-always keys) instead of `NS` + the option name.
  - A non-main server's `assetlinks.json` also lists `<appId>.debug`, so a debug build's App Links can verify.
  - `start-ios` takes `--no-allow-provisioning-updates` (short flag `-a`); every boolean option that defaults to
    `true` now accepts `--no-<name>`.
  - `akan update` installs `@akanjs/cli@<tag>`, the package that provides the `akan` binary.
  - `sync-package` reads package dependencies again (the tsconfig paths start with `./pkgs/`).
  - The quality scanner no longer recommends the nonexistent `akan compact`; `AbstractDoc.compactMinLines` is gone.
  - `--role` lists `federation`, and `--since` names its units.

- 3ebd8e1: feat(lint): enforce the client/server import boundary in both directions

  The layering was documented but nothing checked it. A `.tsx` could `import * as db from "../db"`, a `*.service.ts`
  could `import { st } from "@libs/shared/client"`, and a `*.constant.ts` could reach either side — each one a value
  edge that drags the whole opposite graph along. In the client direction that means the database driver,
  `node:crypto`, and any secret resolved from `process.env` land in the browser bundle; in the server direction it
  means React, the store, and the browser globals underneath them load into every CLI command, worker, and migration
  that touches a service. Both usually fail the build rather than failing at runtime, and the failure names a
  transitive module, never the import that caused it.

  Two rules now hold the line, symmetric by design:

  - `no-import-server-in-client.grit` runs on client files (`ui/`, `webkit/`, `page/`, `*.store.ts`, every `.tsx`) and
    bans `*.document` / `*.dictionary` / `*.service` / `*.signal` modules, `srvkit/`, package `server` entrypoints
    including `akanjs/server`, and the `db` / `srv` / `sig` / `dict` / `option` / `useServer` barrels.
  - `no-import-client-in-server.grit` runs on server files (those four suffixes plus `srvkit/`) and bans `*.store`
    modules, module components (`*.Template` / `*.Unit` / `*.Util` / `*.View` / `*.Zone`), `ui/`, `webkit/`, package
    `client` entrypoints including `akanjs/client`, and the `st` / `store` / `useClient` barrels.

  Shared files — `common/` and `*.constant.ts` — are wired into **both** overrides, so they reach neither side, which
  is what makes them safe for either to import.

  `import type` is exempt in both directions: it is erased before bundling, so it emits no edge, and a shared file
  that only needs to name a server-side type (`libs/shared/lib/summary/summary.constant.ts` names `UserFilter` from
  `user.document`) stays legal. A mixed value-and-type import is not exempt — it emits a real edge. Test files are
  excluded, as are `pkgs/akanjs/**`, which implements the boundary and is where the two graphs legitimately meet.

  Both rules land green: no `apps/**` or `libs/**` file crosses the boundary today, so this is a ratchet, not a
  migration.

- 2d8de1c: fix(cloud): an `akan` command started while another is refreshing the cloud session waits for it

  A command that read `~/.akan/config.json` while another process was mid-refresh saw the session with its refresh
  token already taken and went ahead without signing in. It now waits for that refresh under the same lock and uses the
  session it stored.

- 2d8de1c: fix(cloud): a cloud session in its last hour is refreshed, once across every running `akan` process

  A stored cloud session within an hour of expiry, or past it, was treated as signed out: nothing ever called the
  refresh endpoint, so `akan login` reopened the browser about once a week and `akan tunnel` answered a raw 401 in
  that window. Every command that reaches the cloud — `login`, `upload-env`, `download-env`, `tunnel` and
  `start --share` — now refreshes such a session before using it, and `akan login` only opens the browser when the
  refresh fails.

  The refresh is written for a cloud that rotates the refresh token on every use and treats a second use as theft,
  revoking every session of the account, browser included:

  - It runs under a lock beside `~/.akan/config.json`, held across CLI processes, and re-reads the file once it has
    the lock, so of two commands started together only one refreshes and the other uses its result. A lock whose
    holder has exited is taken over; one whose holder is still running is waited for, and a refresh is never made
    without it.
  - The refresh token leaves the file before it is sent, and the new pair is written before it is used. A command
    killed mid-refresh, or a refresh that fails, therefore leaves no token that could be presented a second time;
    the cost is one browser sign-in.
  - Every other write to the file (hosts, remote env servers, test targets) re-reads under the same lock, so none can
    put back a token that was rotated away, and the file is replaced atomically with mode 0600, so a concurrent
    reader never sees half of it.

- 8c31d54: fix: `akan code` says when compaction failed, leaves the Claude Code-sized buffer, and resolves its default model

  **A failed compaction read as a successful one.** The engine reports a compaction that failed or was cancelled on
  the same `compaction_end` event as one that worked, with `errorMessage` and `aborted` beside the reason. The wire
  kept only the reason, so every end printed "Compacted the conversation" — including an automatic compaction that
  had failed, which nobody else reports, leaving the next sign of it an overflow error turns later. The `compaction`
  frame now carries `error` and `aborted`, and the transcript prints the engine's own sentence as a warning, or
  "Compaction cancelled.". A failed `/compact` still reports once, through the caller it threw to.

  **The buffer is 32,768 tokens, up from the engine's 16,384.** On a million-token window that moves the threshold
  from 98.4% to 96.7% — where Claude Code compacts. The reserve is all the room the response at the threshold gets
  (the request clamps its output to the window less the prompt less 4,096), so at 16k a reasoning model ran out
  mid-thought there and the recovery re-sent a near-full window to retry. It is also the summary's output cap at 80%.
  The small-window warning now reads the settings the session actually runs with rather than the engine's defaults.

  **The default model is `deepseek/deepseek-flash`.** `deepseek-v4-flash` is gone from both the engine's catalogue
  and DeepSeek's own model list, so the default resolved to nothing and `akan code` silently ran on whichever model
  sorted first among those with a key.

- 5f53462: fix(console): a production `akan console` brings services up and starts no schedule

  The `console.js` an `akan build` writes never marked its process as a console, so `server.start()` took the replica
  branch: it registered every `interval` / `cron` / queue worker, ran every internal `init()`, and opened the log
  transport — a second scheduler inside a running deployment. The shim now marks the process before it loads the
  server, the same way `akan console` does in development, so a console runs service and adaptor `onInit` and nothing
  the internals schedule.

  `assertAkanConsoleAllowed()` was handed `server.env`, which carries neither `environment` nor `operationMode`, so it
  effectively checked `NODE_ENV` alone. Called with no argument it now reads the deployment from `AKAN_PUBLIC_ENV` /
  `AKAN_PUBLIC_OPERATION_MODE` (deriving the mode the way `getEnv()` does): a `main` environment, a `cloud` or `edge`
  operation mode, or `NODE_ENV=production` refuses the console unless `AKAN_CONSOLE=1`.

- ccf2ae2: fix(dev): a CSR dev save reaches the open tabs before `app.js` is rewritten, and a tab opened in between boots once

  A dev CSR save used to rewrite the whole `app.js` before telling the open tabs about the patch, although only a tab
  that boots later needs it. The patch is now announced first and `app.js` follows. The manifest records which
  generation `app.js` holds (`appGeneration`), and the server holds a booting tab's `app.js?g=N` for up to two seconds
  until the file holds `N`, instead of booting it one generation behind and reloading it again. A build that died in
  that gap leaves `app.js` behind; the next update rewrites it even when nothing else changed.

- ccf2ae2: perf(dev): a CSR patch reaches the tabs before its module files and graph.json are written

  The dev registry announced a patch only after writing each changed module's file and the whole `graph.json`, which
  only the next build reads. The patch file and the manifest now go first, and the rest follows the announcement; a
  build that dies in between recompiles those files on its next run, since their mtimes no longer match the graph. The
  dev entry also stopped parsing every page with TypeScript on each save to see whether its default export is async:
  the result is kept per file until the file changes. On apps/akan a component save now reaches the tabs 72ms after the
  builder picks it up, down from about 200ms.

- ccf2ae2: perf(dev): a CSR dev save is patched by the resident builder, without spawning a build worker

  - The dev builder keeps the CSR registry's graph, manifest and module factories in memory and compiles a save itself.
    A save no longer pays for a build worker's spawn and imports (about 130ms on minimal) or a pass over every module
    file, and `app.js` is rebuilt from memory after the patch is announced.
  - A save that needs a whole-app build still goes to a build worker, which exits and returns its memory: a first build,
    a config or signal/dictionary change, a new npm module, and an import no recorded resolution answers.
  - The builder works in two lanes. A save's codegen and CSR patch run in one, and the file watcher waits only for it;
    build workers, route builds and client-entry discovery run in the other, where a batch queued behind another folds
    into it. Consecutive saves no longer wait behind each other's pages and css builds, and css now builds before pages.
  - `AKAN_DEV_CSR_PATCHER=off` sends every CSR save to a build worker as before. A builder that dies mid-patch turns the
    patcher off until the dev server next replaces its builder and backend together (a config, signal or dictionary
    change), and says so.

- 69f7178: fix(css): fail the build on a stylesheet import that resolves to nothing, and let a lib own its design tokens

  Two halves of the same problem, reported together. An `@import` the pipeline could not resolve was allowed to
  produce nothing, and a lib had nowhere to declare the colours its own components pin — so the workaround was to
  copy one vendor palette into every app's stylesheet, where a single missed import broke that app alone, silently.
  Since vocabulary closure (`@theme { --color-*: initial }`) makes a component whose token declaration never
  arrived render unstyled rather than wrong, the quiet half is the dangerous one.

  **Every specifier is verified, path-shaped ones included.** `@import "./missing.css"` and
  `@import "../../../libs/shared/ui/brand.css"` used to be turned into a path without asking whether a file was
  there, surfacing later as a bare `ENOENT` that names no importer — or, in the dev server, as one log line while
  the previous CSS kept serving. They now raise the same `[css] failed to resolve stylesheet import "…" from …`
  error a bare specifier already did, naming the path that was tried.

  **A package subpath resolves literally or not at all.** `@import "@libs/shared/ui/brand.css"` fell back to the
  package's own `style` entry (`pkg.exports["."].style`, `pkg.style`, `index.css`) when the subpath was not in
  `exports` — loading a _different_ stylesheet than the author asked for and reporting success. The fallback now
  applies only to the bare package name.

  **`libs/<lib>/ui/tokens.css` is the one CSS file a lib owns.** Plain `:root` custom properties for colours pinned
  by someone else's brand guide — Kakao `#fee500`, Naver `#1ec800` — or by a fixed surface. Every app whose page
  graph reaches that lib compiles the file automatically, ordered ahead of the app's own stylesheets so the app
  stays the last word on any variable both declare. Nothing is imported by hand and adding an app cannot forget it.
  Reference them as `bg-[var(--kakao)]`, which `no-arbitrary-color` allows by design; `@theme` extensions stay in
  the app stylesheet, because the colour vocabulary is closed per stylesheet.

  **A stylesheet under `page/` that no route imports now warns.** It compiles to nothing and reports success, which
  reads exactly like an empty theme — the failure the two fixes above cannot see, because nothing ever asked for
  the file.

  **An `@import` that resolved, was read, and still contributed nothing now warns twice over.** Custom properties
  declared outside `@theme` pass through Tailwind verbatim, so a stylesheet whose every declaration is missing from
  the output did not make it in, whatever dropped it — the last shape of this bug that no check upstream of the
  output can see. The compiled text is checked per compiled stylesheet, and the written asset is checked again
  against the imports of its own base path, because those are two different places a declaration can go missing: a
  build that ships a token to the CSR bundle and not to `styles/<base>-<hash>.css` renders unstyled on a
  server-rendered page while looking correct in the browser bundle. Each resolution also logs at `verbose` with the
  specifier, the importer, the resolved path, and the byte count.

  A name that survives only because something else declares it — an app overriding a lib token, which is the
  ordering this release introduces — keeps the check quiet: the warning fires only when _no_ declaration of the
  imported file's own names is present anywhere in the asset.

- 22aa04f: fix(devkit): stop a labelled tuple type from wiping every variant out of the build

  Since arbitrary variants were kept whole, a candidate could open with `[`, which also made every
  labelled tuple type in the tree look like a Tailwind arbitrary property —
  `[key: string, make: () => unknown]` in `constant/getDefault.ts`,
  `[setQueryArgs: (...) => QueryArgs, options?: FetchPolicy]` in `store/action.ts`. Tailwind compiled each
  into a rule whose declaration was TypeScript, and the lightningcss pass in `optimize()` could not parse
  it. Its error recovery does not stop at the offending rule: on `apps/minimal` it took 33KB of the
  stylesheet with it, and what it took was **every variant** — no `hover:`, no `focus-visible:`, no
  `disabled:`, no `sm:`/`md:`, no `dark:`, in a build that reported no error.

  What that looked like: buttons and badges with no hover or press feedback, inputs with the browser's
  own blue focus ring because `focus-visible:outline-none` was gone, a Switch whose knob never moved, a
  Tooltip that never appeared, a Popconfirm that lost its offset, and modals stretched to full width with
  their `sm:`/`md:` sizing missing. All of it from two type annotations.

  Brackets in a candidate may no longer contain whitespace. Tailwind spells a space in an arbitrary value
  `_`, so nothing legitimate is lost — `[&_td]:px-3` and `[&>*]:gap-2` still scan whole — while a tuple
  type, which always has a space after its `:`, no longer reaches the compiler. The cache version is
  bumped so extractions cached under the old pattern are re-read.

- 5f53462: `akan start` sizes its boot wave against the machine instead of always booting one app at a time.

  - With no `--concurrency`, the wave is `min(apps, half the memory budget / ~1.8GB per app, cores / 4)` and never
    below one, so a laptop boots its apps together while a small container still staggers them — which is the case
    the old default of 1 existed for. 1.8GB is a cold boot's peak: the SSR registry's boot build adds a build worker
    to every boot, and apps/akan's whole dev host peaks at about 1.76GB.
  - The next wave starts once each app of the previous one serves and its builder's boot builds have settled — the SSR
    registry's, and CSR's when `AKAN_DEV_CSR_REBUILD=1` arms it — or 30 seconds after it serves. The app shows as ready,
    and `--open` opens it, as soon as it serves.
  - The memory budget is the smaller of the host's RAM and `AKAN_MEMORY_LIMIT` / the cgroup limit. `os.freemem()` is
    not consulted: it counts free pages rather than reclaimable ones and reports ~0.3GB on an idle 48GB laptop, which
    would pin every machine to one app at a time.
  - The session prints the wave size and what set it, so a boot that still waits app by app says why.
  - `--concurrency <n>` is unchanged as an override and is clamped to the number of apps selected.

- ccf2ae2: feat(dev): a dev save now says where its HMR latency went

  - Each save carries epoch-ms marks from the file watcher to the page: the first fs event and the watcher's flush,
    the builder picking the batch up, the build worker's spawn, start and imports, the update on disk, the send, the
    backend's broadcast, and the page receiving and applying it. The page keeps the last 64 in `__AKAN_HMR_TRACES__`.
  - `AKAN_DEV_WATCH_DEBOUNCE_MS` sets how long the watcher collects changes before it hands a batch over.

- ccf2ae2: The dev module registries load packages that used to take the whole vendor file down with them

  - A module that reads `import.meta` (jotai's and zustand's ESM builds) no longer makes the vendor file a SyntaxError:
    `import.meta` is the module's own `{ url }`, as in a browser module, with no `env`, so an `import.meta.env` check
    branches as it does in the ESM bundle. `import.meta.url` is an http URL instead of this machine's `file://` path.
  - A package esbuild already bundled (the `@mermaid-js/parser` chunks) keeps its own `__reExport` / `__toESM` helpers
    instead of stopping the registry build, and a package file's `#!` line no longer breaks its vendor file.
  - A file the browser build tree-shook away (vfile, behind a side-effect-free barrel) resolves its imports with the
    browser condition, and a package `browser` field mapping a file or a module to `false` gives an empty module;
    neither reaches a Node built-in stub that throws at startup.
  - Every module factory is parsed as a classic script before it is written. A package file that cannot be one (a
    top-level await, or anything else a script cannot hold) is left out and named in the dev log, and requiring it
    throws why, where it used to fail the whole registry or drop every module of its vendor file in the browser; app
    code that cannot be one still fails the build. A registry built before this rebuilds once.

- 2d8de1c: fix(start): a route whose client code fails to bundle says why

  `akan start` bundles a route's client components the first time the route is requested. When the bundler refused
  them — an import that does not resolve, a syntax error — the builder reported only the bundler's own message,
  "Bundle failed", in the request's error, the build status and the dev log alike. It now lists the bundler's reasons
  under it, the way `akan build` and the rest of the dev build already did:

  ```
  Bundle failed
    Could not resolve: "./not-there" (apps/demo/ui/Broken.tsx:2:22)
  ```

- 69f7178: fix(dev): `akan start` is the dev server even when the environment says `NODE_ENV=production`

  An ambient `NODE_ENV=production` turned every route of the dev server into a 500:

  ```
  [SSR] render failed scope=/en/: [SSR] route /:lang missing from production artifact — rebuild with `akan build` to include it
  ```

  `WebRouter` picked its mode from `NODE_ENV` alone, so it installed the production route cache — the one whose
  `buildRoute` throws because `akan build` was supposed to have written a routes manifest already. A dev artifact
  never has one, so nothing could render, and the same ambient value also sent the gateway's runtime directory to
  `<workspace>/runtime` and baked production React into the dev bundles.

  The value does not have to be exported to arrive: Bun auto-loads the workspace `.env`, so a `NODE_ENV=production`
  line in a downloaded env file reaches the CLI while `env | grep NODE_ENV` in the shell stays empty. A CI image
  default or a container base image does the same.

  **The command now outranks the environment.** `akan start` pins `NODE_ENV=development` for the processes it
  spawns and for the in-process builder that bakes the value into dev bundles; `AkanApp` resolves a child's
  `NODE_ENV` from `AKAN_COMMAND_TYPE` before falling back to the inherited value; and `WebRouter` refuses the
  production branch outright while dev-hosted, warning once that it did rather than failing every request. Running
  a built artifact (`bun main.js`, Docker) is untouched — it carries no command type and keeps honouring
  `NODE_ENV`.

- bf27773: fix(cli): stop `akan start` from leaving the terminal in raw mode, which killed Ctrl+C

  A dev server that had been running for a few minutes stopped responding to Ctrl+C. The cause was not
  signal handling — the terminal had been left in **raw mode**, so with `isig` off the tty never turned
  `^C` into SIGINT at all. `kill -INT <pid>` still ended the process instantly, which is the tell.

  A Bun child snapshots the controlling terminal's termios when it is spawned and writes that snapshot
  back when it exits. ora's `discardStdin` holds the terminal raw for as long as a spinner runs, and the
  dev host spawns the builder and the backend under the "Preparing backend..." spinner — so those
  children snapshot a raw terminal. The spinner then restores it and Ctrl+C works, which is why a fresh
  `akan start` behaved. The first dev-host recycle (an `akan.config.ts` change, or regenerated runtime
  metadata such as `dict.ts` / `sig.ts`) SIGTERMs the builder, and its exit writes the stale raw termios
  back over a terminal nobody restores again. `Spinner` no longer takes stdin.

  Two nearby hazards with the same symptom are fixed as well.

  `Spinner` refuses to animate against a tty that reports **0 columns** — an unsized pty, which CI
  runners, `expect`/`script` harnesses and some detached panes produce. ora sizes its clear loop as
  `ceil(lineWidth / stream.columns)`, so zero made it `Infinity`: measured 750MB of cursor moves and
  8.7GB RSS inside a minute, in a loop past the point where SIGINT or SIGTERM could be handled, leaving
  SIGKILL as the only way out. Such a terminal now gets plain lines.

  `akan start`'s local-database teardown no longer hangs the exit. Registering a SIGINT listener
  replaces the kernel's "terminate now", so that handler became the only thing that could end the
  process — and it exited only if `docker compose down` succeeded. The teardown is now bounded
  (`ApplicationScript.dbShutdownTimeoutMs`, 20s), the exit runs even when it fails or times out, and a
  second Ctrl+C abandons it instead of queueing behind the first.

- ccf2ae2: perf(dev): a save starts building 50ms sooner

  The dev file watcher collected changes for 80ms before handing a batch over, the largest fixed wait in a save once the
  build is fast. It now waits 30ms. Measured on minimal, a CSR component save went from 340ms to 278ms, and a second write
  30ms after the first (a format-on-save) still produced one update, because the build reads the file's latest content.
  `AKAN_DEV_WATCH_DEBOUNCE_MS=80` restores the old window.

- 2d8de1c: fix(devkit): executor, doctor, barrel and code-agent fixes from the devkit/cli bug sweep

  - **Workspace apps, libs and packages are listed in name order**, not in the order the file system answered. It
    shows in pickers, `akan context` / `akan doctor` listings, the `## Workspace` lines `akan agent install` writes,
    and the order a lib's `docker.preRuns` / `postRuns` land in a generated Dockerfile, which is now the same on every
    build.
  - **Barrel import rewriting no longer drops re-exports when two barrels are analyzed at once.** Concurrent analyses
    shared one regex position, so a build could leave an import on the whole barrel, differently from build to build.
  - **`akan doctor`, `akan workflow validate` and MCP `doctor_workspace` ignore a malformed workflow artifact** instead
    of throwing a `TypeError`.
  - **`SysExecutor`'s module listings filter on each module's own file** — they returned every folder — and find a
    service module at `lib/_<name>/<name>.service.ts`. `getScalarDictionaryFiles` reads `lib/__scalar/`, and
    `getTsConfig({ refresh: true })` re-reads the config it extends.
  - `akan code`: a prompt typed instead of answering drops the questions and approvals it replaced, a session past
    512 KiB still shows in `/sessions`, and an MCP token refreshed without `expires_in` is kept until the server
    refuses it instead of being refreshed on every connect.

- 2d8de1c: fix(devkit): stop re-exporting `lowerlize` from `@akanjs/devkit/workflow`

  The re-export was CLI plumbing that leaked through the facet's `export *`: it existed so one CLI script could
  import it, and that script has imported it from `akanjs/common` for a while. Nothing else used it. The function
  itself is unchanged — import `lowerlize` from `akanjs/common`, which is where it always lived.

- ccf2ae2: fix(dev): a page that quotes `export default function` in a code snippet builds for the CSR dev page

  The Fast Refresh rewrite of `export default function Name(` also rewrote the same text inside a template literal or a
  block comment, and appended a second `export default` for it. The CSR bundle refused the result with `Multiple
exports with the same name "default"`, so `?csr=true` failed on any page quoting such a component — eight docs pages
  in the akan app — while SSR rendered them. Only a declaration the parser reports as an export is rewritten now.

- 69f7178: fix: the first field run's findings — request context, module identity, and an honest agent surface

  Six fixes from running the in-page agent on a real product app, plus the one its own docs app hit.

  **Server components see the request again.** The RSC worker wrapped a render in `requestStorage.run(...)` only,
  and the flight stream pumps components after that scope has exited — every `getSelf()` read no cookies and
  bounced authed pages to `/signin`. The worker now keeps a request fallback pushed until the render settles, the
  same discipline `ssrFromRscRenderer` already used. The stack is global and last-push-wins across concurrent
  renders; pumping the flight render inside the ALS scope itself is the follow-up that removes the caveat.

  **`akanjs/fetch` is a vendor shared module.** It was bundled separately into the app and the vendored
  `akanjs/store` chunk, so `FetchClient`'s static serialized-signal registry split in two and the agent catalogue
  silently read the empty copy — every endpoint-named action refused as undescribed. The registry also moved to a
  `globalThis` symbol (the anchoring the shared client proxy already had), so a future duplicated module instance
  degrades to nothing instead of an empty surface.

  **The relay's return scalar registers on the client graph.** `agentTurn` lived in `akanjs/signal`, which no
  client bundle loads, so the chat's first probe of `fetch.runAgentTurn` threw `No scalar constant model for
agentTurn`. The scalar now lives in `akanjs/fetch` and `FetchClient` itself force-registers it — Bun links a
  barrel's `export *` modules lazily per used binding and its transpiler drops unused imports, so only a real call
  survives to do that.

  **`labelOf` reads the `text: "title"` role as the `Set` it is.** It asserted `readonly string[]` and called
  `.find`, so every screen-context label on a search-indexed model threw.

  **`akan build` relaunches itself once with the app env in place.** Bun macros snapshot `process.env` at process
  start, so the env the build resolves and publishes later is invisible to them — and any hand-written
  `@libs/<lib>/server` import (the sanctioned cross-lib entrypoint) puts that lib's env files, which read
  `getEnv()` at module scope, into the `getSerializedSignal` macro graph. `AKAN_PUBLIC_APP_NAME` is the one
  required key a workspace root `.env` cannot carry, so the CLI build now spawns itself again with it set and the
  child does the real build — the `AKAN_PUBLIC_APP_NAME=<app> akan build <app>` workaround is built in. The
  relaunch decision compares the env the process was **born** with, never the live `process.env`: the command
  dispatcher writes the resolved app name into `process.env` before any command method runs, which satisfies
  runtime readers but not macros — a guard reading the live value never fires (that inert shape is what alpha.19
  shipped). A `Relaunching with AKAN_PUBLIC_APP_NAME=…` line in the build output is the observable proof. The
  generated `sig`/`dict`/`srv`/`db` barrels also stopped walking parent _server_ barrels (they import the lib's
  own `@libs/<lib>/lib/<facet>` modules after `akan sync`), and `FetchClient.from` resolves its origin tolerantly,
  so a lib whose graph stays clean serializes with no env at all.

  **The agent surface stops publishing two lies.** Form setters for the base document fields (`setIdOnX`,
  `setCreatedAtOnX`, `setUpdatedAtOnX`, `setRemovedAtOnX`) are no longer tools — the server stamps those. And an
  action named after an endpoint is published with the endpoint's schema only when it declares at least as many
  parameters: one declaring fewer would silently drop the borrowed tail and read stale form state, which shipped a
  resident SMS with the wrong unit number in the field run. Such an action is refused by name and warned once in
  the console; trailing extras beyond the endpoint's arguments stay legal, which is the generated
  `create<Model>(data, options?)` shape.

- 5f53462: The guideline set drops what only the removed code generator read

  Six guidelines existed for `AiSession`'s codegen contract and nothing else, and are gone:
  `docPageRule`, `docSyncRule`, `moduleCodegen`, `enumConstant`, `sharedUiUsage` and `utilUiUsage`. Nothing in the
  workspace or in any skill named them, and their bodies asked the model for a `// File: <path>` block contract that
  an agent with edit tools cannot use. `akan-module` no longer offers `moduleCodegen` as a deeper read.

  Every `<name>.generate.json` is deleted, along with `Prompter.getGuideJson` and the `GuideGenerateJson` /
  `GuideScan` / `GuideUpdate` types `@akanjs/devkit` re-exported. The `codegenPriority`, `scans` and `update.rules`
  fields they carried were read by nothing after the generator left; the only consumer was `akan guideline show
--format json` echoing them back.

  `akan guideline` therefore loses its `--format` option — `list` prints names and `show` prints one instruction,
  which is what both did in their default mode anyway. Guideline names drop from 35 to 29. What remains is the
  deep-dive set the `AGENTS.md` table points at, plus the three documents `akan agent install` composes the
  workspace guide from (`conventions`, `workspaceOnboarding`, `framework`). MCP `get_guideline`, the
  `akan://guidelines/<name>` resources and the `akan guideline list` / `show` commands are unchanged otherwise.

- 69f7178: feat(config): a lib's `externalLibs` reaches every app in the workspace

  `libs/<lib>/akan.config.ts` has always accepted `externalLibs` — it typechecks, `AkanLibConfig` resolves it, and the
  lib scan result carries it — but nothing ever read the value back. All three consumers (the backend and rsc-worker
  bundle externals, the SSR pages bundle, and the production `package.json` dependencies) read the _app_ config, so a
  lib wrapping a runtime-sensitive dependency had to ask every app to repeat the declaration. Forgetting one surfaced
  as a native package bundled into the app rather than as an error.

  An app's `externalLibs` is now its own declaration plus every lib's, deduped with the app's entries first. A
  workspace where no lib declares one resolves exactly as before.

  The libs are read workspace-wide rather than narrowed to the app's own dependencies. That set comes from the
  dependency scan, and the incremental page rebundle re-reads this config on every file change from a child process
  that never scans — so narrowing it would put a full dependency scan in the hot path. The trade is that a lib's
  declaration also lands in the production dependencies of an app that does not use that lib.

  `LibExecutor.getConfig({ refresh: true })` now busts the module import cache the way the app config already did, so
  a `libs/<lib>/akan.config.ts` edited while the dev server runs is re-read instead of returning the first-loaded
  module.

- 69f7178: fix(sync): hold libraries to the root layout allowlist, and check a library's own `page/` tree

  `apps/<app>/base` was refused by `akan sync`, `akan doctor` and `akan quality scan`; `libs/<lib>/base` passed all
  three. The rule lives in one file — `workspaceLayout.ts` exists precisely so the three tiers cannot disagree — but
  the call sites read it behind `exec.type === "app"` / `for (const app of context.apps)` / `segments[0] === "apps"`,
  so a library root was never compared to anything at all. A lib could carry a `base/`, a `helper.ts`, a stray
  `script/`, and every command stayed green.

  Libraries now answer to their own allowlist, and it is the app's minus what only an app can use: no `main.ts`, no
  `capacitor.config.ts`, no `.akan` / `android` / `ios` / `mobile` / `script` / `secrets`, because a library is never
  booted or packaged. `index.ts`, `README.md` and `tsconfig.spec.json` are added, since a library ships as a package.
  `public/` and `private/` stay, because `syncAssets` symlinks them into each consuming app.

  Three more places the same gate was one-sided:

  - `akan doctor` walked `context.apps` only. It now walks libraries too and reports `lib-root-unknown-entry` beside
    the existing `app-root-unknown-entry`.
  - `akan quality scan` warned on an unexpected app root _file_ and nothing else — not a library root file, and not a
    root _folder_ on either side, which is the shape `base/` actually takes. It now reports all four
    (`akan.layout.{app,lib}-root-{file,folder}`). Its `lib/` facet rule kept its own copy of the allowlist and flagged
    a `<model>.signal.test.ts` that `akan sync` explicitly permits; both now read the shared helper, and the rule is
    renamed `akan.layout.lib-facet-file` so its name no longer collides with the library root it was never about.
  - A library's `page/` folder was validated only once an app opted into it with `syncPageLibs`. An app checks route
    filenames in `getPageKeys`, which a library has no equivalent of, so `libs/<lib>/page/Component.tsx` synced clean
    in the library it belongs to and failed in somebody else's app. `akan sync <lib>` now reports it as a scan
    violation, from the same rule `validatePageSourceFile` throws — split out as `getPageSourceFileViolation` so the
    reason is available where throwing is the wrong answer.

- 69f7178: fix(lint): scope the module plugins to apps/libs, downgrade `noUnnecessaryConditions`, and stop truncating at 20

  Four reports from one workspace migration (5 apps, 11 libs, ~2,950 linted files), all in what the shared config
  and `akan lint` do rather than in what a rule finds.

  **`noUnnecessaryConditions` ships as `warn`.** Biome 2.5.8's inference, with `domains.types: "all"` on, is wrong
  on three shapes this framework uses everywhere — reproduced here, not taken on report: `useRef(false).current`
  narrowed to its initial literal, `useRef<HTMLTextAreaElement>(null).current` treated as non-null, a `#private`
  boolean flag narrowed the same way, and `RegExp.prototype.exec()` treated as non-nullable. Of 86 findings in the
  reporting workspace 65 were of those shapes, where deleting the guard is a null dereference. The 21 real findings
  are worth keeping, so the rule stays on as a warning rather than being dropped.

  **The akan-module plugins apply to `apps/**`and`libs/**` only.** `no-import-external-library` was scoped to a
  bare `**/index.ts`, so it fired on any package entry in the workspace — a Hardhat package whose public surface
  genuinely _is_ third-party types had no way out but a nested `biome.json` for the whole subtree, which replaces
  the parent's config rather than merging. Same scoping for `no-deep-internal-import`,
  `no-redeclare-predefined-endpoint`, `no-return-in-store-action`, `no-js-private-class-method`, and the
  server-component plugins. `no-bang-comment-in-client` stays broad on purpose: it is about browser-reachable code,
  not about akan module conventions, and a `//!` shipping to every visitor is no better in a plain package.

  **`**/lib/\_\_lib/**` joins the generated-file override.** It is scaffolded, gitignored, regenerated by `akan sync`,
  and unused-import-clean by construction — so `biome check --write` stripped the imports and the next sync put
  them back, 116 diagnostics per lap.

  **`akan lint` prints up to 200 diagnostics** and takes `--max-diagnostics <n>` (`0` for no limit). Biome's default
  is 20; a run that shows 20 of 44 reads as "20 problems left", so a change in the _mix_ of findings looks like
  progress.

  **`akan lint` pins the config path.** `biome.json` is strict JSON, and a JSONC comment in it makes Biome 2.5.8
  fall back to config discovery instead of reporting the parse error — it then aborts on whatever nested root
  config the walk finds, typically inside a directory `files.includes` excludes, naming a file the author never
  touched. With `--config-path` the parse error lands on the offending line. `Linter` and the workspace runner also
  accept `biome.jsonc`, which is where a comment is legal, and the workspace template now excludes `.claude` so an
  agent worktree's stale config is not in the walk to begin with.

  Grit plugin diagnostics _are_ suppressible, contrary to the report: the category is `lint/plugin`, so
  `// biome-ignore lint/plugin: <reason>` and `// biome-ignore-all lint/plugin: <reason>` both work. The bare
  `// biome-ignore plugin:` form Biome's own diagnostic label suggests does not. Written down in the agent guide.

- 5f53462: A server-side loopback fetch follows the port the process was actually run with, so a container started with
  `PORT=80` renders instead of failing every page with `base.error.serverUnreachable`.

  - `getEnv().serverPort` fell back to a literal `8282` on the server side, and only `akan start` ever set
    `AKAN_PUBLIC_SERVER_PORT`. A production image overriding the Dockerfile's `ENV PORT=8282` therefore bound one
    port and pointed the RSC worker's `fetch.*` at another; the SSR render failed on every route, with no other
    symptom than the transport error. When the origin resolves to `localhost` — the self-call — the port now comes
    from `PORT`. A `SERVER_HOST` naming another host is not a self-call and keeps the explicit port, and
    `AKAN_PUBLIC_SERVER_PORT` still outranks both.
  - `AkanApp` publishes the port it resolved as `PORT` to the replica it runs in-process and to every child it
    spawns, so `new AkanApp({ port })` reaches the tree the same way the env var does. In solo mode that is also
    what makes the option bind: `AkanServer` reads `PORT`, so an explicitly configured port was previously ignored.
  - `akan build` no longer publishes `AKAN_PUBLIC_CLIENT_PORT` / `AKAN_PUBLIC_SERVER_PORT` into the build process's
    own env. Bundling `define`s every `AKAN_PUBLIC_*` into a literal, so with `PORT_OFFSET` set the builder's dev
    port was baked into the artifact, where no deployment env could override it.

- 2d8de1c: fix(code): an MCP server that refuses a stored token gets one refresh before `akan code` asks for a sign-in

  `akan code` refreshed an MCP server's token only when the stored expiry said it had run out. A server that refused
  the token earlier — it was revoked, or it was a refreshed token the server issued with no lifetime, which is kept
  until refused — sent the session straight to `sign-in needed · /mcp login <name>`, even though the stored refresh
  token would still have worked.

  On a 401 at connect, a server holding a refresh token now gets exactly one refresh (or the token another session
  already stored since), and the connect is retried with it. Only when that refresh is refused, or the new token is
  refused too, is the server listed as needing a sign-in. A 401 is never retried a second time, so a server that
  refuses every token costs one refresh, not a loop.

- 2d8de1c: fix(code): an MCP tool call refused mid-session refreshes the token once and retries

  `akan code` refreshed an MCP server's token only while connecting. A token that expired or was revoked during a
  long session made every call to that server fail with `MCP server "<name>" requires authentication`, which named no
  way out, until the session was reloaded.

  A call answered 401 now gets one refresh (or the token another session stored since), reopens the server with it —
  on a new streamable HTTP session, since a server may bind its session to the token that opened it — and is retried
  once. If the refresh is refused, or the new token is refused too, the call fails with `MCP server "<name>" needs
signing in — /mcp login <name>`, and later calls to that server answer the same without refreshing again.

  Calls refused together share one refresh, and so does every connection in the process that would present the same
  refresh token — a sub-agent's, or one opening with an expired token — because a server that rotates refresh tokens
  may revoke the whole grant when one is presented twice. The token file's format and location are unchanged.

- 2d8de1c: fix(code): two `akan code` sessions refreshing the same MCP token make one refresh between them

  Every `akan code` process refreshes an MCP server's token itself, from the one token file they all share. Two
  sessions whose calls were refused at the same moment each presented the same refresh token, and a server that
  rotates refresh tokens refuses the second use — signing that session out, or revoking the whole grant.

  A refresh now runs under a lock file beside the token file (`mcpAuth.json.lock`, the same kind of lock `akan login`
  takes on `~/.akan/config.json`). The token is read again once the lock is held: if another session already replaced
  it, that token is used and no refresh is made. A lock left by a process that died is taken over; one a live process
  holds for more than 30 seconds reads as a failed refresh. The token file's format and location are unchanged.

- 2d8de1c: fix(code): `/mcp remove` says when the home file still declares the server, and honours `--local`

  `akan code` reads MCP servers from two files — `~/.akan/code/mcp.json`, which every repo reads, and the repo's
  `.akan/code/mcp.json`, which wins a name both declare. `/mcp remove <name>` takes the repo's entry first, so on a
  name both files declare the home file's declaration took over after the reload, possibly with a different command
  or url, while the notice read only "removed X from the workspace file". The notice now adds that the global file
  still declares it, so it still applies, and that running `/mcp remove X` again removes that one too.

  `--local` was accepted by `/mcp remove` and ignored. It now means what it means for `/mcp add`: this repo's file
  only. A name only the home file declares is left alone, and the reply says where it is declared.

  `McpServerConfig.remove(workspaceRoot, name, only?)` takes the scope as an optional third argument; without it the
  lookup order is unchanged. The `akan-code` skill's manual now names both files and both flags.

- 2d8de1c: fix(code): `/mcp` says `sign-in needed` for a server whose token stopped working mid-session

  An MCP server whose token could not be renewed during a session answered every tool call with `needs signing in —
/mcp login <name>`, but `/mcp` kept listing it as `signed in` — the state from when the session connected. Its row
  now turns to the same `sign-in needed · /mcp login <name>` a failed connect shows, and `/mcp <name>` says it needs
  signing in instead of listing tools that cannot answer; a server that failed to connect for want of a sign-in no
  longer claims it "connected and published no tools" there either. `/mcp login <name>` (or `/mcp reload` once a
  usable token is stored) reopens the session, and the server reads as signed in again.

- ccf2ae2: fix: a native target's dev build has its own output folder

  `akan start-ios`, `start-android` and `start-desktop` without `--release` built into the same
  `.akan/native/<target>/build/<platform>` as `build-ios`, `build-android`, `build-desktop` and `--release`, so a dev
  session deleted the release build there, a desktop installer included, and put a dev build under its name. Dev builds
  now go to `.akan/native/<target>/dev/<platform>`; the first dev session after the update builds from scratch once.

- ccf2ae2: `akan start-desktop`, `start-ios` and `start-android` print a page's log once, at the level it was logged, and say a
  boot came up in one line

  - A boot that comes up prints `cmdc ios ready · iPhone 16 · http://localhost:8283 · 12.4s` and nothing else; its steps
    (prepare, build, install, launch) are debug. A boot that fails prints every step it took ahead of the error. A native
    config warning still prints as it happens.
  - A page line reads `WARN  [page:WsClient] WebSocket message process failed …`: stamped once by the CLI's logger, at
    the page's own level, with no `[default]` label, no empty line after it, and a multi-line message kept together. A
    page logger writes `[Name] message` at the console method of its level inside a native shell, and the desktop host
    and iOS tag each line `[page<+><#window> <level>]` for the CLI to read back.
  - Android forwards the page console through the bridge in a dev build too, so logcat carries each line at its level
    and a `console.error("%s", …)` substitution the way the devtools show it; iOS writes os_log at the page's level. An
    uncaught error forwards its message along with WebKit's frames, which carry none.
  - Frame tracing (`[akan:frame:…]`) is opt-in (`?akanFrameDebug=1` or `localStorage["akan:debug:frame"] = "1"`) and
    logs at debug, once per event; a mobile or desktop target no longer turns it on for every visibility change.
  - Lines no page or host wrote (the simulator, WebKit) and where the host's pages come from are debug; `--verbose` shows
    the former. `start-desktop` and friends ask a dev server whose builder idled out for its health, not its home page,
    so they no longer report it missing while it wakes.

- c45ac6c: fix(lint): stop `//!` markers from shipping to the browser

  Bun's bundler classifies `//!` and `/*!` as legal comments — the `@license` / `@preserve` class it must preserve
  for licence compliance — and keeps them through `minify: true`. Everything else goes: `//`, `/* */`, `//*`, `//?`,
  and `// TODO:` are all stripped. But the workspace `AGENTS.md` prescribes `//!` as in-code marker 4, "disabled or
  must-fix code", so the convention itself guaranteed that internal notes about broken and unfinished code shipped
  verbatim to every visitor. A deployed app served eight of them in one chunk, including `//!env로 옮겨야함`,
  `//!need to change`, and `//! Need to fix after bunjs migration`.

  There is no bundler-side fix: `legalComments` is not a `Bun.build` option, and `Bun.Transpiler.transformSync`
  preserves `//!` too. The source is the only place to stop it.

  `no-bang-comment-in-client.grit` now bans the marker in browser-reachable code — `ui/`, `webkit/`, `common/`,
  `page/**/*.tsx`, `*.constant.ts`, `*.store.ts`, and the five module component suffixes — while leaving it legal in
  server, `srvkit/`, and CLI files, which never reach a bundle. The five existing occurrences in `akanjs` and the
  libs became `// FIXME:`.

  The rule anchors the marker to line start or to whitespace after code, so a literal like `"https://host//!path"`
  does not trip it. Comments are trivia rather than nodes, so the diagnostic spans the module and a marker on a
  file's very first line is invisible to the pattern — the one case the rule cannot see.

  Rebuilding `apps/akan` takes the bundle from two `//!` comments to zero, with the third-party `/*!` licence
  blocks left intact.

- f882bbc: feat(lint): `no-init-fetch-in-client` — keep slice hydration on the server

  `fetch.init<Model><Suffix>` is not a request, it is a hydration snapshot: `#registerSlice` composes it out of the
  slice's list and insight queries and returns a `ServerInit` whose only consumer is the `init` prop of
  `Load.Units` / `Load.View`, which seeds the store from it before React renders. `fetch.get<Model>Init<Suffix>` is
  the same call returning the payload alone. From a route both resolve before the first byte and the markup ships
  populated; from a client component they are two extra round-trips for a shell the browser already painted empty,
  landing in a local variable nothing reads — `Load.*` seeds state, so a value held in a client closure reaches
  nowhere. Nothing in the framework flagged this, and the mistake reads as an ordinary load.

  The fix the message points at is the route: `await fetch.initXInY(...)` in `page/**` and pass the result down as
  an `init` prop, or hand the unawaited promise to a `Zone`. The client is not missing the load either — every
  slice also generates `st.do.init<Model><Suffix>()`, which runs the same two queries and commits them to state.

  The gate is the file, not the call site. `"use client"` is anchored to `JsDirective`, so the same text as an
  ordinary string literal or inside a template-literal code sample — both common in docs pages — is not mistaken
  for the directive. `*.store.ts` is added by name, being client-only by role while carrying no directive.

  The name is matched by shape, a lint rule having no way to know which slices exist. The generated one is `init`

  - `Capitalize<refName>` + `Capitalize<suffix>`, so it always carries two capital-led segments; requiring the
    second is what keeps a hand-written `initPayment` / `initSession` endpoint out, and `initializeSomething` was
    never at risk since `init` is followed by a lowercase letter there. A custom endpoint spelling the generated
    shape exactly — `initPaymentSession`, `get<X>Init<Y>` — is the residue, suppressible with
    `// biome-ignore lint/plugin: <reason>`.

  `view` / `edit` hydrate the same way but are deliberately unmatched: `edit<X>` is a plausible custom endpoint
  name.

  A runtime guard was considered instead and rejected: CSR and Capacitor builds render route modules in the
  browser (`RootRenderLayer` in `pkgs/akanjs/webkit/bootCsr.tsx` awaits the page's own async render), so
  `typeof window !== "undefined"` holds for a perfectly correct page there and nothing at runtime can tell that
  apart from a client component calling the same thing after hydration.

- 69f7178: feat(lint): ban `cnst` model types in `*.Util.tsx` / `*.Zone.tsx` props

  `Util` and `Zone` are always client components, so a `cnst.Banner` / `cnst.LightBanner` prop is a hydrated class
  instance the server has to hand across the boundary — the functions are stripped on the way and what arrives is a
  plain object wearing the model's type. `no-model-type-in-util-zone.grit` reports it and points at the two shapes
  that work: take `bannerId: string` and read the model from the store, or take the payload the framework already
  serializes.

  Three exemptions, because none of them is an instance. `cnst.<Enum>["value"]` is an indexed access that resolves to
  a string union, which is how every enum prop in the codebase is already written (`roles: cnst.AdminRole["value"][]`).
  A `ClientInit` / `ClientView` / `ClientEdit` type argument is mapped through `GetStateObject<…>` before it reaches
  a prop, which is the sanctioned server-to-client handoff. A `ModelsProps<cnst.Setting>` type argument spends the
  model on `onClickItem?: (model: M) => unknown` and nowhere else, so it is the function-typed-prop exemption reached
  through a generic — whoever passes the callback is a client component already holding the value.
  `ModelProps<"setting", cnst.LightSetting>` stays reported: it spreads the model onto the props themselves, and the
  `Unit` / `View` files that take it are server components outside this rule's scope. Any _other_ indexed access is
  still reported — `cnst.Banner["image"]` is a `File`.

  The rule keys on the `cnst.` qualifier in a type position, so it never touches a value expression, and it is scoped
  to those two filename suffixes: `Unit` and `View` are server components and keep taking the model itself.

  Only prop positions are read: a `*Props` interface or type alias, and the inline object type on the component's own
  parameter. A `cnst` type that never leaves the file is not a boundary crossing and is left alone — a local
  annotation, a callback parameter the framework itself types with the model (`renderItem`, `renderList`), a
  module-scope helper, a non-`Props` local shape, and the props of a component nested inside another one. A
  function-typed prop (`onPick?: (t: cnst.LightTicket) => void`) is exempt too: a closure cannot cross the RSC
  boundary at all, so whoever passes it is a client component that already holds the value.

- 5f53462: fix(lint): `non-scalar-props-restricted` covers `*.Unit.tsx` and `*.View.tsx`

  The guide has always said a server component may not hand a function prop across the client boundary in a page, a
  Unit or a View, but the rule was scoped to `page/**` only. Units and Views are always server components, so a
  function prop there fails at the boundary at runtime; lint now says so first.

- ccf2ae2: `akan start` replaces its backend one restart at a time, so saves in quick succession can no longer leave a second
  gateway holding the port.

  - A save whose restart came due while the previous one still waited for the old backend to exit used to signal the
    same process again and then spawn a second backend beside the first. The host kept the one that lost the port,
    restarted it on every save, and the untracked one went on answering. A restart that comes due now runs after the
    one in flight, and a config or metadata recycle and `akan start`'s shutdown wait for it too.
  - A gateway that cannot bind its port no longer reports itself ready while it waits for its replicas to exit.

- 2d8de1c: fix(release): the published packages no longer carry test-run files from `local/`

  `akanjs` 3.0.0-beta.19 shipped 65 files (SQLite databases and logs, 820 KB) and `@akanjs/devkit` 2 from the
  gitignored `local/` directory the test suites write into, because both builds copied the package directory whole.
  `build-package` and `akanjs`'s own build now leave `local/` out, and `verify-akan-publish-packages` refuses a package
  whose pack list still contains it.

- c45ac6c: perf(build): precompress the CSS bundle, and serve brotli sidecars ahead of gzip

  The compiled stylesheet went out uncompressed in production. `precompressArtifacts` only walked
  `.akan/artifact/client`, so every JS chunk got a `.gz` sidecar while the CSS — written to
  `.akan/artifact/styles` — got none, and `#fileResponse` fell through to streaming the raw file. Nothing was
  wrong on the serving side: `#isCompressible` already accepts `text/css` and the sidecar lookup already ran.
  The file simply was not there. On one deployed app that was 319KB on the wire per cold load, against 45KB
  gzipped. The CSS is and always was minified — Lightning CSS runs in `prepareCssAsset` — so this is purely the
  transfer encoding.

  Sidecars are now written for `styles/` too, and a `.br` sidecar is written alongside every `.gz`.

  Brotli is tried first and gzip remains the fallback, because browsers only advertise `br` on secure origins.
  Quality is 11 for CSS and 9 for everything else: there is one CSS asset per basePath and it is the largest
  single file an app ships, worth ~20% over gzip for ~0.2s, while spending 11 on several hundred JS chunks costs
  ~12s of build time for a few hundred KB. Measured on `apps/akan`: 371 files, 14.5MB raw, 4.2MB gzip, 3.9MB
  brotli, and the CSS bundle 103KB raw → 16.2KB gzip → 13.0KB brotli. The compress phase went from ~0.3s to
  ~0.64s. Gzip sidecars moved to level 9, which is free at build time and was previously left at the default.

  Encoding negotiation moved out of `WebRouter` and `AkanApp` into `resolveEncodedSidecar`. Both classes carried
  their own copy of the gzip lookup plus `#acceptsGzip` / `#isCompressible`, and a gateway that disagrees with
  its child about which encoding a request accepts serves a body the caller cannot decode. The shared version
  also honours `q=0` as the refusal it is, and no longer treats a token merely starting with `br` as brotli.

  **Anything caching in front of the app must pass `Vary: Accept-Encoding` through.** The header was already
  set, but it only mattered when one encoding was on offer; with two, a proxy that drops or ignores it will
  hand a brotli body to a client that asked for gzip. Artifacts now carry both sidecars, so a build's static
  output grows by roughly the brotli total (3.9MB for `apps/akan`).

- 5f53462: feat(route): a route's head is JSX only, and analytics is the app's own component

  **`.metadata()` is gone, along with the `metadata` / `generateMetadata` exports and the `AkanMetadata` type.** A route
  had two ways to say the same thing — an object of `title` / `description` / `openGraph` / `twitter` / `alternates`
  that the server translated into tags, and `.head()` taking the tags themselves — and could use only one of them per
  module. Every app in the workspace already wrote `.head(<>…</>)`. Rewrite an object as the tags it produced:

  ```tsx
  .head(({ projectId }) => (
    <>
      <title>{`Project ${projectId}`}</title>
      <meta name="description" content="Project workspace" />
      <meta property="og:image" content="/og/project.png" />
      <link rel="canonical" href="https://example.com/project" />
    </>
  ))
  ```

  A legacy route that still exports `metadata` or `generateMetadata` now fails the load as an unsupported export,
  the same way any other stray export does. The hreflang alternates Akan adds per locale are unchanged; the only thing
  that could suppress them was an `alternates.languages` object, so leave them out of the JSX.

  **`.gaTrackingId()` and the `gaTrackingId` export / `System.Provider` prop are gone.** Which tags load, in which
  environment and behind which consent banner are the app's decisions, and the framework's built-in `Gtag` made none
  of them. Render a `"use client"` component that loads gtag.js from the root layout's `.render()` instead — the
  routing guide has one. GA4's Enhanced measurement already counts the router's `history.pushState` navigations, so
  the component only loads the tag.

  The head-snapshot path used by the experimental partial commit (`AKAN_PUBLIC_RSC_PARTIAL_COMMIT=1` with
  `rscPatchHeadSafe`) was fed only by the metadata object, so it now always falls back to a full navigation.

- 5f53462: fix(build): the production server bundle keeps its identifiers, so a class still names its own log lines

  `akan build` compiled `main.ts`, `server.ts`, the RSC worker and the console runtime with `minify: true`, which
  includes `identifiers`. Renaming every class in a server bundle is renaming the only identity several parts of
  the framework read back at runtime:

  - `serve()` gives each service `new Logger(this.constructor.name)`, so a production log line read
    `[P6e] ... Updating 0 Floors' Awairs Latest Air Data` — the class the message came from is exactly what a log
    filter (`akan logs --child`, `--grep`) needs and the one thing the record no longer carried.
  - `Exception` and `Err` set `this.name = this.constructor.name`, so a 500's logged error name was mangled too.
  - A guard's `static name = "User";` is what `fetch` serializes, what the API explorer filters on, and what
    `mcpExposure` compares against `"Public"`. The convention held the framework's own guards together; a guard
    that omitted it silently published a two-letter name.
  - Every frame of every stack trace lost its function and class name, on a single-line bundle that has no
    source map to fall back on.

  Server bytes are read from the image, never sent to a client, and the measurements say identifier mangling was
  not buying much: on `minimal`, `server.js` grows 5.5MB → 7.4MB, boot moves 202ms → 206ms (median of five), and
  peak RSS stays inside the noise band. `minify.whitespace` and `minify.syntax` are unchanged, and the browser
  bundles — CSR, page and client entries — still mangle identifiers, where the bytes actually travel.

  `minify.keepNames` would have been the narrow fix; Bun 1.4.2 accepts the flag in `BuildConfig` and renames
  classes anyway, which `applicationBuildRunner.test.ts` now pins so the flag can be adopted when it lands.

- 69f7178: fix(build): target the server when bundling `client-ssr`, so SSR keeps happening

  `ClientEntriesBundler` hardcoded `target: "browser"`, and both bundles go through it: the browser one under
  `client` and the **server-executed** one under `client-ssr`, which `SsrFromRscRenderer` loads with
  `await import(chunkId)`. The browser target resolves the `browser` export condition, so a dependency whose
  `browser` entry touches a DOM global at module scope threw the moment the SSR renderer imported the chunk.

  That throw lands while React is rendering the shell, so the failure is not scoped to the offending subtree — the
  whole document degrades to client rendering, with one browser console line (`Switched to client rendering because
the server rendering errored: document is not defined`) and a ~1KB server body holding nothing but an empty
  Suspense placeholder. It was reported against `react-markdown` → `micromark` →
  `decode-named-character-reference`, whose browser entry is `const element = document.createElement('i')`, and it
  hit **every** route: the generated root layout imports the app store, so the shared UI graph is in every client
  entry's SSR chunk graph.

  `ClientEntriesBundler` now takes the target as an option — still `"browser"` for the browser bundle — and
  `resolveSsrClientBundleOptions` (was `resolveSsrClientExternalOptions`) carries `target: "bun"` for `start` and
  `build` alike, so neither `client-ssr` call site can drift. `conditions: ["node"]` is not a fix: Bun _adds_
  conditions to the target's defaults, so `browser` still wins. The target itself has to say server.

- ccf2ae2: feat(dev): SSR pages load their client code from a dev module registry

  - Under `akan start`, an SSR page's `"use client"` code now comes from a module registry under
    `.akan/artifact/ssr-dev`, the same machinery the dev CSR registry uses, instead of the route chunks. React and the
    akanjs vendor facets stay the import map's, so the page keeps one React and one store registry. The route chunks and
    the `client-refresh` that re-imported all of them are gone from dev; `akan build` is unchanged.
  - A save patches the changed module in place with React Fast Refresh: state stays, and on minimal a component edit
    shows in about 110ms instead of 900ms. Undoing an edit now shows too; with chunks the browser kept the module it had
    already imported for that URL. A client module the RSC payload names that also exports constants re-runs in place.
  - A save that changes nothing the server renders (a `"use client"` module that keeps its export names, or a module only
    client code imports) keeps the page's build id and refetches no RSC payload. One that does — a component both sides
    render, a constant — holds its client patch until that save's pages build lands, then sends the patch and the RSC
    refresh together, so the page never runs new client code against old server props. A constant edit that reloads
    waits for that build too, and a backend restarted by a server-only save renders from the latest pages build.
  - The registry builds once in a build worker after the dev server boots, beside the builder's slow lane, and each route
    build adds the entries its page names that the registry lacks; a page served before the registry exists waits for
    it in the browser, in short holds. Route builds no longer bundle browser chunks in dev, which took about 240MB off
    the builder's peak on apps/akan.
  - Most saves are patched in the resident builder: a new file, a new import from a package something already resolved,
    a moved or renamed file (a case-only rename, `Foo.tsx` to `Foo/index.tsx`, a file created beside a folder an import
    resolved to), a deleted module brought back. A whole build in a build worker is left for a new npm package, a signal
    save (its metadata is inlined into the client runtime; a dictionary save does not rebuild the SSR registry, which
    inlines none), and a registry whose last whole build was cut short. A save that does not compile — a typo in an
    import included — is reported by the builder at once, and the save that fixes it patches in about 120ms.
  - A failed build keeps the registry the tabs and the next save read. Its error stays on the overlay, is shown to a tab
    opened while it stands, and clears with the save that fixes it — for a route that failed on a shared module too,
    which is built again once a newer build goes green. A broken file no page imports any more stops failing saves.
  - A client module whose top level threw, or a store that throws at startup, recovers with the save that fixes it, and
    the dev server's error page carries the HMR client, so it reloads once the fix lands. A pages bundle that builds but
    throws while it loads shows its error while the RSC worker keeps serving the bundle it had.
  - A tab that reconnects after a backend restart loads the patches it missed and refetches its payload instead of
    reloading; one that reconnects to a new dev session (a new `akan start`, a config restart) reloads onto its registry.
    A tab that booted beside the vendor file of the build before loads the newer one, so a new npm import in a leaf
    component works without a manual refresh.
  - A build worker exits with the builder that spawned it, and a boot build whose worker was killed is retried after 10
    seconds. On Windows, registry writes retry a rename refused while a reader holds the file, and a build worker hashes
    the same bundle config as the builder, so saves are not all handed to whole builds.

- 2d8de1c: fix(code): at most `maxConcurrent` sub-agents run at once across the whole tree

  `/agents` says a profile runs sub-agents "at most N at once", but each `task` pool counted only its own children,
  so a child agent could open N of its own while its parent's N were still running — with the shipped presets (two
  levels, three at once) up to 12 sub-agents ran at once instead of 3.

  The running count now travels with the tree's token tally (`SubagentSpend` gained `running`), so every pool of one
  tree checks the same number. A `task` over the limit is refused, as before, and never queued: every ancestor keeps
  its slot while it waits on its child, so a queued child would deadlock the tree. The refusal tells an agent that has
  sub-agents of its own running to wait for one of them or do the work itself, and one that has none to do it itself.

- 2d8de1c: fix(code): a sub-agent that fails or is stopped still spends from the tree's budget

  A sub-agent's tokens were added to the tree's tally only when its run returned normally. One whose run threw — a
  provider or engine error after it had already spent tokens — added nothing and said nothing, so a tree of failing
  sub-agents could spend past the budget without `task` ever refusing; one stopped by its parent's interrupt was
  counted but announced as "finished".

  Each sub-agent's own tokens are now added exactly once however it ends, and the notice says how it ended:
  `explore sub-agent finished|failed|stopped, N tokens (M of B spent)`. A sub-agent's own children are still counted
  by its pool, so nothing is counted twice.

- 2d8de1c: fix(code): an interrupt that lands before a sub-agent's run is live stops it

  A sub-agent listened for its parent's interrupt only once it had been created, and the engine ignores an abort that
  arrives before a run is live. So an interrupt pressed while a `task` was still opening its sub-agent — connecting
  its MCP servers, say — or in the moment between that and the sub-agent's run starting was lost: the sub-agent ran
  its whole task anyway, and in the second case its notice even said "stopped".

  A sub-agent whose parent was interrupted while it was being created now never starts, and one interrupted after that
  is stopped as soon as its run is live. Either way it reports `stopped`, and its tokens are added to the tree's tally
  once.

- 2d8de1c: fix(code): every sub-agent of one tree draws on one token budget

  A profile's `subagent.budget` is documented, and shown by `/agents`, as the tokens "a whole subagent tree may
  spend", but each `task` pool kept its own count. A child's pool started from zero against the same ceiling and
  counted only its own children, so with the shipped presets (two levels, three at once) a tree could spend several
  times the budget before anything refused.

  The count is now one object for the whole tree: the root pool starts it, hands it to every child agent it opens
  (`CodeAgentOptions.subagentSpend`, forwarded through `AkanCodePlugins` to the child's pool), and each sub-agent's
  tokens are added to it when that sub-agent finishes. Once the tree has spent the budget, `task` refuses at every
  level, and the "sub-agent finished" notice reports the tree's total. Depth and concurrency limits are unchanged.

- 5f53462: The CLI's AI editor is removed, and with it the `--ai` commands

  `AiSession` — the langchain-backed editor that asked a model to write module constants, dictionaries, scalars,
  UI components, guideline instructions and abstract files — is deleted, along with every command that drove it.
  Gone: `akan set-llm`, `akan reset-llm`, `akan ask`, `akan compact`, `akan generate-instruction`, `akan
update-instruction`, `akan generate-document`, `akan reapply-instruction`, and the `--ai` flag on `akan
create-module` and `akan create-scalar`. The scaffolding halves of those two commands are unchanged and are now
  what they always do.

  `akan guideline list` and `akan guideline show` are unaffected — guidelines are bundled files the CLI reads and
  never writes, and MCP `get_guideline` serves the same ones. `akan quality scan` still warns on an abstract past
  300 lines; there is no longer a command that rewrites one for you.

  The `@langchain/*` dependencies leave `@akanjs/cli`, `@akanjs/devkit` and the workspace root — they were the
  heaviest lazy-loaded stack the CLI carried, and `EntryModuleGraph` no longer has to guard against one reaching
  an entry. The workspace-global config at `~/.akan/config.json` no longer holds an LLM key; an existing `llm`
  entry is ignored and can be deleted.

  This is the dev-time editor only. The in-page agent's runtime `LlmAdaptorRole`, `option.setLlm(...)` and the
  shipped adaptors are a different surface and are untouched.

  Step-by-step migration: `akan guideline show workspaceRecipes`, Recipe 8.

- 2d8de1c: fix(build): `export *` in a `"use client"` module is a build error, and a dev build failure says why

  The server replaces a `"use client"` module with one client reference per name the module exports, and the names
  come from Bun's export scan — which reports none through `export * from "./x"`. So a star re-export in a client
  module registered nothing: a star-only file was silently no client boundary at all, and a file mixing named exports
  with a star lost the star's names on the server, where they were `undefined` in a server component while the same
  import worked in a client one. `libs/shared`'s `User.Template.tsx` did exactly this with the leave-flow components.

  Like Next.js, the build now refuses it, in `akan build` and `akan start` alike, naming the file, the specifiers and
  the fix:

  ```
  libs/shared/lib/user/User.Template.tsx is a "use client" module, so it cannot `export * from "../../ui/UserLeave"`:
  the server sees only the names a client module declares, and a star re-export declares none. Re-export them by
  name — `export { … } from "../../ui/UserLeave"`.
  ```

  `export type * from` and `export * as ns from` stay allowed, and a module without the directive is untouched. A
  barrel that mixes client-only files with isomorphic ones should drop the directive instead: each client file keeps
  its own, and the barrel stays importable on the server.

  A failed bundle during `akan start` used to report only the bundler's own message, "Bundle failed". The dev build
  now prints the reasons nested under it, the way `akan build` already did.

- 2d8de1c: fix(windows): `akan` commands and the dev build worker no longer stop silently at a missing file

  On Windows, Bun lets a process exit while a `Bun.file` read of a file that does not exist is still pending, if
  nothing else is keeping it alive. `akan build` stopped right after `sync` without an error, and the dev server's boot
  build ended with "build worker exited with code 0 before reporting a result" on any app that had no font cache yet.
  The CLI and its build workers now await their work from the entry module, which keeps the process alive until it
  settles; a failed command still prints its error once and exits 1.

- ccf2ae2: fix(cloud): on Windows, a `~/.akan/config.json` write waits for another command's read instead of failing

  Windows refuses to rename over a file another process has open, and every `akan` command reads `config.json`
  outside its lock. On a Windows VM, a writer racing two readers had 1374 of 1579 renames fail with `EPERM`. A token
  refresh that lost that race fell back to the stored session. A session in its last hour is sent without
  `Authorization`, so one of two commands started together saw the cloud as signed out. And when the lost write was
  the one after the refresh, the rotated refresh token was never saved, so the next command had to sign in again.
  `GlobalConfig` now retries the rename on `EPERM`, `EACCES` and `EBUSY` for up to about five seconds on Windows.
  Under the same two readers, every write landed, the slowest after 40 tries (1.9s).

- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [69f7178]
- Updated dependencies [69f7178]
- Updated dependencies [69f7178]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [f882bbc]
- Updated dependencies [8c31d54]
- Updated dependencies [5f53462]
- Updated dependencies [69f7178]
- Updated dependencies [5f53462]
- Updated dependencies [f882bbc]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [f882bbc]
- Updated dependencies [f882bbc]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [69f7178]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [69f7178]
- Updated dependencies [f882bbc]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [69f7178]
- Updated dependencies [69f7178]
- Updated dependencies [5f53462]
- Updated dependencies [69f7178]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [f882bbc]
- Updated dependencies [69f7178]
- Updated dependencies [69f7178]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [c45ac6c]
- Updated dependencies [69f7178]
- Updated dependencies [69f7178]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [2d8de1c]
- Updated dependencies [5f53462]
- Updated dependencies [8c31d54]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [69f7178]
- Updated dependencies [69f7178]
- Updated dependencies [69f7178]
- Updated dependencies [f882bbc]
- Updated dependencies [2d8de1c]
- Updated dependencies [69f7178]
- Updated dependencies [5f53462]
- Updated dependencies [22aa04f]
- Updated dependencies [69f7178]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [2d8de1c]
- Updated dependencies [69f7178]
- Updated dependencies [2d8de1c]
- Updated dependencies [2d8de1c]
- Updated dependencies [2d8de1c]
- Updated dependencies [f882bbc]
- Updated dependencies [69f7178]
- Updated dependencies [f882bbc]
- Updated dependencies [f882bbc]
- Updated dependencies [5f53462]
- Updated dependencies [22aa04f]
- Updated dependencies [69f7178]
- Updated dependencies [2d8de1c]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [f882bbc]
- Updated dependencies [69f7178]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [3ebd8e1]
- Updated dependencies [326da07]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [c45ac6c]
- Updated dependencies [2d8de1c]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [22aa04f]
- Updated dependencies [f882bbc]
- Updated dependencies [2d8de1c]
- Updated dependencies [5f53462]
- Updated dependencies [c45ac6c]
- Updated dependencies [f882bbc]
- Updated dependencies [2d8de1c]
- Updated dependencies [ccf2ae2]
- Updated dependencies [2d8de1c]
- Updated dependencies [ccf2ae2]
- Updated dependencies [f882bbc]
- Updated dependencies [326da07]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [2d8de1c]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [2d8de1c]
- Updated dependencies [2d8de1c]
- Updated dependencies [2d8de1c]
- Updated dependencies [f882bbc]
- Updated dependencies [f882bbc]
- Updated dependencies [69f7178]
- Updated dependencies [2d8de1c]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [bf27773]
- Updated dependencies [2d8de1c]
- Updated dependencies [5f53462]
- Updated dependencies [69f7178]
- Updated dependencies [5f53462]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [ccf2ae2]
- Updated dependencies [2d8de1c]
- Updated dependencies [2d8de1c]
- Updated dependencies [2d8de1c]
- Updated dependencies [2d8de1c]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [ccf2ae2]
- Updated dependencies [5f53462]
- Updated dependencies [f882bbc]
  - akanjs@3.0.0

## 2.4.2

### Patch Changes

- Updated dependencies [6d58c7e]
- Updated dependencies [11aa655]
- Updated dependencies [25d5b15]
- Updated dependencies [11aa655]
- Updated dependencies [11aa655]
- Updated dependencies [25d5b15]
- Updated dependencies [42cf7a2]
- Updated dependencies [25d5b15]
- Updated dependencies [04cb46d]
  - akanjs@2.4.2

## 2.4.1

### Patch Changes

- Updated dependencies [473be34]
- Updated dependencies [f5bfa27]
- Updated dependencies [473be34]
- Updated dependencies [068158b]
- Updated dependencies [46a1a4a]
- Updated dependencies [90c6597]
- Updated dependencies [aca901d]
- Updated dependencies [068158b]
- Updated dependencies [cb895b7]
- Updated dependencies [f8a9bc5]
- Updated dependencies [d973712]
- Updated dependencies [068158b]
- Updated dependencies [cc3dd40]
- Updated dependencies [8a2b795]
- Updated dependencies [068158b]
- Updated dependencies [473be34]
- Updated dependencies [e5fde3b]
- Updated dependencies [473be34]
- Updated dependencies [f28466f]
- Updated dependencies [51851fa]
- Updated dependencies [1c3436f]
- Updated dependencies [128e9a3]
- Updated dependencies [a5d4a8a]
- Updated dependencies [473be34]
  - akanjs@2.4.1

## 2.4.0

### Minor Changes

- 23d43b3: Harden dev host recovery during failed builds:

  - Defer builder/backend recycle while a generation's build is still failing
  - Merge deferred invalidate batches so restarts cover every skipped change
  - Recover the builder with exponential backoff instead of giving up
  - Revive a backend that gave up once the build goes green again
  - Resurrect dev children after a failed recycle so the error overlay stays reachable
  - Enter degraded builder boot mode on compile errors and retry on the next edit
  - Announce recovered pages/css state after a degraded boot succeeds

- 18abf71: Improve dev server stability:

  - Add `isPortInUseError` utility for detecting EADDRINUSE across Bun versions
  - Stop crash-looping replicas after max boot failures in dev mode (`akan start`)
  - Handle parent IPC disconnect to prevent orphaned gateway/child processes
  - Report `wsUpstream` in ready IPC so gateway routes to the actual bound port
  - Fall back to ephemeral port when preferred WS port is in use
  - Support controlled dev-host restart on config changes (`akan.config.ts`, `tsconfig`)
  - Forward backend build-status IPC to dev host for error surfacing in HMR overlay
  - Limit backend recovery attempts (5 max) and idle until next server-side edit
  - Add integration tests for config-edit restart and boot-failure recovery

- 23d43b3: Improve the mobile Capacitor workflow:

  - Auto-declare default Capacitor plugins in the app package.json before iOS/Android launch
  - Expand mobile runtime peer dependencies and workspace-root preflight installs
  - Derive repo-scoped default bundle ids to avoid Apple portal collisions
  - Add `akan doctor --ios` to flag placeholder bundle identifiers
  - Add `--device` to `akan start ios` for non-interactive simulator/device selection
  - Prefer newer iOS runtimes and warn on SwiftUICore-incompatible simulators
  - Detect SwiftUICore dyld failures with actionable guidance
  - Select a routable LAN host for mobile live reload with override support
  - Raise Android minSdkVersion to 26 for bundled Capacitor plugins
  - Include `@capacitor-community/fcm` in push notification runtime packages
  - Resolve client port from `window.location` on the browser client

### Patch Changes

- d56a8f0: Ship Pretendard as the default font for newly created apps:

  - Bundle Pretendard woff2 files under the app template `public/fonts`
  - Declare `fonts` with `default: true` in the generated root `_layout.tsx`

- Updated dependencies [d56a8f0]
- Updated dependencies [23d43b3]
- Updated dependencies [18abf71]
- Updated dependencies [23d43b3]
  - akanjs@2.4.0

## 2.3.11

### Minor Changes

- 595390a: feat: UiOverride 시스템 및 \_overrides.tsx 지원 추가

  - `akanjs/ui/UiOverride` 추가: `Provider`, `createOverridable`, `useUiOverride`, `override` API로 UI 컴포넌트 커스터마이징 지원
  - 모든 akanjs UI 컴포넌트(Button, Modal, Select, Table 등)에 `useUiOverride()` 통합
  - 라우트 시스템에 `_overrides.tsx` 지원 추가 (routeConvention, routeTreeBuilder)
  - qualityScanner에 `_overrides.tsx` 파일 검증 로직 추가
  - 앱 예제: `apps/minimal`에 `_overrides.tsx`, `BrandModal`, `OverrideDemo` 추가
  - `apps/akan` 문서에 UI 커스터마이징 가이드 페이지 추가
  - devkit에 `no-throw-raw-error.grit` lint rule 추가
  - `PushNotificationServer.ts` 리팩토링
  - biome.json 업데이트 및 패키지 의존성 정리

### Patch Changes

- 5ce752a: enhance: add host option for staging server tests
- 5ce752a: add host option for staging server tests
- Updated dependencies [5ce752a]
- Updated dependencies [5ce752a]
- Updated dependencies [595390a]
  - akanjs@2.4.0

## 2.3.10

### Patch Changes

- b92003a: fix: cross-platform path handling using path.resolve/path.join/path.sep
- Updated dependencies [b92003a]
  - akanjs@2.3.10

## 2.3.9

### Patch Changes

- f518afd: Improve dictionary type inference and lint coverage for generated workspaces.
- 6bc2209: auto-select app when the workspace has only one app
- Updated dependencies [f518afd]
- Updated dependencies [f518afd]
  - akanjs@2.3.9

## 2.3.6

### Patch Changes

- 0a4815a: Improve `akan start` stability for incremental dev changes.
- 1919062: Pin DaisyUI to 5.5.23 so generated workspaces and published CLI artifacts avoid the 5.6.x theme resolution regression.
- Updated dependencies [0a4815a]
  - akanjs@2.3.6

## 2.3.5

### Patch Changes

- Updated dependencies
  - akanjs@2.3.5

## 2.3.2

### Patch Changes

- d6db24d: Fix dev runtime refresh for client components, dictionaries, and signal metadata while keeping regenerated server page bundles aligned with live app signal definitions.
- 1a48756: Add RSC partial navigation patch handling and supporting SSR build updates, plus benchmark harness improvements for validating production behavior.
- Updated dependencies [940d6db]
- Updated dependencies [d6db24d]
- Updated dependencies [dc60773]
- Updated dependencies [ffe68ec]
- Updated dependencies [1a48756]
- Updated dependencies [1a48756]
- Updated dependencies [1a48756]
- Updated dependencies [1a48756]
- Updated dependencies [1a48756]
- Updated dependencies [4fc2673]
  - akanjs@2.4.0

## 2.2.12

### Patch Changes

- Updated dependencies [666e46c]
- Updated dependencies [666e46c]
  - akanjs@2.2.12

## 2.2.11

### Patch Changes

- 8af7a9d: Add agent-oriented workspace context tooling, generated agent rule templates, and LLM documentation surfaces for Akan workspaces.
- 8190632: Add Akan server console support with CLI/build integration and documentation for console-oriented workflows.
- 4bce7f9: Add initial LLM discovery docs and stabilize Akan client/runtime behavior.

  - Add `/llms.txt` documentation discovery for Akan docs.
  - Add `wsConnect` support for automatic WebSocket connections.
  - Delay client bootstrap module execution until the SSR fizz stream is ready.
  - Improve route tree, HMR, fetch, store, and SSR/client runtime stability.

- Updated dependencies [8190632]
- Updated dependencies [4bce7f9]
  - akanjs@2.2.11

## 2.2.7

### Patch Changes

- Updated dependencies [bf51564]
- Updated dependencies [bf51564]
  - akanjs@2.2.7

## 2.2.5

### Patch Changes

- 5cdb05e: reverse dependency of file upload api
- Updated dependencies [d636456]
- Updated dependencies [a1ee4e8]
- Updated dependencies [5cdb05e]
- Updated dependencies [a7da50e]
  - akanjs@2.2.5

## 2.2.3

### Patch Changes

- 587cc68: fix dictionary loading
- 587cc68: fix fetchClient for setting origin with clone or fetchPolicy
- Updated dependencies [587cc68]
- Updated dependencies [587cc68]
  - akanjs@2.2.4

## 2.2.0

### Patch Changes

- Updated dependencies [cb5b07a]
- Updated dependencies [258284e]
  - akanjs@2.2.0
