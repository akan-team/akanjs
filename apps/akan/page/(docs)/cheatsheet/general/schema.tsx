import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Schema Design", ko: "스키마 설계" })}>
        <Docs.Title>{l.trans({ en: "Schema Design", ko: "스키마 설계" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "In Akan, `constant.ts` is where you describe the shape of your data. The easiest way to design it is to start from the page or API that will read the data.",
              ko: "Akan에서 `constant.ts`는 데이터의 모양을 설명하는 곳입니다. 가장 쉬운 설계 방법은 그 데이터를 읽을 화면이나 API에서 시작하는 것입니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A simple rule is: keep small data that is read together in one document, and split data that keeps growing into another model.",
              ko: "간단한 규칙은 이것입니다. 작고 함께 읽는 데이터는 한 document에 두고, 계속 늘어나는 데이터는 다른 model로 분리하세요.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="query-first" title={l.trans({ en: "Start From The Screen", ko: "화면에서 시작하기" })}>
        <Docs.Title>{l.trans({ en: "Start From The Screen", ko: "화면에서 시작하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Before adding fields, imagine the list page, detail page, and form. The schema should make those common reads easy.",
              ko: "field를 추가하기 전에 목록 화면, 상세 화면, 입력 form을 먼저 떠올려보세요. schema는 자주 읽는 화면을 쉽게 만들기 위한 모양이어야 합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "List page: what small fields should every row show?",
                ko: "목록 화면: 각 row에 어떤 작은 정보가 보여야 하나요?",
              })}
            </li>
            <li>
              {l.trans({
                en: "Detail page: what full data should load together?",
                ko: "상세 화면: 어떤 전체 데이터를 함께 불러와야 하나요?",
              })}
            </li>
            <li>
              {l.trans({
                en: "Child list: what data can grow forever, like comments or logs?",
                ko: "하위 목록: 댓글이나 로그처럼 계속 늘어날 수 있는 데이터는 무엇인가요?",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Small list shape", ko: "작은 목록 모양" })}
          code={`export class LightPost extends via(
  PostObject,
  ["title", "author", "thumbnail", "status"] as const,
  (resolve) => ({}),
) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="relationship-size" title={l.trans({ en: "Relationship Size", ko: "관계 크기" })}>
        <Docs.Title>{l.trans({ en: "Relationship Size", ko: "관계 크기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When one thing has many children, first ask how many children there will be. The answer changes the schema.",
              ko: "어떤 데이터가 여러 하위 데이터를 가질 때는 먼저 몇 개까지 늘어날지 생각하세요. 개수에 따라 schema가 달라집니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "One to few: embed it. Example: a user's two or three links, a post's small settings.",
                ko: "One to few: 안에 넣습니다. 예: 사용자의 링크 몇 개, 게시글의 작은 설정값.",
              })}
            </li>
            <li>
              {l.trans({
                en: "One to many: use ids or light snapshots. Example: selected files, assigned users.",
                ko: "One to many: id나 light snapshot을 둡니다. 예: 선택된 파일들, 담당자 목록.",
              })}
            </li>
            <li>
              {l.trans({
                en: "One to squillions: make a child model. Example: comments, logs, events, telemetry.",
                ko: "One to squillions: child model로 분리합니다. 예: 댓글, 로그, 이벤트, 장비 상태 기록.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Growing child model", ko: "계속 늘어나는 child model" })}
          code={`export class CommentInput extends via((field) => ({
  post: field(ID, { ref: "post" }),
  content: field(String),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="denormalize" title={l.trans({ en: "Copy Small Snapshots", ko: "작은 스냅샷 복사하기" })}>
        <Docs.Title>{l.trans({ en: "Copy Small Snapshots", ko: "작은 스냅샷 복사하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Sometimes copying a small piece of data makes the page much simpler. For example, a post can keep a light author snapshot so the list page does not need another request.",
              ko: "작은 데이터를 복사해두면 화면이 훨씬 단순해질 때가 있습니다. 예를 들어 게시글이 작성자 light snapshot을 가지고 있으면 목록 화면에서 추가 요청이 필요 없습니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Good to copy: name, thumbnail, small status text.",
                ko: "복사하기 좋은 것: 이름, 썸네일, 작은 상태 문구.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Be careful: values that change every second or must always be perfectly fresh.",
                ko: "조심할 것: 매초 바뀌거나 항상 완벽히 최신이어야 하는 값.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Light snapshot", ko: "Light snapshot" })}
          code={`export class PostInput extends via((field) => ({
  author: field(LightUser),
  title: field(String),
  thumbnail: field(File).optional(),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="layers" title={l.trans({ en: "Akan Model Layers", ko: "Akan Model Layer" })}>
        <Docs.Title>{l.trans({ en: "Akan Model Layers", ko: "Akan Model Layer" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`Input`: fields a user can submit.",
                ko: "`Input`: 사용자가 입력할 수 있는 field입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`Object`: fields the server manages, such as status or counters.",
                ko: "`Object`: status나 counter처럼 서버가 관리하는 field입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`Light<Model>`: small shape for lists and snapshots.",
                ko: "`Light<Model>`: 목록과 snapshot에 쓰는 작은 모양입니다.",
              })}
            </li>
            <li>{l.trans({ en: "`Model`: the full document.", ko: "`Model`: 전체 document입니다." })}</li>
            <li>
              {l.trans({
                en: "`Insight`: summary data for dashboards.",
                ko: "`Insight`: dashboard에 쓰는 요약 데이터입니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Common shape", ko: "기본 모양" })}
          code={`export class PostInput extends via((field) => ({
  title: field(String),
})) {}

export class PostObject extends via(PostInput, (field) => ({
  status: field(PostStatus, { default: "draft" }),
})) {}

export class LightPost extends via(PostObject, ["title", "status"] as const, (resolve) => ({})) {}
export class Post extends via(PostObject, LightPost, (resolve) => ({})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Design for the read path people use every day, not for a perfect database diagram.",
                ko: "완벽한 DB 다이어그램보다 사람들이 매일 쓰는 읽기 흐름을 기준으로 설계하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "If an array can grow without limit, it probably deserves its own model.",
                ko: "배열이 끝없이 커질 수 있다면 별도 model로 분리하는 편이 좋습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Keep `Light<Model>` small. It should feel like a list row, not the full detail page.",
                ko: "`Light<Model>`은 작게 유지하세요. 상세 페이지가 아니라 목록 row처럼 느껴져야 합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
