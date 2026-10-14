import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const enumMemberRows = [
    {
      name: 'PostStatus["value"]',
      desc: l.trans({
        en: 'The value type, `"draft" | "published" | "archived"`, for props and parameters.',
        ko: 'props와 파라미터에 쓰는 값 타입 `"draft" | "published" | "archived"`입니다.',
      }),
    },
    {
      name: "values",
      desc: l.trans({
        en: "Every value, in the order you declared them.",
        ko: "선언한 순서 그대로의 값 배열입니다.",
      }),
    },
    {
      name: "has(value)",
      desc: l.trans({
        en: "Whether a value belongs to the enum, checked at runtime.",
        ko: "어떤 값이 이 Enum에 속하는지 런타임에 확인합니다.",
      }),
    },
    {
      name: "indexOf(value)",
      desc: l.trans({
        en: "The value's position in `values`, throwing for a value outside the enum.",
        ko: "`values` 안에서 값의 위치를 돌려주며, Enum에 없는 값이면 에러를 던집니다.",
      }),
    },
    {
      name: ["map", "filter", "forEach"],
      desc: l.trans({
        en: "The usual array methods, run over `values`.",
        ko: "`values`를 대상으로 도는 일반 배열 메서드입니다.",
      }),
    },
    {
      name: ["find", "findIndex"],
      desc: l.trans({
        en: "Like the array methods, but they throw when nothing matches.",
        ko: "배열 메서드와 같지만, 맞는 값이 없으면 에러를 던집니다.",
      }),
    },
    {
      name: "refName",
      desc: l.trans({
        en: "The name you passed to `enumOf`, here `postStatus`.",
        ko: "`enumOf`에 넘긴 이름으로, 여기서는 `postStatus`입니다.",
      }),
    },
  ];

  const dataListMethodRows = [
    {
      name: "new DataList(items)",
      desc: l.trans({
        en: "Builds a list from an array or another DataList, keeping the last item for a repeated id.",
        ko: "배열이나 다른 DataList로 목록을 만들며, 같은 id가 여러 번 오면 마지막 항목이 남습니다.",
      }),
    },
    {
      name: ["set(item)", "delete(id)"],
      desc: l.trans({
        en: "Add or replace, or remove, by id, changing this list in place and returning it.",
        ko: "id 기준으로 추가·교체하거나 삭제하며, 이 목록 자체를 바꾼 뒤 그대로 돌려줍니다.",
      }),
    },
    {
      name: ["get(id)", "pick(id)", "has(id)"],
      desc: l.trans({
        en: "Look up by id: `get` may return `undefined`, `pick` throws, `has` answers true or false.",
        ko: "id로 찾습니다. `get`은 `undefined`를 돌려줄 수 있고, `pick`은 에러를 던지고, `has`는 참·거짓을 답합니다.",
      }),
    },
    {
      name: ["indexOf(id)", "at(idx)", "pickAt(idx)"],
      desc: l.trans({
        en: "Position lookups, where `indexOf` and `pickAt` throw when nothing is there.",
        ko: "위치로 찾으며, `indexOf`와 `pickAt`은 찾는 것이 없으면 에러를 던집니다.",
      }),
    },
    {
      name: ["filter", "slice", "sort"],
      desc: l.trans({
        en: "Return a new DataList, but `sort` also reorders the source array, so sort a copy.",
        ko: "새 DataList를 돌려주지만 `sort`는 원본 배열의 순서도 바꾸므로, 복사본을 정렬합니다.",
      }),
    },
    {
      name: ["map", "find", "some", "every", "reduce", "forEach", "flatMap"],
      desc: l.trans({
        en: "The array methods over the items, where `map` returns a plain array.",
        ko: "항목을 대상으로 도는 배열 메서드이며, `map`은 일반 배열을 돌려줍니다.",
      }),
    },
    {
      name: ["length", "values"],
      desc: l.trans({
        en: "The item count and the underlying array, and the list itself works in `for…of` too.",
        ko: "항목 수와 내부 배열이며, 목록에 바로 `for…of`를 돌려도 됩니다.",
      }),
    },
    {
      name: "save()",
      desc: l.trans({
        en: "Returns a new DataList with the same items, which is what a store needs.",
        ko: "같은 항목으로 새 DataList를 만들어 돌려주며, store에 넘길 때 필요한 것이 이것입니다.",
      }),
    },
  ];

  const storeKeyRows = [
    {
      name: "postList",
      desc: l.trans({
        en: "The rows the slice has loaded, suffixed for a named slice as in `postListInPublic`.",
        ko: "slice가 불러온 행이며, 이름 있는 slice는 `postListInPublic`처럼 뒤에 접미사가 붙습니다.",
      }),
    },
    {
      name: "postInitList",
      desc: l.trans({
        en: "The rows as the last `init` loaded them.",
        ko: "마지막 `init`이 불러온 그대로의 행입니다.",
      }),
    },
    {
      name: "postSelection",
      desc: l.trans({
        en: "The rows a user selected, filled by `st.do.selectPost(post)`.",
        ko: "`st.do.selectPost(post)`로 채우는, 사용자가 선택한 행입니다.",
      }),
    },
    {
      name: "renderList",
      desc: l.trans({
        en: "`Load.Units` passes the list to this callback as a DataList.",
        ko: "`Load.Units`가 이 콜백에 목록을 DataList로 넘겨줍니다.",
      }),
    },
  ];

  const compareColumns = [
    { key: "aspect", label: l.trans({ en: "Question", ko: "구분" }) },
    { key: "enum", label: "Enum" },
    { key: "datalist", label: "DataList" },
  ];

  const compareRows = [
    {
      aspect: l.trans({ en: "What it holds", ko: "담는 것" }),
      enum: l.trans({ en: "One value from a fixed set", ko: "정해진 선택지 중 값 하나" }),
      datalist: l.trans({ en: "Records that each have an `id`", ko: "각자 `id`가 있는 레코드 목록" }),
    },
    {
      aspect: l.trans({ en: "Examples", ko: "예" }),
      enum: l.trans({ en: "Status, role, type, size, visibility", ko: "상태, 역할, 종류, 크기, 공개 범위" }),
      datalist: l.trans({ en: "Users, files, posts, selected rows", ko: "사용자, 파일, 게시글, 선택된 행" }),
    },
    {
      aspect: l.trans({ en: "Where it lives", ko: "있는 곳" }),
      enum: l.trans({ en: "`*.constant.ts`, as a field type", ko: "`*.constant.ts`의 필드 타입" }),
      datalist: l.trans({ en: "Store state, or `new DataList(items)`", ko: "store 상태, 또는 `new DataList(items)`" }),
    },
    {
      aspect: l.trans({ en: "Typical call", ko: "대표 호출" }),
      enum: "`PostStatus.has(value)`",
      datalist: "`postList.pick(id)`",
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "DataList & Enum", ko: "DataList와 Enum" })}>
        <Docs.Title>{l.trans({ en: "DataList & Enum", ko: "DataList와 Enum" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Enum and DataList are two small helpers you will meet all over Akan code. Enum is for a fixed set of values; DataList is for a list of items that each have an id.",
              ko: "Enum과 DataList는 Akan 코드 곳곳에서 만나는 작은 도구 두 가지입니다. Enum은 정해진 값 목록에, DataList는 id가 있는 항목 목록에 씁니다.",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">Enum</div>
              <div className="mb-2 text-foreground/50 text-xs">
                {l.trans({ en: "A fixed set of values", ko: "정해진 값 목록" })}
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "Status, role, type, category: a value that is always one of a few known choices.",
                  ko: "상태, 역할, 종류, 카테고리처럼 늘 몇 가지 중 하나인 값입니다.",
                })}
              </div>
              <code className={chip}>{'enumOf("postStatus", [...] as const)'}</code>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
              <div className="font-semibold text-primary">DataList</div>
              <div className="mb-2 text-foreground/50 text-xs">
                {l.trans({ en: "A list keyed by id", ko: "id로 찾는 목록" })}
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: "Users, files, posts, selected rows: records you find and replace by id.",
                  ko: "사용자, 파일, 게시글, 선택된 행처럼 id로 찾고 바꾸는 레코드 목록입니다.",
                })}
              </div>
              <code className={chip}>{'userList.pick("u1")'}</code>
            </div>
          </div>
          <div>
            {l.trans({
              en: (
                <span>
                  Both are imported from <code>akanjs/base</code>.
                </span>
              ),
              ko: (
                <span>
                  둘 다 <code>akanjs/base</code>에서 import합니다.
                </span>
              ),
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="enum" title="Enum">
        <Docs.Title>Enum</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use an Enum when a value must be one of a few known choices. Declared once, it keeps forms, APIs and labels in agreement.",
              ko: "값이 몇 가지 선택지 중 하나여야 한다면 Enum을 씁니다. 한 번 선언해 두면 폼, API, 화면 라벨이 모두 같은 목록을 따릅니다.",
            })}
          </div>

          <Docs.SubSubTitle>
            {l.trans({ en: "1. Declare It In The Constant File", ko: "1. constant 파일에 선언하기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Declare the class above the model classes, then use it as a field type:",
              ko: "모델 클래스들 위에 Enum 클래스를 선언하고, 필드 타입으로 씁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/post/post.constant.ts"
          code={`import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

export class PostStatus extends enumOf("postStatus", [
  "draft",
  "published",
  "archived",
] as const) {}

export class PostInput extends via((field) => ({
  title: field(String),
  status: field(PostStatus, { default: "draft" }),
})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      Always add <code>as const</code>.
                    </strong>{" "}
                    Without it, <code>PostStatus["value"]</code> widens to <code>string</code> and a typo compiles.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>as const</code>는 꼭 붙입니다.
                    </strong>{" "}
                    빠지면 <code>PostStatus["value"]</code>가 <code>string</code>으로 넓어져 오타도 그대로 컴파일됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The first argument is the refName.</strong> It is the class name in camelCase:{" "}
                    <code>PostStatus</code> → <code>postStatus</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>첫 번째 인자가 refName입니다.</strong> 클래스 이름을 camelCase로 바꿔 씁니다.{" "}
                    <code>PostStatus</code> → <code>postStatus</code>
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Numbers work too.</strong> Whole numbers make an <code>Int</code> field; any decimal makes
                    it <code>Float</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>숫자도 됩니다.</strong> 모두 정수면 <code>Int</code> 필드가 되고, 소수가 하나라도 있으면{" "}
                    <code>Float</code>이 됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No TypeScript enum.</strong> Akan never uses the <code>enum</code> keyword; a choice field
                    is always an <code>enumOf</code> class.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>TypeScript enum은 쓰지 않습니다.</strong> Akan은 <code>enum</code> 키워드를 쓰지 않고,
                    선택지 필드는 늘 <code>enumOf</code> 클래스입니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "2. Give Each Value A Label", ko: "2. 값마다 라벨 붙이기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Translate every value in the dictionary's <code>.enum()</code> stage, keyed by the refName:
                </span>
              ),
              ko: (
                <span>
                  dictionary의 <code>.enum()</code> 단계에서 refName을 키로 값마다 번역을 적습니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/post/post.dictionary.ts"
          code={`import { modelDictionary } from "akanjs/dictionary";

import type { Post, PostInsight, PostStatus } from "./post.constant";
import type { PostFilter } from "./post.document";
import type { PostEndpoint, PostSlice } from "./post.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Post", "게시글"]).desc(["A post a user writes", "사용자가 쓰는 게시글"])) // [!code collapse:8]
  .model<Post>((t) => ({
    title: t(["Title", "제목"]).desc(["Post title", "게시글 제목"]),
    status: t(["Status", "상태"]).desc(["Publishing state", "공개 상태"]),
  }))
  .insight<PostInsight>((t) => ({}))
  .query<PostFilter>((fn) => ({}))
  .sort<PostFilter>((t) => ({}))
  .enum<PostStatus>("postStatus", (t) => ({
    draft: t(["Draft", "초안"]).desc(["Not public yet", "공개 전"]),
    published: t(["Published", "공개"]).desc(["Public", "공개됨"]),
    archived: t(["Archived", "보관"]).desc(["Hidden", "숨김"]),
  }))
  .slice<PostSlice>((fn) => ({})) // [!code collapse:4]
  .endpoint<PostEndpoint>((fn) => ({}))
  .error({})
  .translate({});`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every value needs an entry.</strong> The stage is typed from <code>PostStatus</code>, so a
                    missing value is a type error.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>값마다 항목이 있어야 합니다.</strong> 이 단계의 타입이 <code>PostStatus</code>에서 나오므로,
                    빠진 값은 타입 에러가 됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Each label gets a key.</strong> The value <code>draft</code> reads as{" "}
                    <code>l("postStatus.draft")</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>라벨마다 키가 생깁니다.</strong> <code>draft</code> 값은 <code>l("postStatus.draft")</code>
                    로 읽습니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "3. Use It On Screen", ko: "3. 화면에서 쓰기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "In a form, hand the class straight to a toggle field:",
              ko: "폼에서는 Enum 클래스를 토글 필드에 그대로 넘깁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="tsx"
          title="apps/myapp/lib/post/Post.Template.tsx"
          code={`"use client";
import { cnst, st, usePage } from "@apps/myapp/client";
import { Field, Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}
export const General = ({ className }: GeneralProps) => {
  const postForm = st.use.postForm();
  const { l } = usePage();
  return (
    <Layout.Template className={className}>
      <Field.ToggleSelect
        label={l("post.status")}
        desc={l("post.status.desc")}
        value={postForm.status}
        items={cnst.PostStatus}
        onChange={st.do.setStatusOnPost}
      />
    </Layout.Template>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Labels come from the dictionary.</strong> <code>Field.ToggleSelect</code> and{" "}
                    <code>Field.MultiToggleSelect</code> take the enum class and label each choice by its key.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>라벨은 dictionary에서 옵니다.</strong> <code>Field.ToggleSelect</code>와{" "}
                    <code>Field.MultiToggleSelect</code>는 Enum 클래스를 받아 선택지마다 해당 키의 라벨을 붙입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Pass the setter as is.</strong> <code>onChange={"{st.do.setStatusOnPost}"}</code> without an
                    arrow wrapper keeps the field visible to the in-page agent.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>setter는 그대로 넘깁니다.</strong> 화살표 함수로 감싸지 않은{" "}
                    <code>onChange={"{st.do.setStatusOnPost}"}</code>라야 인페이지 에이전트에도 이 필드가 공개됩니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: "To show a saved value, look up the same key. A module-scope map gives each value its own style:",
              ko: "저장된 값을 보여줄 때도 같은 키를 찾습니다. 값마다 스타일을 주려면 모듈 스코프 맵을 씁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="tsx"
          title="apps/myapp/lib/post/Post.Unit.tsx"
          code={`import { type cnst, usePage } from "@apps/myapp/client";
import type { ModelProps } from "akanjs/client";

const statusClass: { [key in cnst.PostStatus["value"]]: string } = {
  draft: "text-foreground/60",
  published: "text-success",
  archived: "text-foreground/40",
} as const;

export const Card = ({ className, post }: ModelProps<"post", cnst.LightPost>) => {
  const { l } = usePage();
  return (
    <div className={className}>
      <div className="font-semibold">{post.title}</div>
      <span className={statusClass[post.status]}>
        {l(\`postStatus.\${post.status}\`)}
      </span>
    </div>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The map covers every value.</strong> Typed as{" "}
                    <code>{'{ [key in cnst.PostStatus["value"]]: string }'}</code>, it stops compiling when a new value
                    has no class.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>맵은 모든 값을 빠짐없이 담습니다.</strong>{" "}
                    <code>{'{ [key in cnst.PostStatus["value"]]: string }'}</code>로 타입을 주면, 새 값에 클래스를
                    빠뜨렸을 때 타입 에러가 납니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>
            {l.trans({ en: "4. Work With Values In Code", ko: "4. 코드에서 값 다루기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The class itself carries the values and a few array helpers:",
              ko: "Enum 클래스는 값 목록과 몇 가지 배열 도우미를 직접 갖고 있습니다:",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Member", ko: "멤버" })} items={enumMemberRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  <code>Select</code> takes the class itself, as <code>{"options={cnst.PostStatus}"}</code>, and lists
                  each value under its dictionary name. A control that takes only label/value pairs needs the labels
                  mapped in:
                </span>
              ),
              ko: (
                <span>
                  <code>Select</code>는 <code>{"options={cnst.PostStatus}"}</code>처럼 클래스를 그대로 받아 각 값을
                  dictionary 이름으로 보여줍니다. label/value 쌍만 받는 컨트롤에는 라벨을 직접 매핑해 넘깁니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="tsx"
          title="apps/myapp/lib/post/Post.Zone.tsx"
          code={`const { l } = usePage();
const statusOptions = cnst.PostStatus.map((status) => ({
  value: status,
  label: l(\`postStatus.\${status}\`),
}));`}
        />
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="datalist" title="DataList">
        <Docs.Title>DataList</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use a DataList when a list is already loaded and you want to work with it by id. It suits UI state because adding, replacing, picking and filtering are one call each.",
              ko: "이미 불러온 목록을 id 기준으로 다루고 싶다면 DataList를 씁니다. 추가, 교체, 선택, 필터링이 호출 한 번이라 UI 상태에 잘 맞습니다.",
            })}
          </div>

          <Docs.SubSubTitle>{l.trans({ en: "The Basics", ko: "기본 사용" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A DataList keeps exactly one item per id:",
              ko: "DataList는 id 하나에 항목 하나만 둡니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/user/user.test.ts"
          code={`import { describe, expect, test } from "bun:test";
import { DataList } from "akanjs/base";

describe("DataList", () => {
  test("keeps one item per id", () => {
    const users = new DataList([{ id: "u1", nickname: "Akan" }]);

    users.set({ id: "u2", nickname: "Akan" });
    users.set({ id: "u1", nickname: "Renamed" });

    expect(users.length).toBe(2);
    expect(users.pick("u1").nickname).toBe("Renamed");
    expect(users.get("u3")).toBeUndefined();
    expect(() => users.pick("u3")).toThrow();
    expect(users.filter((user) => user.nickname === "Akan").length).toBe(1);
  });
});`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>set</code> adds or replaces.
                    </strong>{" "}
                    A new id goes to the end; a known id is swapped in place.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>set</code>은 추가하거나 교체합니다.
                    </strong>{" "}
                    새 id는 끝에 붙고, 이미 있는 id는 그 자리에서 바뀝니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>pick</code> or <code>get</code>.
                    </strong>{" "}
                    <code>pick(id)</code> throws for a missing id; <code>get(id)</code> returns <code>undefined</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>pick</code>과 <code>get</code>.
                    </strong>{" "}
                    없는 id에 <code>pick(id)</code>는 에러를 던지고, <code>get(id)</code>는 <code>undefined</code>를
                    돌려줍니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>filter</code> makes a smaller DataList.
                    </strong>{" "}
                    The original list stays as it was.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>filter</code>는 더 작은 DataList를 만듭니다.
                    </strong>{" "}
                    원래 목록은 그대로입니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Methods At A Glance", ko: "메서드 한눈에 보기" })}</Docs.SubSubTitle>
          <Docs.IntroTable type={l.trans({ en: "Method", ko: "메서드" })} items={dataListMethodRows} />

          <Docs.SubSubTitle>{l.trans({ en: "DataList In The Store", ko: "store 속 DataList" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Every slice gives the store three DataList keys, and <code>Load.Units</code> hands you one more. For a
                  post model:
                </span>
              ),
              ko: (
                <span>
                  slice마다 store에 DataList 키가 세 개 생기고, <code>Load.Units</code>도 하나를 넘겨줍니다. post
                  모델이라면 이렇습니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Name", ko: "이름" })} items={storeKeyRows} />

          <Docs.SubSubTitle>{l.trans({ en: "Change A Store List", ko: "store 목록 바꾸기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  A custom store action writes the changed list back with <code>save()</code>, as the shared lib's admin
                  store does:
                </span>
              ),
              ko: (
                <span>
                  직접 만든 store 액션은 바뀐 목록을 <code>save()</code>로 되돌려 씁니다. shared lib의 admin store가
                  이렇게 합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="libs/shared/lib/admin/admin.store.ts"
          code={`import { store } from "akanjs/store";

import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class AdminStore extends store(sig.admin, () => ({
  me: new cnst.Admin(),
})) {
  async addAdminRole(adminId: string, role: cnst.AdminRole["value"]) {
    const admin = await fetch.addAdminRole(adminId, role);
    const { adminList } = this.get();
    this.set({ adminList: adminList.set(admin).save() });
  }
}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>set</code>, then <code>save</code>.
                    </strong>{" "}
                    <code>set</code> changes the list in place; <code>save()</code> wraps it in a new DataList so the
                    store sees a new value.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>set</code> 다음에 <code>save</code>.
                    </strong>{" "}
                    <code>set</code>은 목록 자체를 바꾸고, <code>save()</code>가 그것을 새 DataList로 감싸 store가 새
                    값으로 알아보게 합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Generated actions already do this.</strong> Create, update and remove keep{" "}
                    <code>postList</code> current; write an action only for a custom endpoint such as{" "}
                    <code>addAdminRole</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>생성된 액션은 이미 이렇게 합니다.</strong> 생성, 수정, 삭제는 <code>postList</code>를 알아서
                    갱신하므로, <code>addAdminRole</code> 같은 커스텀 endpoint에만 액션을 씁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>Always hand the store a new DataList.</strong> <code>adminList.set(admin)</code> returns the
                  same instance, and the store compares values by reference, so nothing on screen updates. Finish with{" "}
                  <code>.save()</code>.
                </span>
              ),
              ko: (
                <span>
                  <strong>store에는 늘 새 DataList를 넘깁니다.</strong> <code>adminList.set(admin)</code>은 같은
                  인스턴스를 돌려주고 store는 참조로 값을 비교하므로, 화면이 바뀌지 않습니다. 끝에 <code>.save()</code>
                  를 붙이세요.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="when" title={l.trans({ en: "Which One To Use", ko: "언제 무엇을 쓰나" })}>
        <Docs.Title>{l.trans({ en: "Which One To Use", ko: "언제 무엇을 쓰나" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A label-like value is an Enum; a collection of records with ids is a DataList.",
              ko: "라벨 같은 값이면 Enum, id를 가진 레코드 모음이면 DataList입니다.",
            })}
          </div>
          <Docs.Table columns={compareColumns} rows={compareRows} />
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>DataList is not a database query.</strong> It only works on data already loaded into the
                    app, so <code>filter</code> sees the loaded rows, not the whole table.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>DataList는 DB 쿼리가 아닙니다.</strong> 이미 앱에 불러온 데이터만 다루므로,{" "}
                    <code>filter</code>는 테이블 전체가 아니라 불러온 행만 봅니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Narrow on the server instead.</strong> To fetch fewer rows, add a query filter or a slice.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>줄이는 일은 서버에서 합니다.</strong> 가져올 행 자체를 줄이려면 쿼리 필터나 slice를
                    추가합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.LinkGrid
            items={[
              {
                href: "/cheatsheet/performance/query",
                title: l.trans({ en: "Querying", ko: "쿼리" }),
                desc: l.trans({
                  en: "Filter rows on the server before they reach the list.",
                  ko: "목록에 닿기 전에 서버에서 행을 거릅니다.",
                }),
              },
              {
                href: "/cheatsheet/interface/form",
                title: l.trans({ en: "Form From Schema", ko: "스키마로 폼 만들기" }),
                desc: l.trans({
                  en: "Bind enum fields and other inputs to the store.",
                  ko: "Enum 필드와 다른 입력을 store에 묶습니다.",
                }),
              },
            ]}
          />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "팁" })}</Docs.Title>
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep the refName stable.</strong> Dictionaries, label keys like{" "}
                    <code>postStatus.draft</code> and API schemas find the enum by it, so renaming it leaves them
                    behind.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>refName은 바꾸지 않습니다.</strong> dictionary, <code>postStatus.draft</code> 같은 라벨 키,
                    API 스키마가 모두 이 이름으로 Enum을 찾으므로, 바꾸면 이들이 따라오지 못합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep DataList items small.</strong> Store lists hold light models, which carry only the
                    fields a list needs.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>DataList 항목은 가볍게 둡니다.</strong> store 목록은 목록에 필요한 필드만 가진 light model을
                    담습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Sort a copy.</strong> Write <code>list.filter(fn).sort(compare)</code> or{" "}
                    <code>new DataList(list).sort(compare)</code>, never <code>sort</code> on a store list directly.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>정렬은 복사본에 합니다.</strong> <code>list.filter(fn).sort(compare)</code>나{" "}
                    <code>new DataList(list).sort(compare)</code>로 쓰고, store 목록에 바로 <code>sort</code>를 부르지
                    않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Remember the shortcut.</strong> Value choices are Enum; id collections are DataList.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>이것만 기억하세요.</strong> 값 선택지는 Enum, id 목록은 DataList입니다.
                  </span>
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
