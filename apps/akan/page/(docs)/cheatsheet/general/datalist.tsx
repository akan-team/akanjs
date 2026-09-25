import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title="DataList & Enum">
        <Docs.Title>DataList & Enum</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Enum and DataList are small helpers you will see often in Akan. Enum is for a fixed set of values. DataList is for a list of items that each have an id.",
              ko: "Enum과 DataList는 Akan에서 자주 보게 되는 작은 도구입니다. Enum은 정해진 값 목록에 쓰고, DataList는 id가 있는 목록에 씁니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>{l.trans({ en: "Enum: status, role, type, category.", ko: "Enum: 상태, 역할, 종류, 카테고리." })}</li>
            <li>
              {l.trans({
                en: "DataList: users, files, posts, selected rows.",
                ko: "DataList: 사용자 목록, 파일 목록, 게시글 목록, 선택된 row.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="enum" title={l.trans({ en: "Enum", ko: "Enum" })}>
        <Docs.Title>{l.trans({ en: "Enum", ko: "Enum" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use Enum when the value must be one of a few known choices. This keeps forms, APIs, and labels consistent.",
              ko: "값이 몇 가지 선택지 중 하나여야 한다면 Enum을 사용합니다. form, API, label을 일관되게 유지할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Fixed values", ko: "정해진 값" })}
          code={`export class PostStatus extends enumOf("postStatus", [
  "draft",
  "published",
  "archived",
] as const) {}`}
        />
        <Code.Snippet
          title={l.trans({ en: "Use values in UI", ko: "UI에서 값 사용" })}
          code={`const options = PostStatus.map((status) => ({
  value: status,
  label: status,
}));`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="datalist" title="DataList">
        <Docs.Title>DataList</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use DataList when you already loaded a list and want to update it by id. It is useful for UI state because you can add, replace, pick, and filter items easily.",
              ko: "이미 불러온 목록을 id 기준으로 다루고 싶다면 DataList를 사용합니다. UI 상태에서 항목을 추가, 교체, 선택, 필터링하기 편합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`set(item)`: add or replace an item.",
                ko: "`set(item)`: 항목을 추가하거나 교체합니다.",
              })}
            </li>
            <li>
              {l.trans({ en: "`pick(id)`: get one item by id.", ko: "`pick(id)`: id로 항목 하나를 가져옵니다." })}
            </li>
            <li>
              {l.trans({
                en: "`filter(fn)`: make a smaller DataList.",
                ko: "`filter(fn)`: 더 작은 DataList를 만듭니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "List by id", ko: "id 기준 목록" })}
          code={`const users = new DataList([
  { id: "u1", nickname: "Akan" },
]);

users.set({ id: "u2", nickname: "Akan" });

const user = users.pick("u1");`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="when" title={l.trans({ en: "When To Use", ko: "언제 쓰나" })}>
        <Docs.Title>{l.trans({ en: "When To Use", ko: "언제 쓰나" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Use Enum when the value is a kind of label: status, role, type, size, visibility.",
                ko: "값이 label 성격이라면 Enum을 사용하세요. 예: 상태, 역할, 종류, 크기, 공개 범위.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use DataList when the data is a collection of records with ids.",
                ko: "데이터가 id를 가진 record들의 모음이라면 DataList를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Do not use DataList as a database query. It is for data already loaded into the app.",
                ko: "DataList를 DB query처럼 사용하지 마세요. 이미 앱에 불러온 데이터를 다루는 도구입니다.",
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
                en: "Give enum names stable `refName`s because dictionaries and schemas can refer to them.",
                ko: "dictionary와 schema가 참조할 수 있으므로 enum의 `refName`은 안정적으로 유지하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Keep DataList items small. It works best with light models used in lists.",
                ko: "DataList 항목은 작게 유지하세요. 목록에서 쓰는 light model과 잘 맞습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Remember the shortcut: value choices are Enum, id collections are DataList.",
                ko: "간단히 기억하세요. 값 선택지는 Enum, id 목록은 DataList입니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
