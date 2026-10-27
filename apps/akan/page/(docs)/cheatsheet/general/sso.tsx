import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page()
  .config({ transition: "fade" })
  .head(({ lang }) => {
    const title = lang === "ko" ? "일반: Single Sign-On | Akan.js" : "General: Single Sign-On | Akan.js";
    const description =
      lang === "ko"
        ? "프로바이더를 등록하고 콜백을 써서 프로바이더의 account id를 사용자에 연결합니다."
        : "Register providers, write a callback, and map the provider's account id to a user.";
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
      </>
    );
  })
  .render(() => {
    const { l } = usePage();

    const bulletList = "my-4 list-disc space-y-2 pl-5";
    const stepList = "my-4 list-decimal space-y-2 pl-5";
    const chip = "my-3 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

    const termRows = [
      {
        name: "provider",
        desc: l.trans({
          en: "The service that confirms who the user is: GitHub, Google, Facebook, Kakao, Naver or Apple.",
          ko: "사용자가 누구인지 확인해 주는 서비스입니다. GitHub, Google, Facebook, Kakao, Naver, Apple이 있습니다.",
        }),
      },
      {
        name: "callback",
        desc: l.trans({
          en: "The route the provider sends the user back to, carrying a one-time `code`.",
          ko: "provider가 사용자를 되돌려 보내는 route입니다. 일회용 `code`를 함께 가져옵니다.",
        }),
      },
      {
        name: "accountId",
        desc: l.trans({
          en: "The one value that identifies the user on every sign-in: an email or a GitHub username.",
          ko: "로그인할 때마다 사용자를 가려내는 값 하나입니다. email이나 GitHub username입니다.",
        }),
      },
      {
        name: "prepare user",
        desc: l.trans({
          en: "A user in `prepare` status, created for a newcomer. The signup page finishes it.",
          ko: "처음 온 사용자를 위해 만든 `prepare` 상태의 user입니다. 가입 화면이 이 user를 완성합니다.",
        }),
      },
    ];

    const todoSteps = [
      l.trans({
        en: (
          <>
            <strong>Add the keys.</strong> Put each provider's client ID and secret under <code>security.sso</code> in
            the server env file.
          </>
        ),
        ko: (
          <>
            <strong>키를 넣습니다.</strong> provider마다 받은 client ID와 secret을 서버 env 파일의{" "}
            <code>security.sso</code>에 적습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Register the redirect URI.</strong> Enter <code>{"<origin>/api/user/<provider>/callback"}</code> in
            each provider's developer console.
          </>
        ),
        ko: (
          <>
            <strong>redirect URI를 등록합니다.</strong> 각 provider의 개발자 콘솔에{" "}
            <code>{"<origin>/api/user/<provider>/callback"}</code>을 적습니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Place the buttons.</strong> Render <code>User.Util.SSOButtons</code> on the sign-in page with three
            destinations.
          </>
        ),
        ko: (
          <>
            <strong>버튼을 놓습니다.</strong> 로그인 화면에 <code>User.Util.SSOButtons</code>를 그리고 이동할 곳 세
            군데를 넘깁니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <strong>Build the landing pages.</strong> A signup page that reads <code>userId</code> and an error page
            that reads <code>error</code> from the query.
          </>
        ),
        ko: (
          <>
            <strong>도착 화면을 만듭니다.</strong> query에서 <code>userId</code>를 읽는 가입 화면과 <code>error</code>를
            읽는 오류 화면입니다.
          </>
        ),
      }),
    ];

    const flowSteps = [
      l.trans({
        en: (
          <>
            <code>st.do.ssoSigninUser</code> saves the three destinations in cookies, then opens{" "}
            <code>{"/api/user/<provider>"}</code>.
          </>
        ),
        ko: (
          <>
            <code>st.do.ssoSigninUser</code>가 이동할 곳 세 군데를 cookie에 저장하고{" "}
            <code>{"/api/user/<provider>"}</code>를 엽니다.
          </>
        ),
      }),
      l.trans({
        en: "The start route sends the browser to the provider's consent screen.",
        ko: "시작 route가 브라우저를 provider의 동의 화면으로 보냅니다.",
      }),
      l.trans({
        en: (
          <>
            The provider returns the browser to <code>{"/api/user/<provider>/callback"}</code> with a <code>code</code>.
          </>
        ),
        ko: (
          <>
            provider가 <code>code</code>를 붙여 브라우저를 <code>{"/api/user/<provider>/callback"}</code>으로
            돌려보냅니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            The callback trades the <code>code</code> for a profile and picks the <code>accountId</code>.
          </>
        ),
        ko: (
          <>
            callback이 <code>code</code>를 profile로 바꾸고 <code>accountId</code>를 골라냅니다.
          </>
        ),
      }),
      l.trans({
        en: (
          <>
            <code>userService.handleSsoCallback</code> signs the user in, continues signup, or sends them to the error
            page.
          </>
        ),
        ko: (
          <>
            <code>userService.handleSsoCallback</code>이 로그인시키거나, 가입을 이어가게 하거나, 오류 화면으로 보냅니다.
          </>
        ),
      }),
    ];

    const credentialRows = [
      {
        key: "clientID",
        type: "string",
        tags: [l.trans({ en: "required", ko: "필수" })],
        desc: l.trans({
          en: "The app's client ID from the provider console. Kakao calls it the REST API key.",
          ko: "provider 콘솔에서 받은 앱의 client ID입니다. Kakao에서는 REST API 키입니다.",
        }),
      },
      {
        key: "clientSecret",
        type: "string",
        desc: l.trans({
          en: "Sent with the code-for-token exchange, only when set.",
          ko: "code를 토큰으로 바꿀 때 함께 보냅니다. 값이 있을 때만 보냅니다.",
        }),
      },
      {
        key: "teamID",
        type: "string",
        tags: ["apple"],
        desc: l.trans({
          en: "Your Apple developer team ID, the issuer of Apple's client secret.",
          ko: "Apple 개발자 팀 ID입니다. Apple용 client secret의 발급자로 들어갑니다.",
        }),
      },
      {
        key: "keyID",
        type: "string",
        tags: ["apple"],
        desc: l.trans({
          en: "The ID of the Sign in with Apple key, sent as the secret's `kid`.",
          ko: "Sign in with Apple 키의 ID입니다. secret의 `kid`로 들어갑니다.",
        }),
      },
      {
        key: "keyFilePath",
        type: "string",
        tags: ["apple"],
        desc: l.trans({
          en: "Path to that key's private key file. Akan signs the client secret with it.",
          ko: "그 키의 개인 키 파일 경로입니다. Akan이 이 파일로 client secret을 서명합니다.",
        }),
      },
    ];

    const scopeColumns = [
      { key: "provider", label: l.trans({ en: "Key in security.sso", ko: "security.sso 키" }), code: true },
      { key: "scope", label: l.trans({ en: "Scope Akan requests", ko: "Akan이 요청하는 scope" }), code: true },
    ];
    const scopeRows = [
      { provider: "github", scope: "user" },
      { provider: "google", scope: "email profile" },
      { provider: "facebook", scope: "email" },
      { provider: "kakao", scope: "account_email,profile_nickname" },
      { provider: "naver", scope: l.trans({ en: "(none)", ko: "(없음)" }) },
    ];

    const routeColumns = [
      { key: "endpoint", label: "endpoint", code: true },
      { key: "path", label: l.trans({ en: "Path", ko: "경로" }), code: true },
      { key: "does", label: l.trans({ en: "What it does", ko: "하는 일" }) },
    ];
    const routeRows = [
      {
        endpoint: "google",
        path: "/api/user/google",
        does: l.trans({
          en: "Redirects the browser to Google's consent screen.",
          ko: "브라우저를 Google 동의 화면으로 보냅니다.",
        }),
      },
      {
        endpoint: "googleCallback",
        path: "/api/user/google/callback",
        does: l.trans({
          en: "Trades Google's `code` for a profile, then signs in or continues signup.",
          ko: "Google의 `code`를 profile로 바꾼 뒤 로그인하거나 가입을 이어갑니다.",
        }),
      },
    ];

    const helperRows = [
      {
        name: ["SSO.Google", "SSO.Github", "SSO.Kakao", "…"],
        desc: l.trans({
          en: "Guards that refuse the call with `ssoNotConfigured` when that provider has no keys.",
          ko: "그 provider의 키가 없으면 `ssoNotConfigured`로 호출을 거절하는 guard입니다.",
        }),
      },
      {
        name: "SsoFlow.start",
        desc: l.trans({
          en: "The 302 to the consent screen: `redirect_uri` on the request's own origin, `state` in an HttpOnly cookie.",
          ko: "동의 화면행 302 응답입니다. `redirect_uri`는 요청이 들어온 origin으로, `state`는 HttpOnly cookie로 둡니다.",
        }),
      },
      {
        name: "SsoFlow.callback",
        desc: l.trans({
          en: "Checks `state` against the cookie, trades the `code` for the provider's identity, then calls `handleSsoCallback`.",
          ko: "`state`를 cookie와 맞춰 보고, `code`를 provider의 신원으로 바꾼 뒤 `handleSsoCallback`을 부릅니다.",
        }),
      },
      {
        name: "handleSsoCallback",
        desc: l.trans({
          en: "The user service's decision: sign in, continue signup or error. Returns `{ cookie, redirect }`.",
          ko: "user service가 로그인, 가입 계속, 오류 중 하나를 정합니다. `{ cookie, redirect }`를 돌려줍니다.",
        }),
      },
      {
        name: "makeSsoRedirectResponse",
        desc: l.trans({
          en: "The final 302 to `redirect`, setting the session cookies when there are any.",
          ko: "`redirect`로 가는 마지막 302 응답입니다. 세션 cookie가 있으면 함께 심습니다.",
        }),
      },
    ];

    const accountColumns = [
      { key: "provider", label: "provider", code: true },
      { key: "accountId", label: "accountId", code: true },
      { key: "nickname", label: l.trans({ en: "Nickname seed", ko: "닉네임 재료" }), code: true },
    ];
    const accountRows = [
      { provider: "github", accountId: "username", nickname: "displayName" },
      { provider: "google", accountId: "emails[0].value", nickname: "displayName" },
      { provider: "facebook", accountId: "emails[0].value", nickname: "givenName familyName" },
      { provider: "kakao", accountId: "email", nickname: "name" },
      { provider: "naver", accountId: "email", nickname: "name" },
    ];

    const buttonProps = [
      {
        key: "signinRedirect",
        type: "string",
        tags: [l.trans({ en: "required", ko: "필수" })],
        desc: l.trans({
          en: "Where an existing user lands, signed in.",
          ko: "기존 사용자가 로그인된 채로 도착하는 곳입니다.",
        }),
      },
      {
        key: "signupRedirect",
        type: "string",
        tags: [l.trans({ en: "required", ko: "필수" })],
        desc: l.trans({
          en: "Where a newcomer lands to finish signup. Gets `?userId=<id>` appended.",
          ko: "처음 온 사용자가 가입을 마치러 가는 곳입니다. 뒤에 `?userId=<id>`가 붙습니다.",
        }),
      },
      {
        key: "errorRedirect",
        type: "string",
        default: '"/404"',
        desc: l.trans({
          en: "Where a failed sign-in lands. Gets `?error=<error key>` appended.",
          ko: "로그인에 실패하면 도착하는 곳입니다. 뒤에 `?error=<오류 키>`가 붙습니다.",
        }),
      },
      {
        key: "mainSsos",
        type: 'SsoType["value"][]',
        default: "[]",
        desc: l.trans({
          en: "Providers shown as full-width buttons with a label.",
          ko: "문구가 들어간 넓은 버튼으로 보여줄 provider입니다.",
        }),
      },
      {
        key: "subSsos",
        type: 'SsoType["value"][]',
        default: "[]",
        desc: l.trans({
          en: "Providers shown as a row of round icon buttons below.",
          ko: "아래에 동그란 아이콘 버튼 한 줄로 보여줄 provider입니다.",
        }),
      },
      {
        key: "replace",
        type: "boolean",
        default: "false",
        desc: l.trans({
          en: "Replace the current history entry instead of pushing a new one.",
          ko: "새 기록을 쌓지 않고 현재 방문 기록을 바꿔치기합니다.",
        }),
      },
    ];

    const outcomeColumns = [
      { key: "outcome", label: l.trans({ en: "Outcome", ko: "결과" }) },
      { key: "when", label: l.trans({ en: "When", ko: "조건" }) },
      { key: "goesTo", label: l.trans({ en: "Goes to", ko: "이동" }), code: true },
    ];
    const outcomeRows = [
      {
        outcome: l.trans({ en: "Signed in", ko: "로그인" }),
        when: l.trans({
          en: "The accountId belongs to an active, restricted or dormant user.",
          ko: "accountId가 active, restricted, dormant 사용자 중 하나의 것입니다.",
        }),
        goesTo: "signinRedirect",
      },
      {
        outcome: l.trans({ en: "Continue signup", ko: "가입 계속" }),
        when: l.trans({
          en: "No such user yet, so a prepare user is created with a unique nickname.",
          ko: "아직 없는 사용자라서, 겹치지 않는 닉네임을 붙인 prepare user를 만듭니다.",
        }),
        goesTo: "signupRedirect?userId=<id>",
      },
      {
        outcome: l.trans({ en: "Error", ko: "오류" }),
        when: l.trans({
          en: "Signing in or preparing the user fails, for example with `noVerifiesInUser`.",
          ko: "로그인이나 가입 준비가 실패합니다. `noVerifiesInUser`가 한 예입니다.",
        }),
        goesTo: "errorRedirect?error=<error key>",
      },
    ];

    return (
      <Scroll>
        <Scroll.Slide id="overview" title={l.trans({ en: "Single Sign-On", ko: "소셜 로그인" })}>
          <Docs.Title>{l.trans({ en: "Single Sign-On", ko: "소셜 로그인" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    SSO lets users sign in with GitHub, Google, Facebook, Kakao or Naver instead of a password. With{" "}
                    <code>libs/shared</code> mounted, the routes and the sign-in logic already exist: you add keys, a
                    button and the pages the user lands on.
                  </span>
                ),
                ko: (
                  <span>
                    SSO는 비밀번호 대신 GitHub, Google, Facebook, Kakao, Naver 계정으로 로그인하게 해 줍니다.{" "}
                    <code>libs/shared</code>를 쓰는 앱이라면 route와 로그인 로직은 이미 있습니다. 키와 버튼, 그리고
                    사용자가 도착할 화면만 준비하면 됩니다.
                  </span>
                ),
              })}
            </div>
            <Docs.SubSubTitle>
              {l.trans({ en: "Words used on this page", ko: "이 페이지에서 쓰는 말" })}
            </Docs.SubSubTitle>
            <Docs.IntroTable type={l.trans({ en: "Term", ko: "용어" })} items={termRows} />
            <Docs.SubSubTitle>{l.trans({ en: "What you do", ko: "할 일" })}</Docs.SubSubTitle>
            <ol className={stepList}>
              {todoSteps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
            <Docs.SubSubTitle>
              {l.trans({ en: "What happens when the user clicks", ko: "사용자가 버튼을 누르면" })}
            </Docs.SubSubTitle>
            <ol className={stepList}>
              {flowSteps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="provider" title={l.trans({ en: "Register Providers", ko: "provider 등록" })}>
          <Docs.Title>{l.trans({ en: "Register Providers", ko: "provider 등록" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Each provider gives you a client ID, and usually a secret, in its developer console. Put them under{" "}
                    <code>security.sso</code> in the server env file of each environment:
                  </span>
                ),
                ko: (
                  <span>
                    provider마다 개발자 콘솔에서 client ID와, 대개는 secret도 발급해 줍니다. 환경마다 있는 서버 env
                    파일의 <code>security.sso</code>에 적습니다:
                  </span>
                ),
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/env/env.server.local.ts"
            code={`import type { ModulesOptions } from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: ModulesOptions = {
  ...libEnv,
  security: {
    verifies: [["password"]],
    sso: {
      github: { clientID: "<github-client-id>", clientSecret: "<github-client-secret>" },
      google: { clientID: "<google-client-id>", clientSecret: "<google-client-secret>" },
      kakao: { clientID: "<kakao-rest-api-key>" },
    },
  },
};`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Only listed providers turn on.</strong> A provider missing here makes its{" "}
                      <code>{"SSO.<Provider>"}</code> guard refuse both routes with <code>ssoNotConfigured</code>.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>적은 provider만 켜집니다.</strong> 여기에 없는 provider는 <code>{"SSO.<Provider>"}</code>{" "}
                      guard가 두 route를 모두 <code>ssoNotConfigured</code>로 거절합니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Keys stay out of git.</strong> <code>env.server.local.ts</code>,{" "}
                      <code>env.server.main.ts</code> and the other environment files are gitignored.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>키는 git에 올라가지 않습니다.</strong> <code>env.server.local.ts</code>,{" "}
                      <code>env.server.main.ts</code> 같은 환경별 파일은 gitignore 대상입니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>
                        Setting <code>security</code> replaces the whole object.
                      </strong>{" "}
                      Keep <code>verifies</code>, and <code>jwtSecret</code> if you use one, beside <code>sso</code>.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>
                        <code>security</code>를 적으면 객체 전체가 바뀝니다.
                      </strong>{" "}
                      <code>verifies</code>와, 쓴다면 <code>jwtSecret</code>도 <code>sso</code> 옆에 함께 적습니다.
                    </>
                  ),
                })}
              </li>
            </ul>
            <Docs.SubSubTitle>{l.trans({ en: "Credential fields", ko: "키 항목" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={credentialRows} />
            <Docs.SubSubTitle>
              {l.trans({ en: "Redirect URI for the console", ko: "콘솔에 등록할 redirect URI" })}
            </Docs.SubSubTitle>
            <div>
              {l.trans({
                en: "A provider only sends users back to a URI you registered. Akan builds it from the origin the sign-in request arrived on:",
                ko: "provider는 등록해 둔 URI로만 사용자를 돌려보냅니다. Akan은 로그인 요청이 들어온 origin으로 이 URI를 만듭니다:",
              })}
            </div>
            <code className={chip}>{"https://<your-domain>/api/user/<provider>/callback"}</code>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Register every origin.</strong> Local, staging and production each need their own entry.
                      Outside local the host must be the app's own: a <code>routes</code> domain,{" "}
                      <code>AKAN_SUB_ROUTE_HOSTS</code>, <code>{"<app>-<environment>.<serveDomain>"}</code>,{" "}
                      <code>HOST_NAME</code> or <code>AKAN_ALLOWED_HOSTS</code>. A forwarded host counts only from a
                      trusted hop: the gateway, or a proxy <code>AKAN_TRUSTED_PROXIES</code> admits.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>origin마다 등록합니다.</strong> 로컬, 스테이징, 운영에 각각 항목이 필요합니다. 로컬
                      밖에서는 호스트가 앱의 것이어야 합니다. <code>routes</code>의 domain,{" "}
                      <code>AKAN_SUB_ROUTE_HOSTS</code>, <code>{"<app>-<environment>.<serveDomain>"}</code>,{" "}
                      <code>HOST_NAME</code>, <code>AKAN_ALLOWED_HOSTS</code> 중 하나입니다. 전달된 호스트는 믿을 수
                      있는 hop, 곧 gateway나 <code>AKAN_TRUSTED_PROXIES</code>가 허용한 proxy에서 왔을 때만 씁니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Allow the scopes below.</strong> Consent items the console has not enabled come back
                      empty, such as Kakao's email.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>아래 scope를 허용해 둡니다.</strong> 콘솔에서 켜지 않은 동의 항목은 비어서 돌아옵니다.
                      Kakao의 email이 대표적입니다.
                    </>
                  ),
                })}
              </li>
            </ul>
            <Docs.Table columns={scopeColumns} rows={scopeRows} />
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="callback" title={l.trans({ en: "Write A Callback", ko: "callback 작성" })}>
          <Docs.Title>{l.trans({ en: "Write A Callback", ko: "callback 작성" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    You rarely write this yourself: <code>libs/shared/lib/user/user.signal.ts</code> already pairs a
                    start route with a callback for each provider. Read it when you add a provider or change what
                    happens after sign-in.
                  </span>
                ),
                ko: (
                  <span>
                    직접 작성할 일은 드뭅니다. <code>libs/shared/lib/user/user.signal.ts</code>에 provider마다 시작
                    route와 callback이 한 쌍씩 이미 있습니다. provider를 추가하거나 로그인 뒤의 동작을 바꿀 때
                    참고합니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Table columns={routeColumns} rows={routeRows} stacked />
            <div>
              {l.trans({
                en: "The Google pair, as shipped. Every other provider has the same shape:",
                ko: "실제로 들어 있는 Google 쌍입니다. 다른 provider도 모양이 같습니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="libs/shared/lib/user/user.signal.ts"
            code={`google: query(Any, { guards: [SSO.Google] })
  .with(Req)
  .exec(async function (req) {
    return await SsoFlow.start("google", req as Bun.BunRequest, this.userService);
  }),
googleCallback: query(Any, { guards: [SSO.Google], path: "google/callback" })
  .with(Req)
  .exec(async function (req) {
    return await SsoFlow.callback("google", req as Bun.BunRequest & { account?: SerAccount }, this.userService);
  }),`}
          />
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    The pieces it uses. All but <code>handleSsoCallback</code>, a user service method, come from{" "}
                    <code>@libs/shared/srvkit</code>:
                  </span>
                ),
                ko: (
                  <span>
                    여기 쓰인 조각들입니다. user service의 method인 <code>handleSsoCallback</code>을 빼면 모두{" "}
                    <code>@libs/shared/srvkit</code>에서 가져옵니다:
                  </span>
                ),
              })}
            </div>
            <Docs.IntroTable type={l.trans({ en: "Helper", ko: "helper" })} items={helperRows} />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>The callback stays small.</strong> It only turns the profile into an{" "}
                      <code>accountId</code> and a nickname; every decision lives in <code>handleSsoCallback</code>.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>callback은 작게 둡니다.</strong> profile을 <code>accountId</code>와 닉네임으로 바꾸기만
                      하고, 판단은 모두 <code>handleSsoCallback</code>이 합니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Apple is not wired yet.</strong> <code>SSO.Apple</code> and the Apple keys exist, but the
                      shipped <code>apple</code> and <code>appleCallback</code> do nothing. Build yours on{" "}
                      <code>verifyAppleUser</code>.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>Apple은 아직 연결되어 있지 않습니다.</strong> <code>SSO.Apple</code>과 Apple 키 항목은
                      있지만, 들어 있는 <code>apple</code>과 <code>appleCallback</code>은 아무 일도 하지 않습니다.{" "}
                      <code>verifyAppleUser</code>로 직접 만듭니다.
                    </>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="account-id" title={l.trans({ en: "Account Id", ko: "accountId 맞추기" })}>
          <Docs.Title>{l.trans({ en: "Account Id", ko: "accountId 맞추기" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: (
                  <span>
                    Each provider names the user differently. The callback turns every profile into one{" "}
                    <code>accountId</code> before it calls the service, and that value identifies the user from then on.
                  </span>
                ),
                ko: (
                  <span>
                    provider마다 사용자를 부르는 이름이 다릅니다. callback은 service를 부르기 전에 profile을{" "}
                    <code>accountId</code> 하나로 맞추고, 그 뒤로는 이 값이 사용자를 가려냅니다.
                  </span>
                ),
              })}
            </div>
            <Docs.Table columns={accountColumns} rows={accountRows} />
            <div>
              {l.trans({
                en: "Writing your own callbacks? Keep the difference in one lookup:",
                ko: "callback을 직접 쓴다면, 차이를 한곳에 모아 둡니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/srvkit/accountIdOf.ts"
            code={`import type { FacebookResponse, GithubResponse, GoogleResponse, KakaoResponse, NaverResponse } from "@libs/shared/srvkit";

export const accountIdOf = {
  github: (profile: GithubResponse) => profile.username,
  google: (profile: GoogleResponse) => profile.emails[0].value,
  facebook: (profile: FacebookResponse) => profile.emails[0].value,
  kakao: (profile: KakaoResponse) => profile.email,
  naver: (profile: NaverResponse) => profile.email,
} as const;`}
          />
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>One provider per account.</strong> An existing <code>accountId</code> arriving from a
                      provider it never signed in with goes to the error page with <code>noVerifiesInUser</code>.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>계정 하나에 provider 하나입니다.</strong> 이미 있는 <code>accountId</code>가 한 번도 쓰지
                      않은 provider로 들어오면 <code>noVerifiesInUser</code>와 함께 오류 화면으로 갑니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>GitHub and Google make two users.</strong> A username and an email never match, even for
                      the same person.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>GitHub와 Google은 서로 다른 사용자가 됩니다.</strong> 같은 사람이라도 username과 email은
                      일치하지 않기 때문입니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>The nickname is a first draft.</strong> A newcomer gets the profile name, or the{" "}
                      <code>accountId</code> before <code>@</code> when it is empty, cut to 12 characters and made
                      unique.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>닉네임은 초안입니다.</strong> 처음 온 사용자는 profile 이름을, 비어 있으면{" "}
                      <code>accountId</code>의 <code>@</code> 앞부분을 받습니다. 12자로 자르고 겹치지 않게 만듭니다.
                    </>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="redirect" title={l.trans({ en: "After The Callback", ko: "callback 이후 이동" })}>
          <Docs.Title>{l.trans({ en: "After The Callback", ko: "callback 이후 이동" })}</Docs.Title>
          <Docs.Description>
            <div>
              {l.trans({
                en: "The callback always ends on one of three pages, and you name all three on the sign-in button:",
                ko: "callback은 언제나 세 화면 중 하나에서 끝나고, 세 곳 모두 로그인 버튼에 미리 적어 둡니다:",
              })}
            </div>
          </Docs.Description>
          <Code.Snippet
            className="w-full"
            language="tsx"
            title="apps/koyo/page/signin.tsx"
            code={`import { User } from "@libs/shared/client";
import { page } from "akanjs/client";

export default page().render(() => (
  <User.Util.SSOButtons
    mainSsos={["kakao", "naver"]}
    subSsos={["google", "github"]}
    signinRedirect="/"
    signupRedirect="/signup"
    errorRedirect="/signin"
  />
));`}
          />
          <Docs.Description>
            <Docs.Table columns={outcomeColumns} rows={outcomeRows} />
            <Docs.SubSubTitle>{l.trans({ en: "SSOButtons props", ko: "SSOButtons props" })}</Docs.SubSubTitle>
            <Docs.OptionTable items={buttonProps} />
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Your own button</strong> calls{" "}
                      <code>{"st.do.ssoSigninUser(ssoType, { signinRedirect, signupRedirect, errorRedirect })"}</code>,
                      the same action <code>SSOButtons</code> uses.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>버튼을 직접 만들 때는</strong>{" "}
                      <code>{"st.do.ssoSigninUser(ssoType, { signinRedirect, signupRedirect, errorRedirect })"}</code>를
                      부릅니다. <code>SSOButtons</code>가 쓰는 것과 같은 action입니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Write paths as the app sees them.</strong> The action adds the basePath prefix when the
                      app has one.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>경로는 앱 안에서 보이는 그대로 적습니다.</strong> 앱에 basePath가 있으면 action이 앞에
                      붙여 줍니다.
                    </>
                  ),
                })}
              </li>
            </ul>
            <Docs.Alert type="warning">
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Start SSO through <code>st.do.ssoSigninUser</code>.
                    </strong>{" "}
                    A bare link to <code>/api/user/google</code> signs in too, but saves no destination, so every
                    outcome lands on <code>/</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      SSO는 <code>st.do.ssoSigninUser</code>로 시작합니다.
                    </strong>{" "}
                    <code>/api/user/google</code>로 바로 가는 링크도 로그인은 되지만 이동할 곳을 저장하지 않아서, 결과가
                    무엇이든 <code>/</code>로 갑니다.
                  </span>
                ),
              })}
            </Docs.Alert>
          </Docs.Description>
        </Scroll.Slide>
        <Divider />

        <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
          <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
          <Docs.Description>
            <ul className={bulletList}>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Provider differences go in the callback.</strong> Sign-in rules go in the service.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>provider별 차이는 callback에 둡니다.</strong> 로그인 규칙은 service에 둡니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>One service method for every provider.</strong> Once the <code>accountId</code> is
                      normalized, each callback calls the same <code>handleSsoCallback</code>.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>service method는 모든 provider가 하나를 씁니다.</strong> <code>accountId</code>를 맞춘
                      뒤에는 어느 callback이든 같은 <code>handleSsoCallback</code>을 부릅니다.
                    </>
                  ),
                })}
              </li>
              <li>
                {l.trans({
                  en: (
                    <>
                      <strong>Build the three pages first.</strong> Have the signed-in, signup and error pages ready
                      before you turn SSO on.
                    </>
                  ),
                  ko: (
                    <>
                      <strong>세 화면을 먼저 만듭니다.</strong> SSO를 켜기 전에 로그인 후 화면, 가입 화면, 오류 화면을
                      준비해 둡니다.
                    </>
                  ),
                })}
              </li>
            </ul>
          </Docs.Description>
        </Scroll.Slide>
        <DocsToc />
      </Scroll>
    );
  });
