import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Single Sign-On", ko: "소셜 로그인" })}>
        <Docs.Title>{l.trans({ en: "Single Sign-On", ko: "소셜 로그인" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "SSO lets users sign in with services like GitHub, Google, Kakao, or Naver. In Akan, you usually only write the callback once and let the service decide whether to sign in or continue signup.",
              ko: "SSO는 GitHub, Google, Kakao, Naver 같은 서비스로 로그인하게 해줍니다. Akan에서는 보통 callback을 작게 작성하고, 로그인할지 가입을 이어갈지는 service에 맡깁니다.",
            })}
          </div>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              {l.trans({ en: "User clicks a social login button.", ko: "사용자가 소셜 로그인 버튼을 누릅니다." })}
            </li>
            <li>{l.trans({ en: "The provider confirms who the user is.", ko: "provider가 사용자를 확인합니다." })}</li>
            <li>{l.trans({ en: "Akan callback receives the profile.", ko: "Akan callback이 profile을 받습니다." })}</li>
            <li>
              {l.trans({
                en: "The service signs in or redirects to signup.",
                ko: "service가 로그인하거나 가입 화면으로 보냅니다.",
              })}
            </li>
          </ol>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="provider" title={l.trans({ en: "Register Providers", ko: "Provider 등록" })}>
        <Docs.Title>{l.trans({ en: "Register Providers", ko: "Provider 등록" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "First, register the providers your app supports. Each provider needs credentials from that service's developer console.",
              ko: "먼저 앱이 지원할 provider를 등록합니다. 각 provider는 해당 서비스의 개발자 콘솔에서 받은 credential이 필요합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Example options", ko: "설정 예시" })}
          code={`security: {
  sso: {
    github: { clientID: "...", clientSecret: "..." },
    google: { clientID: "...", clientSecret: "..." },
  },
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="callback" title={l.trans({ en: "Write A Callback", ko: "Callback 작성" })}>
        <Docs.Title>{l.trans({ en: "Write A Callback", ko: "Callback 작성" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The callback should stay small. Take the provider profile, find the account id, and pass it to your user service.",
              ko: "callback은 작게 유지하세요. provider profile에서 account id만 뽑고 user service로 넘기면 됩니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "`SSO.Google` is a guard. It checks that Google SSO is configured before the login start route or callback runs. The start route redirects to Google, and the callback exchanges Google's `code` for a profile.",
              ko: "`SSO.Google`은 guard입니다. 로그인 시작 route나 callback이 실행되기 전에 Google SSO 설정이 있는지 확인합니다. 시작 route는 Google로 redirect하고, callback은 Google의 `code`를 profile로 바꿉니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Small callback", ko: "작은 callback" })}
          code={`google: query(Any, { guards: [SSO.Google] })
  .with(Req)
  .exec((req) => redirectToGoogle(req));

googleCallback: query(Any, { guards: [SSO.Google], path: "google/callback" })
  .with(Req)
  .exec(async function (req) {
    const profile = await getGoogleProfile(req);
    const accountId = profile.emails[0].value;
    return await this.userService.signinWithSso(accountId, "google");
  });`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="account-id" title={l.trans({ en: "Account Id", ko: "Account Id" })}>
        <Docs.Title>{l.trans({ en: "Account Id", ko: "Account Id" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Different providers call the user's identity by different names. Normalize it into one `accountId` before calling your service.",
              ko: "provider마다 사용자 식별값 이름이 다릅니다. service를 호출하기 전에 하나의 `accountId`로 맞춰주세요.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>{l.trans({ en: "GitHub often uses `username`.", ko: "GitHub는 보통 `username`을 사용합니다." })}</li>
            <li>
              {l.trans({
                en: "Google often uses the first email address.",
                ko: "Google은 보통 첫 번째 email 주소를 사용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Kakao and Naver commonly use `email`.",
                ko: "Kakao와 Naver는 주로 `email`을 사용합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Normalize provider profile", ko: "Provider profile 맞추기" })}
          code={`const accountId =
  provider === "github" ? profile.username : profile.email;`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="redirect" title={l.trans({ en: "Redirects", ko: "Redirect" })}>
        <Docs.Title>{l.trans({ en: "Redirects", ko: "Redirect" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "After the callback, the service usually chooses one of three places to go.",
              ko: "callback 이후 service는 보통 세 곳 중 하나로 이동시킵니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Existing user: go to the signed-in page.",
                ko: "기존 사용자: 로그인된 화면으로 이동합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "New user: go to the signup continuation page.",
                ko: "신규 사용자: 가입 이어가기 화면으로 이동합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Error: go to an error page with a clear message.",
                ko: "오류: 이해하기 쉬운 메시지와 함께 오류 화면으로 이동합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Keep provider-specific code inside the callback. Keep sign-in rules inside the service.",
                ko: "provider별 차이는 callback 안에 두고, 로그인 규칙은 service 안에 두세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use the same service method after every provider normalizes `accountId`.",
                ko: "모든 provider가 `accountId`를 맞춘 뒤에는 같은 service method를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Always prepare success, signup, and error redirects before starting SSO.",
                ko: "SSO를 시작하기 전에 성공, 가입, 오류 redirect를 준비해두세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
