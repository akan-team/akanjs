import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";

  const pieceRows = [
    {
      name: "post.signal.ts",
      desc: l.trans({
        en: "The slice. It decides which records this screen can read and edit.",
        ko: "slice입니다. 이 화면이 어떤 레코드를 읽고 고칠 수 있는지 정합니다.",
      }),
      example: "inAdmin: init({ guards: [Admin] })",
    },
    {
      name: "Post.Template.tsx",
      desc: l.trans({
        en: "Draws the form fields. Create and edit use the same one.",
        ko: "폼 필드를 그립니다. 생성과 수정이 같은 Template을 씁니다.",
      }),
      example: "onChange={st.do.setTitleOnPost}",
    },
    {
      name: "Post.Zone.tsx",
      desc: l.trans({
        en: "Connects the slice to UI behaviour with the `Load` and `Model` components.",
        ko: "`Load`와 `Model` 컴포넌트로 slice를 화면 동작에 연결합니다.",
      }),
      example: "<Load.Units init={init} renderItem={…} />",
    },
  ];

  const actionColumns = [
    { key: "task", label: l.trans({ en: "Task", ko: "할 일" }) },
    { key: "store", label: l.trans({ en: "Store key or action", ko: "store 키 · 액션" }), code: true },
    { key: "component", label: l.trans({ en: "Component", ko: "컴포넌트" }), code: true },
  ];
  const actionRows = [
    { task: l.trans({ en: "List", ko: "목록" }), component: "Load.Units", store: "postListInAdmin" },
    {
      task: l.trans({ en: "Open", ko: "열기" }),
      component: "Model.ViewWrapper + Model.ViewEditModal",
      store: "viewPost(id)",
    },
    { task: l.trans({ en: "Create", ko: "생성" }), component: "Load.Edit · Model.New", store: "newPost → submitPost" },
    {
      task: l.trans({ en: "Edit", ko: "수정" }),
      component: "Load.Edit · Model.Edit",
      store: "editPost(id) → submitPost",
    },
    { task: l.trans({ en: "Remove", ko: "삭제" }), component: "Model.Remove", store: "removePost(id)" },
  ];

  const guardRows = [
    {
      name: "root",
      desc: l.trans({
        en: "The root slice `initPost(queryKey, args)`, which can run any filter, so it is always `Admin`.",
        ko: "어떤 filter든 실행할 수 있는 root slice `initPost(queryKey, args)`이므로, 항상 `Admin`으로 둡니다.",
      }),
    },
    {
      name: "get",
      desc: l.trans({
        en: "The single-record read `fetch.post(id)`, which `viewPost` and `editPost` also use.",
        ko: "레코드 하나를 읽는 `fetch.post(id)`이며, `viewPost`와 `editPost`도 이것을 부릅니다.",
      }),
    },
    {
      name: "cru",
      desc: l.trans({
        en: "`createPost`, `updatePost`, `removePost`; the `create`, `update`, `remove` keys override one each.",
        ko: "`createPost`, `updatePost`, `removePost`이며, `create`, `update`, `remove` 키로 하나씩 따로 덮어쓸 수 있습니다.",
      }),
    },
    {
      name: "init({ guards })",
      desc: l.trans({
        en: "A named slice's own list, which the `guards` map above never reaches.",
        ko: "이름 있는 slice의 목록이며, 위의 `guards` 옵션은 여기에 닿지 않습니다.",
      }),
    },
  ];

  const shellRows = [
    {
      name: "Load.Edit",
      desc: l.trans({
        en: "Goes on a page of its own, such as `new.tsx`; the form is open as soon as the route is.",
        ko: "`new.tsx` 같은 전용 page에 두며, 그 경로에 들어오면 폼이 바로 열립니다.",
      }),
    },
    {
      name: "Model.New",
      desc: l.trans({
        en: "Goes anywhere and draws its own New button; a click calls `st.do.newPost()`.",
        ko: "어디든 두면 새로 만들기 버튼을 직접 그리고, 누르면 `st.do.newPost()`를 부릅니다.",
      }),
    },
    {
      name: "Model.Edit",
      desc: l.trans({
        en: "Goes anywhere and draws its own Edit button; a click calls `st.do.editPost(id)`.",
        ko: "어디든 두면 편집 버튼을 직접 그리고, 누르면 `st.do.editPost(id)`를 부릅니다.",
      }),
    },
    {
      name: "Model.ViewEditModal",
      desc: l.trans({
        en: "Goes beside a list in a Zone; the Edit button in its detail view opens the form.",
        ko: "Zone 안 목록 옆에 두며, 상세 보기 안의 편집 버튼이 폼을 엽니다.",
      }),
    },
  ];

  const nextLinks = [
    {
      href: "/cheatsheet/interface/form",
      title: l.trans({ en: "Forms", ko: "폼 만들기" }),
      desc: l.trans({
        en: "The Template, the create and edit pages, and every shell option in detail.",
        ko: "Template, 생성·수정 page, 셸 옵션을 자세히 다룹니다.",
      }),
    },
    {
      href: "/conventions/module/signal",
      title: "model.signal.ts",
      desc: l.trans({
        en: "Slices, guards and the fetch names each slice key produces.",
        ko: "slice, guard, slice 키마다 생기는 fetch 이름을 다룹니다.",
      }),
    },
    {
      href: "/conventions/module/zone",
      title: "model.Zone.tsx",
      desc: l.trans({
        en: "How a Zone hydrates the store and hands rows to Unit and View.",
        ko: "Zone이 store를 채우고 행을 Unit과 View에 넘기는 방법입니다.",
      }),
    },
    {
      href: "/conventions/module/util",
      title: "model.Util.tsx",
      desc: l.trans({
        en: "One domain action as a control, such as `Remove` or `Publish`.",
        ko: "`Remove`, `Publish`처럼 도메인 동작 하나를 컨트롤로 만든 것입니다.",
      }),
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "CRUD With Less Code", ko: "적은 코드로 CRUD 만들기" })}>
        <Docs.Title>{l.trans({ en: "CRUD With Less Code", ko: "적은 코드로 CRUD 만들기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "CRUD is usually the first screen you build: list records, open one, create one, edit it and remove it. In Akan the store actions and components for all five already exist, so you write the three pieces below and the pages that place them.",
              ko: "CRUD는 보통 가장 먼저 만드는 화면입니다. 목록을 보고, 하나를 열고, 새로 만들고, 고치고, 지웁니다. Akan에는 이 다섯 가지에 쓸 store 액션과 컴포넌트가 이미 있어서, 아래 세 조각과 이를 배치할 page만 직접 쓰면 됩니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "What you write", ko: "직접 쓰는 것" })} items={pieceRows} />
          <div>
            {l.trans({
              en: "Each task maps to the components and generated store actions that do it:",
              ko: "할 일마다 쓰는 컴포넌트와, 자동으로 생기는 store 액션은 다음과 같습니다:",
            })}
          </div>
          <Docs.Table columns={actionColumns} rows={actionRows} stacked />
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="slice" title={l.trans({ en: "Start With A Slice", ko: "Slice부터 시작하기" })}>
        <Docs.Title>{l.trans({ en: "Start With A Slice", ko: "Slice부터 시작하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  A slice is a named window into your model: the list one screen shows. Give it a name that matches the
                  screen, such as <code>inPublic</code>, <code>inAdmin</code> or <code>inProject</code>.
                </span>
              ),
              ko: (
                <span>
                  Slice는 모델을 바라보는 이름 붙은 창, 즉 한 화면이 보여 줄 목록입니다. <code>inPublic</code>,{" "}
                  <code>inAdmin</code>, <code>inProject</code>처럼 화면 목적이 드러나는 이름을 붙이세요.
                </span>
              ),
            })}
          </div>

          <Docs.SubSubTitle>
            {l.trans({ en: "1. Declare the filter", ko: "1. document에 filter 선언하기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  Say what "public" means in the document. Each filter adds a <code>{"query<Name>()"}</code> method to
                  the service:
                </span>
              ),
              ko: (
                <span>
                  "공개"가 무엇인지 document에 적습니다. filter마다 service에 <code>{"query<Name>()"}</code> 메서드가
                  생깁니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/blog/lib/post/post.document.ts"
          code={`import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";

export class PostFilter extends from(cnst.Post, (filter) => ({
  query: {
    inPublic: filter().query(() => ({ status: "published" })),
  },
  sort: {},
})) {}

export class Post extends by(cnst.Post) {}

export class PostModel extends into(Post, PostFilter, cnst.post, () => ({})) {}`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>
            {l.trans({ en: "2. Expose it as a slice", ko: "2. signal에 slice로 내보내기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Then list it in the signal, one key per screen:",
              ko: "그다음 signal에 화면마다 키 하나씩 slice로 적습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/blog/lib/post/post.signal.ts"
          code={`import { Admin } from "@libs/shared/srvkit"; // [!code collapse:5]
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as srv from "../srv";

export class PostInternal extends internal(srv.post, () => ({})) {}

export class PostSlice extends slice(
  srv.post,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    inPublic: init({ guards: [Public] }).exec(function () {
      return this.postService.queryInPublic();
    }),
    inAdmin: init({ guards: [Admin] }).exec(function () {
      return this.postService.queryAny();
    }),
  }),
) {}

export class PostEndpoint extends endpoint(srv.post, () => ({})) {}`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>queryInPublic()</code> comes from the filter.
                    </strong>{" "}
                    <code>queryAny()</code> comes from the <code>any</code> filter every model has.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>queryInPublic()</code>은 filter에서 생깁니다.
                    </strong>{" "}
                    <code>queryAny()</code>는 모든 모델에 있는 <code>any</code> filter에서 생깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Each key names the fetch methods.</strong> <code>inAdmin</code> gives{" "}
                    <code>fetch.initPostInAdmin()</code> and <code>fetch.slice.postInAdmin</code>, which the next steps
                    use.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>키가 fetch 메서드 이름이 됩니다.</strong> <code>inAdmin</code>에서{" "}
                    <code>fetch.initPostInAdmin()</code>과 <code>fetch.slice.postInAdmin</code>이 생기고, 다음 단계에서
                    이것을 씁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Return the query, do not shape it.</strong> Order and page size are fetch options (
                    <code>{"{ sort, page, limit }"}</code>), not <code>.sort()</code> on the query.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>query는 반환만 하고 다듬지 않습니다.</strong> 정렬과 페이지 크기는 query의{" "}
                    <code>.sort()</code>가 아니라 fetch 옵션(<code>{"{ sort, page, limit }"}</code>)으로 정합니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Who may call what", ko: "누가 무엇을 부를 수 있나" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  The <code>guards</code> map covers the generated endpoints, and each named slice brings its own:
                </span>
              ),
              ko: (
                <span>
                  <code>guards</code> 옵션은 자동으로 생기는 endpoint를 지키고, 이름 있는 slice는 자기 guard를 따로
                  가집니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Key", ko: "키" })}
            descLabel={l.trans({ en: "What it guards", ko: "지키는 것" })}
            items={guardRows}
          />
          <Docs.Alert type="warning">
            {l.trans({
              en: (
                <span>
                  <strong>
                    A named slice is guarded only by its own <code>{"init({ guards })"}</code>.
                  </strong>{" "}
                  <code>get</code> and <code>cru</code> never reach it, so <code>inAdmin: init()</code> with no guards
                  serves every post to any caller. <code>None</code> closes an endpoint to everyone.
                </span>
              ),
              ko: (
                <span>
                  <strong>
                    이름 있는 slice는 자기 <code>{"init({ guards })"}</code>로만 지켜집니다.
                  </strong>{" "}
                  <code>get</code>과 <code>cru</code>는 여기에 닿지 않으므로, guard 없는 <code>inAdmin: init()</code>은
                  누가 호출하든 모든 post를 내줍니다. <code>None</code>은 endpoint를 모두에게 닫습니다.
                </span>
              ),
            })}
          </Docs.Alert>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="list" title={l.trans({ en: "List And Open", ko: "목록과 열기" })}>
        <Docs.Title>{l.trans({ en: "List And Open", ko: "목록과 열기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The page loads the first rows on the server. A Zone draws them with <code>Load.Units</code>, and{" "}
                  <code>Model.ViewEditModal</code> beside the list handles the detail view and the edit form.
                </span>
              ),
              ko: (
                <span>
                  page가 목록의 첫 페이지를 서버에서 불러옵니다. Zone이 <code>Load.Units</code>로 목록을 그리고, 목록
                  옆의 <code>Model.ViewEditModal</code>이 상세 보기와 수정 폼을 함께 처리합니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>{l.trans({ en: "1. Load in the page", ko: "1. page에서 불러오기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "The page starts the slice query and hands the promise to the Zone:",
              ko: "page는 slice query를 시작하고 그 promise를 Zone에 넘깁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="tsx"
          title="apps/blog/page/admin/post/_index.tsx"
          code={`import { fetch, Post } from "@apps/blog/client";
import { page } from "akanjs/client";

export default page().render(() => {
  const { postInitInAdmin } = fetch.initPostInAdmin();
  return <Post.Zone.Card init={postInitInAdmin} />;
});`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "2. Draw it in a Zone", ko: "2. Zone에서 그리기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "Each card opens its post, and one modal shows whichever post is open:",
              ko: "카드마다 자기 post를 열고, 모달 하나가 지금 열린 post를 보여 줍니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="tsx"
          title="apps/blog/lib/post/Post.Zone.tsx"
          code={`"use client"; // [!code collapse:4]
import { type cnst, fetch, Post } from "@apps/blog/client";
import type { ClientInit } from "akanjs/fetch";
import { Load, Model } from "akanjs/ui";

interface CardProps {
  className?: string;
  init: ClientInit<"post", cnst.LightPost>;
}
export const Card = ({ className, init }: CardProps) => {
  return (
    <>
      <Load.Units
        className={className}
        init={init}
        renderItem={(post) => (
          <Model.ViewWrapper
            key={post.id}
            slice={fetch.slice.postInAdmin}
            modelId={post.id}
          >
            <Post.Unit.Card post={post} />
          </Model.ViewWrapper>
        )}
      />
      <Model.ViewEditModal
        slice={fetch.slice.postInAdmin}
        renderView={(post) => <Post.View.General post={post} />}
        renderTemplate={() => <Post.Template.General />}
      />
    </>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Why a Zone.</strong> <code>renderItem</code>, <code>renderView</code> and{" "}
                    <code>renderTemplate</code> are functions, and a server page cannot pass a function to a client
                    component.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Zone에 두는 이유.</strong> <code>renderItem</code>, <code>renderView</code>,{" "}
                    <code>renderTemplate</code>은 함수인데, 서버 page는 클라이언트 컴포넌트에 함수를 넘길 수 없습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>One modal serves every card.</strong> <code>Model.ViewWrapper</code> calls{" "}
                    <code>st.do.viewPost(id)</code>, and the modal draws <code>renderView</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모달 하나가 모든 카드를 맡습니다.</strong> <code>Model.ViewWrapper</code>가{" "}
                    <code>st.do.viewPost(id)</code>를 부르면, 모달이 <code>renderView</code>를 그립니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Edit is built in.</strong> The modal's Edit button swaps in <code>renderTemplate</code>, and
                    Save returns to the view. The ⋮ menu holds Remove; <code>{"menu={false}"}</code> hides it.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>수정 기능이 들어 있습니다.</strong> 모달의 편집 버튼을 누르면 <code>renderTemplate</code>
                    으로 바뀌고, 저장하면 상세 보기로 돌아옵니다. ⋮ 메뉴에는 삭제가 있고, <code>{"menu={false}"}</code>
                    로 숨깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>No empty or paging code.</strong> <code>Load.Units</code> shows <code>{"<Empty />"}</code>{" "}
                    when there are no rows and paginates by default.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>빈 목록과 페이지 처리는 필요 없습니다.</strong> <code>Load.Units</code>가 행이 없으면{" "}
                    <code>{"<Empty />"}</code>를 보여 주고, 기본으로 페이지를 나눕니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="create-edit" title={l.trans({ en: "Create And Edit", ko: "생성하고 수정하기" })}>
        <Docs.Title>{l.trans({ en: "Create And Edit", ko: "생성하고 수정하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Use the same Template for create and edit. The shell, the component around the form, prepares{" "}
                  <code>postForm</code> and saves it, so the Template only cares about fields. A form with no id is
                  created, one with an id is updated.
                </span>
              ),
              ko: (
                <span>
                  생성과 수정에는 같은 Template을 씁니다. 폼을 감싸는 셸 컴포넌트가 <code>postForm</code>을 준비하고
                  저장하므로 Template은 필드만 신경 쓰면 됩니다. 폼에 id가 없으면 새로 만들고, 있으면 수정합니다.
                </span>
              ),
            })}
          </div>
          <div>
            {l.trans({
              en: "Pick the shell by where the form should appear:",
              ko: "폼이 나타날 자리에 맞춰 셸을 고릅니다:",
            })}
          </div>
          <Docs.IntroTable
            type={l.trans({ en: "Shell", ko: "셸" })}
            descLabel={l.trans({ en: "Where it goes and what opens it", ko: "두는 곳과 여는 방법" })}
            items={shellRows}
          />

          <Docs.SubSubTitle>{l.trans({ en: "Create page", ko: "생성 page" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "A create page seeds the form with the values a new post starts with:",
              ko: "생성 page는 새 post가 가질 초깃값으로 폼을 채웁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="tsx"
          title="apps/blog/page/admin/post/new.tsx"
          code={`import { type cnst, fetch, Post } from "@apps/blog/client";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page().render(() => {
  const postForm: Partial<cnst.Post> = { status: "draft" };
  return (
    <Load.Edit
      slice={fetch.slice.postInAdmin}
      edit={postForm}
      type="form"
      onSubmit="/admin/post"
    >
      <Post.Template.General />
    </Load.Edit>
  );
});`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "Edit page", ko: "수정 page" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "An edit page loads the record on the server and hands it to the same shell:",
              ko: "수정 page는 레코드를 서버에서 불러와 같은 셸에 넘깁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="tsx"
          title="apps/blog/page/admin/post/[postId]/edit.tsx"
          code={`import { fetch, Post } from "@apps/blog/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("postId", ID)
  .render(({ postId }) => {
    const { postEdit } = fetch.editPost(postId);
    return (
      <Load.Edit
        slice={fetch.slice.postInAdmin}
        edit={postEdit}
        type="form"
        onSubmit="/admin/post"
      >
        <Post.Template.General />
      </Load.Edit>
    );
  });`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>{'type="form"'}</code> draws the form in place
                    </strong>{" "}
                    with its own Save button. The default, <code>"modal"</code>, opens it in a modal.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>{'type="form"'}</code>은 폼을 그 자리에 그립니다.
                    </strong>{" "}
                    저장 버튼도 함께 그리며, 기본값인 <code>"modal"</code>은 폼을 모달로 엽니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>slice</code> names the list a new post joins.
                    </strong>{" "}
                    A create through <code>postInAdmin</code> lands at the top of <code>postListInAdmin</code>; an edit
                    updates every list already loaded.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>slice</code>는 새 post가 들어갈 목록을 정합니다.
                    </strong>{" "}
                    <code>postInAdmin</code>으로 만든 post는 <code>postListInAdmin</code> 맨 위에 들어가고, 수정은 이미
                    불러온 모든 목록에 반영됩니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>onSubmit</code> and <code>onCancel</code> take a path.
                    </strong>{" "}
                    <code>"back"</code> goes back, and <code>[postId]</code> in an <code>onSubmit</code> path becomes
                    the saved post's id.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      <code>onSubmit</code>과 <code>onCancel</code>에는 경로를 넘깁니다.
                    </strong>{" "}
                    <code>"back"</code>은 뒤로 가고, <code>onSubmit</code> 경로 속 <code>[postId]</code>는 저장된 post의
                    id로 바뀝니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>The form survives accidents.</strong> The shell saves the form as the user types and offers
                    it back on the next open. <code>{"draft={false}"}</code> turns that off.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>실수로 닫아도 폼이 남습니다.</strong> 셸은 입력하는 동안 폼을 저장해 두었다가 다음에 열 때
                    되살려 줍니다. <code>{"draft={false}"}</code>로 끕니다.
                  </span>
                ),
              })}
            </li>
          </ul>

          <Docs.SubSubTitle>{l.trans({ en: "Edit in a modal", ko: "모달에서 수정하기" })}</Docs.SubSubTitle>
          <div>
            {l.trans({
              en: (
                <span>
                  To edit without leaving the screen, <code>Model.Edit</code> draws an Edit button and its modal
                  together:
                </span>
              ),
              ko: (
                <span>
                  화면을 떠나지 않고 고치려면, <code>Model.Edit</code>이 편집 버튼과 모달을 함께 그립니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="tsx"
          title="apps/blog/lib/post/Post.Util.tsx"
          code={`"use client";
import { fetch, Post } from "@apps/blog/client";
import { Model } from "akanjs/ui";

interface EditProps {
  postId: string;
}
export const Edit = ({ postId }: EditProps) => {
  return (
    <Model.Edit
      slice={fetch.slice.postInAdmin}
      modelId={postId}
      renderTitle="title"
    >
      <Post.Template.General />
    </Model.Edit>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>A click loads the record.</strong> It calls <code>st.do.editPost(postId)</code>, which fills{" "}
                    <code>postForm</code> and opens the modal.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>누르면 레코드를 불러옵니다.</strong> <code>st.do.editPost(postId)</code>가{" "}
                    <code>postForm</code>을 채우고 모달을 엽니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Button and modal in different places?</strong> <code>Model.Edit</code> is{" "}
                    <code>Model.EditWrapper</code> (the trigger) plus <code>{"Model.EditModal id={postId}"}</code> (the
                    modal). The modal alone opens nothing until <code>editPost</code> runs.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>버튼과 모달을 따로 둬야 하나요?</strong> <code>Model.Edit</code>은{" "}
                    <code>Model.EditWrapper</code>(트리거)와 <code>{"Model.EditModal id={postId}"}</code>(모달)를 합친
                    것입니다. 모달만 두면 <code>editPost</code>가 불리기 전까지 아무것도 열리지 않습니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>
                      <code>Model.New</code> is the create twin.
                    </strong>{" "}
                    Same props minus <code>modelId</code>; <code>partial</code> seeds the new form.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>
                      생성용 짝은 <code>Model.New</code>입니다.
                    </strong>{" "}
                    <code>modelId</code> 대신 <code>partial</code>로 새 폼의 초깃값을 넘깁니다.
                  </span>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="remove" title={l.trans({ en: "Remove In Util", ko: "삭제는 Util에 두기" })}>
        <Docs.Title>{l.trans({ en: "Remove In Util", ko: "삭제는 Util에 두기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Delete buttons usually appear in many places: a card, a detail view, a menu. Put one{" "}
                  <code>Remove</code> in <code>Post.Util.tsx</code>, next to <code>Edit</code>, so the Unit, View and
                  Zone files stay simple:
                </span>
              ),
              ko: (
                <span>
                  삭제 버튼은 카드, 상세 보기, 메뉴처럼 여러 곳에 나타나곤 합니다. <code>Post.Util.tsx</code>의{" "}
                  <code>Edit</code> 옆에 <code>Remove</code> 하나를 두면 Unit, View, Zone 파일이 단순해집니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          language="tsx"
          title="apps/blog/lib/post/Post.Util.tsx"
          code={`"use client";
import { fetch, usePage } from "@apps/blog/client";
import { Model } from "akanjs/ui";

interface RemoveProps {
  postId: string;
}
export const Remove = ({ postId }: RemoveProps) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={postId} slice={fetch.slice.post}>
      {l("base.remove")}
    </Model.Remove>
  );
};`}
        />
        <Docs.Description>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>It asks first.</strong> A click opens a confirm modal; confirming calls{" "}
                    <code>st.do.removePost(postId)</code> and shows a success toast.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>먼저 확인을 받습니다.</strong> 누르면 확인 모달이 열리고, 확인하면{" "}
                    <code>st.do.removePost(postId)</code>가 불린 뒤 성공 토스트가 뜹니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Every list drops the row.</strong> Removal goes by id, so any slice of the model works here;{" "}
                    <code>fetch.slice.post</code> is the root one.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>모든 목록에서 행이 빠집니다.</strong> 삭제는 id로 하므로 이 모델의 어떤 slice를 넘겨도
                    됩니다. <code>fetch.slice.post</code>는 root slice입니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>On a detail page</strong>, <code>{'redirect="back"'}</code> or a path moves away after the
                    removal. <code>name</code> fills the confirm sentence, and <code>title</code>,{" "}
                    <code>description</code>, <code>action</code> replace parts of the modal.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>상세 page라면</strong> <code>{'redirect="back"'}</code>이나 경로를 넘겨, 삭제한 뒤 다른
                    곳으로 이동합니다. <code>name</code>은 확인 문구를 채우고, <code>title</code>,{" "}
                    <code>description</code>, <code>action</code>은 모달의 각 부분을 바꿉니다.
                  </span>
                ),
              })}
            </li>
          </ul>
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
                  <span>
                    <strong>Name slices after screens, not database queries.</strong> <code>inAdmin</code> says who
                    looks at the list, not how it is fetched.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Slice 이름은 DB query가 아니라 화면 목적에 맞춥니다.</strong> <code>inAdmin</code>은 목록을
                    어떻게 가져오는지가 아니라 누가 보는지를 말합니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Keep the Template boring.</strong> It reads <code>postForm</code> and draws fields, with
                    each setter passed by reference: <code>{"onChange={st.do.setTitleOnPost}"}</code>.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>Template은 단순하게 둡니다.</strong> <code>postForm</code>을 읽고 필드를 그리며, setter는{" "}
                    <code>{"onChange={st.do.setTitleOnPost}"}</code>처럼 그대로 넘깁니다.
                  </span>
                ),
              })}
            </li>
            <li>
              {l.trans({
                en: (
                  <span>
                    <strong>Repeated actions go to Util.</strong> Remove, publish, approve or open a dialog: write it
                    once in <code>Post.Util.tsx</code> and place it anywhere.
                  </span>
                ),
                ko: (
                  <span>
                    <strong>반복되는 동작은 Util로 뺍니다.</strong> 삭제, 발행, 승인, 대화상자 열기는{" "}
                    <code>Post.Util.tsx</code>에 한 번 쓰고 어디에든 둡니다.
                  </span>
                ),
              })}
            </li>
          </ul>
          <Docs.SubSubTitle>{l.trans({ en: "Read next", ko: "더 읽기" })}</Docs.SubSubTitle>
          <Docs.LinkGrid items={nextLinks} />
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
