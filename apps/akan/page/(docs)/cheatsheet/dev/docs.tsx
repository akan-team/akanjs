import { usePage } from "@apps/akan/client";
import { Code, Docs, PingTester } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "API Documentation", ko: "API 문서" })}>
        <Docs.Title>{l.trans({ en: "API Documentation", ko: "API 문서" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan can render signal documentation from the generated fetch object. It is not just a static list: developers can inspect arguments, guards, REST calls, and realtime endpoints.",
              ko: "Akan은 생성된 fetch 객체에서 signal 문서를 렌더링할 수 있습니다. 단순한 목록이 아니라 argument, guard, REST 호출, realtime endpoint를 확인할 수 있습니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Use `Signal.Doc.Zone` for one signal namespace.",
                ko: "하나의 signal namespace에는 `Signal.Doc.Zone`을 사용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use `Doc.Setting` to choose BaseURL, role, and JWT.",
                ko: "`Doc.Setting`에서 BaseURL, role, JWT를 조절합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "REST and WebSocket test surfaces are shown together.",
                ko: "REST와 WebSocket 테스트 화면을 함께 볼 수 있습니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="zone" title={l.trans({ en: "Render A Zone", ko: "Zone 렌더링" })}>
        <Docs.Title>{l.trans({ en: "Render A Zone", ko: "Zone 렌더링" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Place the documentation UI inside an admin or developer-only page. The `base` signal is a good first target because it has simple ping endpoints.",
              ko: "문서 UI는 admin 또는 developer 전용 page에 두세요. `base` signal은 간단한 ping endpoint가 있어서 첫 실습 대상으로 좋습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Developer API page", ko: "개발자 API page" })}
          code={`"use client";
import { fetch } from "@apps/myapp/client";
import { Signal } from "akanjs/ui";

export default function ApiDocsPage() {
  return <Signal.Doc.Zone fetch={fetch} refName="base" openAll />;
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="try-api" title={l.trans({ en: "Try An Endpoint", ko: "Endpoint 실습" })}>
        <Docs.Title>{l.trans({ en: "Try An Endpoint", ko: "Endpoint 실습" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Open the `base` document, find `ping`, and run it from the REST panel. It should return a simple string response.",
              ko: "`base` 문서를 열고 `ping`을 찾아 REST panel에서 실행해보세요. 단순한 문자열 응답이 돌아옵니다.",
            })}
          </div>
        </Docs.Description>
        <PingTester />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="auth" title={l.trans({ en: "Auth And Roles", ko: "Auth와 role" })}>
        <Docs.Title>{l.trans({ en: "Auth And Roles", ko: "Auth와 role" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "For guarded endpoints, open the auth modal and paste a JWT. The decoded account helps you confirm which roles are being used for the test.",
              ko: "Guard가 있는 endpoint는 auth modal을 열고 JWT를 붙여넣으세요. Decode된 account를 보면 어떤 role로 테스트하는지 확인할 수 있습니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "BaseURL tells you which server the document is calling.",
                ko: "BaseURL은 문서가 어떤 서버를 호출하는지 보여줍니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Role filters help you focus on public, user, or admin endpoints.",
                ko: "Role filter는 public, user, admin endpoint를 나눠 보는 데 도움됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "JWT is only for developer testing in this UI.",
                ko: "JWT는 이 UI에서 개발자 테스트용으로만 사용하세요.",
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
                en: "Expose API docs only to developers or admins.",
                ko: "API 문서는 developer 또는 admin에게만 노출하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Start with `base` or a small module before documenting a large domain.",
                ko: "큰 domain을 문서화하기 전에 `base`나 작은 module부터 시작하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use the docs UI for quick manual checks, not as a replacement for automated tests.",
                ko: "문서 UI는 빠른 수동 점검에 사용하고, 자동 테스트의 대체물로 보지는 마세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
