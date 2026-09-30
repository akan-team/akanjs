# service.dictionary.ts

- Source: /conventions/service/dictionary
- Mirror: /llms/pages/conventions/service/dictionary.md
- Section: conventions
- Category: Service
- Priority: P1

## Headings

- service.dictionary.ts (#service-dictionary)
- Naming The Endpoints (#endpoint-labels)
- Naming Every Argument (#endpoint-args)
- Errors And Phrases (#errors-and-phrases)
- Reading A Key Back (#reading-keys)

## Content

service.dictionary.ts

`<service>.dictionary.ts` labels, in every language, what a service module shows: its endpoints, its errors and its other phrases. Open it when you add an endpoint, throw a new error, or show a new line of text.

A model dictionary starts by naming fields. A service module has none, so its dictionary starts one stage later, at the endpoints, and the first line says so: `serviceDictionary`, not `modelDictionary`.

Words used on this page

Term

- label: The name a person reads, one entry per language: `fn(["Disconnect App", "앱 연결 끊기"])`.

- .desc(): A longer sentence beside a label. An AI agent picks a tool by reading it.

- key: The dotted path code reads a text by, such as `oauth.consentTitle`.

- language tuple: One string per language, in the order `serviceDictionary(["en", "ko"])` lists them.

Three stages

Stage

What it holds

- .endpoint<XEndpoint>((fn) => ({})): One entry per signal endpoint: a label, a `.desc()`, and an `.arg()` for every argument. — Example: `l("oauth.signal.exchangeOAuthToken")`

- .error({}): Every key the service throws as `new Err("<service>.error.<key>")`. Korean ends in `다.` — Example: `throw new Err("localFile.error.privateFilesNotServed")`

- .translate({}): Every other phrase, neither an endpoint nor an error. It is read by the bare key under the module. — Example: `l("oauth.consentTitle")`

**Every stage is optional.** Write the ones the module has something for: `_security` writes only `.endpoint()`, and `_localFile` has no `.translate()`.

**Any order works; one order is the house style.** Each stage returns the same builder, but write endpoint → error → translate, the order a reader looks for them in.

**The array is the language list.** `serviceDictionary(["en", "ko"])` fixes the order every tuple in the file follows.

Naming The Endpoints

Pass the signal's endpoint class to `.endpoint()` as a type argument, and give each endpoint a label and a `.desc()`. This is the whole file of `_localFile`, a module with one endpoint:

**The keys follow the endpoint class.** The callback must return one entry per endpoint, so a renamed or added endpoint breaks the dictionary at compile time, not at the first render.

**Import the class with `import type`.** A dictionary is a shared contract file, and a value import would pull the signal's runtime graph in behind it.

**Two parts are not optional:** the `.desc()` beside the label, and the error key `localFile.service.ts` throws by name.

Who reads which text

People read the label; a model reads the description. Each piece shows up in these places:

Text

API explorer

OpenAPI

MCP

- Endpoint

  - label: The API explorer heading, the OpenAPI `summary` and the MCP tool `title`.

  - .desc(): The description an agent picks a tool by. The API explorer shows it under the label.

- Argument, in .arg()

  - label: Shown beside the identifier in the API explorer, and nowhere else.

  - .desc(): The argument's description in the MCP input schema and on OpenAPI path and query parameters.

Shown there

Not used

**Write a `.desc()` for every endpoint.** An agent picks a tool by its description; with a label alone it has the name and nothing else. MCP reads the English entry unless `option.setMcp({ language })` names another, so the English half must stand on its own.

Naming Every Argument

`.arg()` names each argument the endpoint declares, including `skip`, `limit` and `sort` when a custom endpoint takes them. Leave one out and the dictionary does not compile:

**Say where the value comes from.** The description does not say what a session ID is; it says where the caller gets one: the connected-apps list.

**That sentence is worth more than the type.** It is the argument's description in the MCP input schema. Without it an agent has only the identifier's spelling, and guesses.

**The label is for people.** "Session ID" appears beside `sessionId` in the API explorer.

Errors And Phrases

An error key is the other half of a throw. The service writes `new Err("oauth.error.notSignedIn")`, and `.error()` is the only place that key becomes a sentence a person can read.

`.translate()` holds every other phrase the module shows. Both stages take plain language tuples, with no `t()` and no `.desc()`:

**`Err` accepts only registered keys.** A typo, or a key missing from `.error()`, is a type error. A key with no text in the reader's language or the default one shows up as the raw key.

**A brace pair is a slot the caller fills.** `l("oauth.connectedAt", { at })` fills `Connected {at}`, and `new Err(key, { days })` fills an error the same way.

**Nothing checks that the value was passed.** A missing one leaves `{at}` in the text as written, so give the slot an obvious name.

Tone of voice

The ending follows who the sentence speaks to. Both conventions in the file above are deliberate:

How it is written

- .error(): Korean ends in `다.`: a statement of what went wrong, not an apology. — Example: `"계속하려면 로그인해야 한다."`

- .translate(): Plain `다.` only for a bare statement; a line addressed to the user ends in `습니다` (`consentScope`). — Example: `"…할 수 있는 모든 일을 할 수 있습니다."`

- label: English in Title Case, Korean as the plain domain term. — Example: `["Disconnect App", "앱 연결 끊기"]`

Reading A Key Back

Every key sits under the service's own name, and the stage decides what comes next. Endpoint labels get a `signal` segment so they stay clear of the phrases; phrases get none.

Where it comes from and how to read it

- <service>.signal.<endpoint>: The endpoint label from `.endpoint()`. Read it with `l()`. — Example: `l("oauth.signal.approveOAuthConsent")`

- <service>.signal.<endpoint>.desc: Its `.desc()`. Read it with `l()`, adding `.desc` to the label's key. — Example: `l("oauth.signal.approveOAuthConsent.desc")`

- <service>.signal.<endpoint>.arg.<arg>: An argument label from `.arg()`. Read it with `l()`. — Example: `l("oauth.signal.revokeOAuthConnection.arg.sessionId")`

- <service>.error.<key>: An error from `.error()`. `new Err()` throws it on the server; `msg.error()` shows it on the client. — Example: `msg.error("oauth.error.notSignedIn")`

- <service>.<key>: A phrase from `.translate()`. Read it with `l()`. — Example: `l("oauth.consentTitle")`

The OAuth consent page reads its phrases this way, on the server. Markup is trimmed here:

**`usePage()` works on the server too.** The consent page is a server component, so its labels add no client boundary.

**A thrown error needs no reading code.** When a store action fails with an `Err`, the store toasts its text in the reader's language. For a client-side check, call `msg.error("oauth.error.notSignedIn")` and return.

**One-off text belongs to the screen.** A phrase used once, on one screen, is `l.trans({ en, ko })` in that component. A key only one component reads is a key somebody keeps in sync for nothing.

**`l()` does not take an error key.** `l("oauth.error.notSignedIn")` is a type error. Error keys go through `Err` on the server and `msg.error()` on the client.

Common mistakes

Instead of

Write

- `import { OauthEndpoint } from "./oauth.signal"` — `import type`. A value import pulls the signal's runtime graph into the dictionary.

- An endpoint label with no `.desc()` — Write one. An agent picks a tool by its description.

- An argument description that repeats the name: "The session ID" — Say where the caller gets the value: "from the connected-apps list".

- A `.translate()` key only one component reads — `l.trans({ en, ko })` inside that component.

Read next

- model.dictionary.ts — The full stage chain a database module writes.

- service.signal.ts — The endpoints and arguments this file labels.

- service.service.ts — Where the `Err` keys are thrown.

- service.store.ts — Actions whose failures become error toasts.

## Code Examples

### libs/util/lib/_localFile/localFile.dictionary.ts

```ts
import { serviceDictionary } from "akanjs/dictionary";

import type { LocalFileEndpoint } from "./localFile.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<LocalFileEndpoint>((fn) => ({
    getBlob: fn(["Get Blob", "Blob 가져오기"]).desc([
      "Get blob data from local file",
      "로컬 파일에서 Blob 데이터 가져오기",
    ]),
  }))
  .error({
    privateFilesNotServed: [
      "Private files are not served through localFile",
      "비공개 파일은 localFile을 통해 제공되지 않습니다",
    ],
  });
```

### libs/shared/lib/_oauth/oauth.dictionary.ts

```ts
revokeOAuthConnection: fn(["Disconnect App", "앱 연결 끊기"])
      .desc([
        "Closes one application's grant; its tokens stop working at once",
        "애플리케이션 하나의 권한을 닫는다. 그 토큰은 즉시 동작을 멈춘다",
      ])
      .arg((t) => ({
        sessionId: t(["Session ID", "세션 ID"]).desc([
          "The grant to close, from the connected-apps list",
          "닫을 그랜트(연결된 앱 목록의 세션 ID)",
        ]),
      })),
```

### libs/shared/lib/_oauth/oauth.dictionary.ts

```ts
.error({
    requestNotFound: [
      "The authorization request is unknown, expired or already decided",
      "인가 요청이 없거나 만료되었거나 이미 처리되었다.",
    ],
    requestBoundToAnotherAccount: [
      "This authorization request was started by another account",
      "이 인가 요청은 다른 계정이 시작했다.",
    ],
    notSignedIn: ["Sign in to continue", "계속하려면 로그인해야 한다."],
    disabled: [
      "OAuth is disabled on this server",
      "이 서버에서 OAuth 가 꺼져 있다.",
    ],
  })
  .translate({
    consentTitle: ["Authorize access", "접근 허용"],
    consentScope: [
      "It will be able to do everything your account can do until you sign it out.",
      "로그아웃시키기 전까지 내 계정이 할 수 있는 모든 일을 할 수 있습니다.",
    ],
    disconnect: ["Disconnect", "연결 끊기"],
    connectedAt: ["Connected {at}", "{at} 연결"],
  });
```

### libs/shared/page/oauth/consent/_index.tsx

```tsx
import { fetch, usePage } from "@libs/shared/client";
import { page } from "akanjs/client";

export default page()
  .search("request", String, { desc: "The request of this screen." })
  .render(async ({ request: requestId }) => {
    const { l } = usePage();
    const request = requestId
      ? await fetch.viewOAuthAuthorizationRequest(requestId).catch(() => null)
      : null;
    return (
      <main>
        <h1>{l("oauth.consentTitle")}</h1>
        {request ? (
          <p>{l("oauth.consentScope")}</p>
        ) : (
          <p>{l("oauth.consentUnavailable")}</p>
        )}
      </main>
    );
  });
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

