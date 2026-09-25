import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Authorization", ko: "인증" })}>
        <Docs.Title>{l.trans({ en: "Authorization", ko: "인증" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Authorization in Akan answers two simple questions: who is calling this API, and is that person allowed to use it? Think of it as a small gate in front of each signal.",
              ko: "Akan의 인증은 두 가지 질문에 답합니다. 누가 이 API를 호출했는지, 그리고 그 사람이 이 기능을 써도 되는지입니다. 각 signal 앞에 작은 문을 세운다고 생각하면 쉽습니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Middleware reads login information from the request.",
                ko: "Middleware는 요청에서 로그인 정보를 읽습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Guard blocks users who do not have permission.",
                ko: "Guard는 권한이 없는 사용자를 막습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`.with()` gives the handler trusted server-side values such as the current user.",
                ko: "`.with()`는 현재 사용자처럼 서버가 확인한 값을 handler에 넣어줍니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="guard" title={l.trans({ en: "Use Guards", ko: "Guard 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Use Guards", ko: "Guard 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use a guard when the whole API should be unavailable to some users. For example, a profile update API should only run for signed-in users.",
              ko: "API 자체를 어떤 사용자에게 막아야 한다면 guard를 사용합니다. 예를 들어 프로필 수정 API는 로그인한 사용자만 실행할 수 있어야 합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "User-only mutation", ko: "사용자 전용 mutation" })}
          code={`setNickname: mutation(User, { guards: [User] })
  .body("nickname", String)
  .exec(async function (nickname) {
    return await this.userService.setNickname(nickname);
  });`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="with" title={l.trans({ en: "Use .with()", ko: ".with() 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Use .with()", ko: ".with() 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `.with()` when the API needs a value that the client should not type by hand. Current user, current admin, request, and account are good examples.",
              ko: "클라이언트가 직접 보내면 안 되는 값이 필요할 때 `.with()`를 사용합니다. 현재 사용자, 현재 관리자, 요청 객체, account가 대표적인 예입니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Current user from the server", ko: "서버에서 현재 사용자 받기" })}
          code={`getSelf: query(User, { nullable: true })
  .with(Self, { nullable: true })
  .exec(async function (self) {
    if (!self) return null;
    return await this.userService.getUser(self.id);
  });`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="choose" title={l.trans({ en: "Guard Or .with()", ko: "Guard와 .with() 구분" })}>
        <Docs.Title>{l.trans({ en: "Guard Or .with()", ko: "Guard와 .with() 구분" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Use `guards: [User]` when unauthenticated users must not enter the API.",
                ko: "로그인하지 않은 사용자가 API에 들어오면 안 된다면 `guards: [User]`를 사용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use `.with(Self)` when the API needs to know which user is calling.",
                ko: "API가 어떤 사용자가 호출했는지 알아야 한다면 `.with(Self)`를 사용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Most user-only APIs use both: guard first, then `.with(Self)` inside the handler.",
                ko: "대부분의 사용자 전용 API는 둘 다 사용합니다. 먼저 guard로 막고, handler 안에서는 `.with(Self)`로 현재 사용자를 받습니다.",
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
                en: "Do not receive `userId` from the client when you mean the current user. Use `.with(Self)` instead.",
                ko: "현재 사용자를 뜻한다면 client에서 `userId`를 받지 말고 `.with(Self)`를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use `Admin` guard for admin screens and `User` guard for user screens.",
                ko: "관리자 화면은 `Admin` guard, 사용자 화면은 `User` guard로 나누면 이해하기 쉽습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Keep permission checks close to the signal so readers can see who may call the API.",
                ko: "누가 API를 호출할 수 있는지 바로 보이도록 권한 조건은 signal 근처에 두세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
