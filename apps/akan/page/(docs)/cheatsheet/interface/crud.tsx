import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "CRUD With Less Code", ko: "적은 코드로 CRUD 만들기" })}>
        <Docs.Title>{l.trans({ en: "CRUD With Less Code", ko: "적은 코드로 CRUD 만들기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "CRUD is usually the first screen you build: list items, open one item, create a new one, edit it, and remove it. In Akan, most of that work is already prepared around a model slice.",
              ko: "CRUD는 보통 가장 먼저 만드는 화면입니다. 목록을 보고, 하나를 열고, 새로 만들고, 수정하고, 삭제합니다. Akan에서는 이런 작업 대부분이 model slice 주변에 이미 준비되어 있습니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Slice decides which records this screen can read and edit.",
                ko: "Slice는 이 화면이 어떤 데이터를 읽고 수정할 수 있는지 정합니다.",
              })}
            </li>
            <li>{l.trans({ en: "Template draws the form fields.", ko: "Template은 form field를 그립니다." })}</li>
            <li>
              {l.trans({
                en: "Load and Model components connect the slice to UI behavior.",
                ko: "Load와 Model component는 slice를 UI 동작에 연결합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="slice" title={l.trans({ en: "Start With A Slice", ko: "Slice부터 시작하기" })}>
        <Docs.Title>{l.trans({ en: "Start With A Slice", ko: "Slice부터 시작하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A slice is a named window into your model. Give it a name that matches the screen, such as `inPublic`, `inAdmin`, or `inProject`.",
              ko: "Slice는 model을 바라보는 이름 붙은 창입니다. `inPublic`, `inAdmin`, `inProject`처럼 화면 목적이 드러나는 이름을 붙이세요.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Post slice", ko: "Post slice" })}
          code={`export class PostSlice extends slice(
  srv.post,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    inPublic: init().exec(function () {
      return this.postService.queryPublishedPosts();
    }),
  }),
) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="list" title={l.trans({ en: "List And Open", ko: "목록과 열기" })}>
        <Docs.Title>{l.trans({ en: "List And Open", ko: "목록과 열기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`Load.Units` renders the list. `Model.ViewEditModal` can live next to the list and handle detail view plus edit modal behavior.",
              ko: "`Load.Units`는 목록을 그립니다. `Model.ViewEditModal`을 목록 옆에 두면 상세 보기와 수정 modal 흐름을 함께 처리할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Post list zone", ko: "Post list zone" })}
          code={`export const PublicPosts = ({ init }) => {
  return (
    <>
      <Load.Units
        init={init}
        renderItem={(post) => <Post.Unit.Card key={post.id} post={post} />}
      />
      <Model.ViewEditModal
        slice={fetch.slice.postInPublic}
        renderView={(post) => <Post.View.General post={post} />}
        renderTemplate={() => <Post.Template.General />}
      />
    </>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="create-edit" title={l.trans({ en: "Create And Edit", ko: "생성하고 수정하기" })}>
        <Docs.Title>{l.trans({ en: "Create And Edit", ko: "생성하고 수정하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use the same Template for create and update. The wrapper prepares the form state, and the Template only cares about fields.",
              ko: "생성과 수정에는 같은 Template을 재사용하세요. wrapper가 form state를 준비하고, Template은 field만 신경 쓰면 됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Create page", ko: "생성 page" })}
          code={`<Load.Edit
  slice={fetch.slice.postInAdmin}
  edit={{ status: "draft" }}
  type="form"
  onSubmit="/posts"
>
  <Post.Template.General />
</Load.Edit>`}
        />
        <Code.Snippet
          title={l.trans({ en: "Edit modal", ko: "수정 modal" })}
          code={`<Model.EditModal id={post.id} slice={fetch.slice.postInAdmin} type="form">
  <Post.Template.General />
</Model.EditModal>`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="remove" title={l.trans({ en: "Remove In Util", ko: "삭제는 Util에 두기" })}>
        <Docs.Title>{l.trans({ en: "Remove In Util", ko: "삭제는 Util에 두기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Delete buttons usually appear in many places. Put them in `Post.Util.tsx` so Unit, View, and Zone files stay simple.",
              ko: "삭제 버튼은 여러 곳에 나타나는 경우가 많습니다. `Post.Util.tsx`에 두면 Unit, View, Zone 파일이 단순해집니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Remove helper", ko: "삭제 helper" })}
          code={`export const Remove = ({ postId }: { postId: string }) => {
  const { l } = usePage();
  return (
    <Model.Remove modelId={postId} slice={fetch.slice.post}>
      {l("base.remove")}
    </Model.Remove>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Name slices after screens, not database queries.",
                ko: "Slice 이름은 DB query보다 화면 목적에 맞춰 짓는 것이 좋습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Keep Template boring. It should mostly read form state and render fields.",
                ko: "Template은 단순하게 유지하세요. 대부분 form state를 읽고 field를 그리면 됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use Util components for repeated actions such as remove, publish, approve, or open dialog.",
                ko: "삭제, 발행, 승인, dialog 열기처럼 반복되는 동작은 Util component로 빼세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
