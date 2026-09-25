import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Endpoint Actions", ko: "Endpoint action" })}>
        <Docs.Title>{l.trans({ en: "Endpoint Actions", ko: "Endpoint action" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "CRUD handles the common actions. Endpoint is for one clear business action, such as publish, approve, reject, archive, or send notification.",
              ko: "CRUD는 기본 동작을 처리합니다. Endpoint는 발행, 승인, 거절, 보관, 알림 발송처럼 분명한 업무 동작 하나를 만들 때 사용합니다.",
            })}
          </div>
          <div>
            {l.trans({
              en: "A good rule is: one button action, one store action, one endpoint, one service method.",
              ko: "좋은 규칙은 이것입니다. 버튼 동작 하나, store action 하나, endpoint 하나, service method 하나로 맞추세요.",
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="flow" title={l.trans({ en: "The Flow", ko: "흐름 이해하기" })}>
        <Docs.Title>{l.trans({ en: "The Flow", ko: "흐름 이해하기" })}</Docs.Title>
        <Docs.Description>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              {l.trans({
                en: "User clicks a button in a Util component.",
                ko: "사용자가 Util component의 버튼을 클릭합니다.",
              })}
            </li>
            <li>{l.trans({ en: "The button calls a store action.", ko: "버튼은 store action을 호출합니다." })}</li>
            <li>
              {l.trans({
                en: "The store action calls the generated fetch endpoint.",
                ko: "Store action은 생성된 fetch endpoint를 호출합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "The endpoint delegates real work to the service.",
                ko: "Endpoint는 실제 일을 service에 맡깁니다.",
              })}
            </li>
          </ol>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Button to service", ko: "버튼에서 service까지" })}
          code={`Post.Util.PublishButton
  -> st.do.publishPost(postId)
  -> fetch.publishPost(postId)
  -> postService.publishPost(postId)`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="endpoint" title={l.trans({ en: "Declare Endpoint", ko: "Endpoint 선언" })}>
        <Docs.Title>{l.trans({ en: "Declare Endpoint", ko: "Endpoint 선언" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Keep the endpoint thin. It receives parameters, checks guards if needed, and calls the service method.",
              ko: "Endpoint는 얇게 유지하세요. 필요한 값을 받고, guard를 확인하고, service method를 호출하면 됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Publish endpoint", ko: "발행 endpoint" })}
          code={`export class PostEndpoint extends endpoint(srv.post, ({ mutation }) => ({
  publishPost: mutation(cnst.Post)
    .param("postId", ID)
    .exec(async function (postId) {
      return await this.postService.publishPost(postId);
    }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="service" title={l.trans({ en: "Put Rules In Service", ko: "규칙은 service에 두기" })}>
        <Docs.Title>{l.trans({ en: "Put Rules In Service", ko: "규칙은 service에 두기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The service is where you write business rules. For example, a post can be published only when it has a title and content.",
              ko: "Service는 업무 규칙을 쓰는 곳입니다. 예를 들어 게시글은 제목과 내용이 있을 때만 발행할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Service method", ko: "Service method" })}
          code={`export class PostService extends serve(db.post, () => ({})) {
  async publishPost(postId: string) {
    const post = await this.getPost(postId);
    if (!post.title || !post.content) throw new Error("Post is not ready");
    return await post.set({ status: "published" }).save();
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="store" title={l.trans({ en: "Call It From Store", ko: "Store에서 호출하기" })}>
        <Docs.Title>{l.trans({ en: "Call It From Store", ko: "Store에서 호출하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Store actions make the UI code short. They can call fetch, show a message, close a modal, or refresh data after the endpoint succeeds.",
              ko: "Store action을 두면 UI 코드가 짧아집니다. Endpoint 성공 후 fetch 호출, 메시지 표시, modal 닫기, 데이터 갱신을 함께 처리할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Store action", ko: "Store action" })}
          code={`export class PostStore extends store(sig.post, () => ({})) {
  async publishPost(postId: string) {
    const post = await fetch.publishPost(postId);
    msg.success("post.publishSuccess");
    this.setPost(post);
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="util" title={l.trans({ en: "Make One Util", ko: "Util 하나로 만들기" })}>
        <Docs.Title>{l.trans({ en: "Make One Util", ko: "Util 하나로 만들기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Put the button in `Post.Util.tsx`. Then every card, detail page, or admin page can reuse the same action.",
              ko: "버튼은 `Post.Util.tsx`에 두세요. 그러면 카드, 상세 페이지, 관리자 페이지 어디서든 같은 action을 재사용할 수 있습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title={l.trans({ en: "Publish button", ko: "발행 버튼" })}
          code={`"use client";
interface PublishProps {
  className?: string;
  postId: string;
}

export const Publish = ({ postId }: PublishProps) => {
  const { l } = usePage();
  return (
    <button className={clsx("btn btn-primary", className)} onClick={() => st.do.publishPost(postId)}>
      {l("post.signal.publishPost")}
    </button>
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
                en: "Use endpoint names as verbs: `publishPost`, `approveTicket`, `archiveProject`.",
                ko: "Endpoint 이름은 `publishPost`, `approveTicket`, `archiveProject`처럼 동사로 시작하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Do not put business rules in the button. Put them in the service.",
                ko: "업무 규칙은 버튼에 두지 말고 service에 두세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "If the same action appears twice, make a Util component before copying the button.",
                ko: "같은 action이 두 번 보이면 버튼을 복사하기 전에 Util component로 만드세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
