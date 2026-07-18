import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Form From Schema", ko: "Schema에서 form 만들기" })}>
        <Docs.Title>{l.trans({ en: "Form From Schema", ko: "Schema에서 form 만들기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "After the model schema is designed, the form should be a thin UI over that shape. The easiest pattern is: prepare data in the wrapper, draw fields in the Template.",
              ko: "모델 schema가 설계되면 form은 그 모양 위에 얇게 올리는 UI가 됩니다. 가장 쉬운 패턴은 wrapper에서 데이터를 준비하고, Template에서는 field만 그리는 것입니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Server page prepares create defaults or parent ids.",
                ko: "Server page는 생성 기본값이나 parent id를 준비합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Template reads `st.use.articleForm()` and renders fields.",
                ko: "Template은 `st.use.articleForm()`을 읽고 field를 그립니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Modal wrappers handle quick client-side edits.",
                ko: "Modal wrapper는 빠른 클라이언트 수정 흐름을 처리합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="template" title={l.trans({ en: "Keep Template Simple", ko: "Template은 단순하게" })}>
        <Docs.Title>{l.trans({ en: "Keep Template Simple", ko: "Template은 단순하게" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A Template should not decide where the form came from. It only reads the current form state and connects each field to a store setter.",
              ko: "Template은 form이 어디서 왔는지 판단하지 않습니다. 현재 form state를 읽고 각 field를 store setter에 연결하는 일만 담당합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Article template", ko: "Article template" })}
          code={`"use client";

export const General = () => {
  const articleForm = st.use.articleForm();
  const { l } = usePage();

  return (
    <Layout.Template>
      <Field.Text
        label={l("article.title")}
        value={articleForm.title}
        onChange={st.do.setTitleOnArticle}
      />
      <Field.Textarea
        label={l("article.content")}
        value={articleForm.content}
        onChange={st.do.setContentOnArticle}
      />
      <Field.ToggleSelect
        label={l("article.status")}
        value={articleForm.status}
        items={cnst.ArticleStatus}
        onChange={st.do.setStatusOnArticle}
      />
    </Layout.Template>
  );
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="create-page" title={l.trans({ en: "Create With SSR", ko: "SSR로 생성 form 만들기" })}>
        <Docs.Title>{l.trans({ en: "Create With SSR", ko: "SSR로 생성 form 만들기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `Load.Edit` on a server-rendered page when the page already knows default values. This is useful for parent ids, current org, default status, or values from the URL.",
              ko: "페이지가 기본값을 이미 알고 있다면 server-rendered page에서 `Load.Edit`을 사용하세요. parent id, 현재 org, 기본 상태, URL에서 온 값에 유용합니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "New article page", ko: "새 article page" })}
          code={`export default async function Page({ params }: PageProps) {
  const { boardId } = params;
  const board = await fetch.viewBoard(boardId);
  const articleForm: Partial<cnst.Article> = {
    board: board.id,
    status: "draft",
  };

  return (
    <Load.Edit
      slice={fetch.slice.articleInBoard}
      edit={articleForm}
      type="form"
      onCancel="back"
      onSubmit={\`/board/\${board.id}\`}
    >
      <Article.Template.General />
    </Load.Edit>
  );
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="update-page" title={l.trans({ en: "Update Page", ko: "수정 page" })}>
        <Docs.Title>{l.trans({ en: "Update Page", ko: "수정 page" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "For a full edit page, fetch the model on the server and pass it to `Load.Edit`. The Template can stay exactly the same as create.",
              ko: "별도 수정 page가 필요하다면 서버에서 model을 조회해 `Load.Edit`에 넘기세요. Template은 생성 때와 그대로 재사용할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Edit article page", ko: "Article 수정 page" })}
          code={`export default async function Page({ params }: PageProps) {
  const articleEdit = await fetch.editArticle(params.articleId);

  return (
    <Load.Edit
      slice={fetch.slice.articleInBoard}
      edit={articleEdit}
      type="form"
      onSubmit={\`/article/\${article.id}\`}
    >
      <Article.Template.General />
    </Load.Edit>
  );
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="client-modal" title={l.trans({ en: "Client Modal Edit", ko: "클라이언트 modal 수정" })}>
        <Docs.Title>{l.trans({ en: "Client Modal Edit", ko: "클라이언트 modal 수정" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "When the user is already looking at a list or detail card, editing in a modal is often faster than moving to a new page.",
              ko: "사용자가 이미 목록이나 상세 카드를 보고 있다면 새 page로 이동하는 것보다 modal에서 수정하는 편이 더 빠를 때가 많습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Edit current item", ko: "현재 항목 수정" })}
          code={`<Model.EditModal id={article.id} type="form" slice={fetch.slice.articleInBoard}>
  <Article.Template.General />
</Model.EditModal>`}
        />
        <Code.Snippet
          title={l.trans({ en: "View and edit modal", ko: "보기와 수정 modal" })}
          code={`<Model.ViewEditModal
  slice={fetch.slice.articleInPublic}
  renderView={(article) => <Article.View.General article={article} />}
  renderTemplate={() => <Article.Template.General />}
/>`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Reuse one Template for create, update page, and edit modal.",
                ko: "생성, 수정 page, edit modal에서 하나의 Template을 재사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Do not ask the user to choose hidden values such as parent id. Prepare them on the server.",
                ko: "parent id처럼 숨겨진 값은 사용자에게 고르게 하지 말고 서버에서 준비하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use `onSubmit` for normal page movement and `submitOption` for special submit paths such as `self`.",
                ko: "일반 이동은 `onSubmit`, `self` 같은 특수 submit path는 `submitOption`을 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "If field logic grows, split small field groups, but keep the form owner as the Template.",
                ko: "Field 로직이 커지면 작은 field group으로 나누되, form의 주인은 Template으로 유지하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
