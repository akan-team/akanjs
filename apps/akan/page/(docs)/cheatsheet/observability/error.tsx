import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="overview" title={l.trans({ en: "Error Handling", ko: "에러 처리" })}>
        <Docs.Title>{l.trans({ en: "Error Handling", ko: "에러 처리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan errors are built around one simple rule: server code throws a typed dictionary key, and the client shows the translated message for that key.",
              ko: "Akan의 에러 처리는 단순한 규칙 하나로 시작합니다. 서버 코드는 타입 안전한 dictionary key를 던지고, 클라이언트는 그 key를 번역해서 보여줍니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Declare user-facing errors in the module dictionary.",
                ko: "사용자에게 보여줄 에러는 module dictionary에 선언합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Throw `Err` from document or service code when a business rule fails.",
                ko: "비즈니스 규칙이 실패하면 document나 service 코드에서 `Err`를 던집니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Let fetch restore the response as an `Err`, then show it with `msg.error()`.",
                ko: "fetch가 응답을 `Err`로 복원하게 두고, UI에서는 `msg.error()`로 보여줍니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="declare-errors" title={l.trans({ en: "Declare Errors", ko: "에러 선언하기" })}>
        <Docs.Title>{l.trans({ en: "Declare Errors", ko: "에러 선언하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start in the dictionary. The keys you declare here become the only valid keys for `Err`, so typo mistakes are caught by TypeScript.",
              ko: "먼저 dictionary에서 시작합니다. 여기서 선언한 key만 `Err`에 넣을 수 있으므로 오타는 TypeScript가 잡아줍니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="order.dictionary.ts"
          code={`export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Order", "주문"]).desc(["Order description", "주문 설명"]))
  .error({
    notDraft: ["Only draft orders can be edited", "초안 주문만 수정할 수 있습니다."],
    productNotFound: ["Product not found", "상품을 찾을 수 없습니다."],
    stockNotEnough: [
      "{productName} needs {quantity} items",
      "{productName} 재고가 {quantity}개 필요합니다.",
    ],
  });`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="throw-err" title={l.trans({ en: "Throw Err", ko: "Err 던지기" })}>
        <Docs.Title>{l.trans({ en: "Throw Err", ko: "Err 던지기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Use `Err` for business rules that users can understand and fix. A document method is a good place for state rules because every service shares the same rule.",
              ko: "사용자가 이해하고 해결할 수 있는 비즈니스 규칙에는 `Err`를 사용합니다. 상태 규칙은 모든 service가 같은 규칙을 쓰도록 document method에 두기 좋습니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="order.document.ts"
          code={`import { Err } from "../dict";

export class Order extends by(cnst.Order) {
  editTitle(title: string) {
    if (this.status !== "draft") throw new Err("order.error.notDraft");
    this.title = title;
    return this;
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="choose-status" title={l.trans({ en: "Choose Status", ko: "상태 코드 고르기" })}>
        <Docs.Title>{l.trans({ en: "Choose Status", ko: "상태 코드 고르기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "`new Err()` uses 400 by default. When the HTTP meaning matters, pick a named helper. This keeps API responses clear without making every rule verbose.",
              ko: "`new Err()`는 기본으로 400을 사용합니다. HTTP 의미가 중요할 때만 이름 있는 helper를 고르세요. 이렇게 하면 모든 규칙을 장황하게 만들지 않으면서 응답 의미를 분명히 할 수 있습니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "`Err.NotFound`: a requested record does not exist.",
                ko: "`Err.NotFound`: 요청한 record가 없습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`Err.Conflict`: the current state cannot accept this action.",
                ko: "`Err.Conflict`: 현재 상태에서는 이 동작을 받을 수 없습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "`Err.Forbidden`: the user is known but may not do this action.",
                ko: "`Err.Forbidden`: 사용자는 확인됐지만 이 동작을 할 수 없습니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title="order.service.ts"
          code={`async addItem(orderId: string, productId: string, quantity: number) {
  const order = await this.getOrder(orderId);
  if (order.status !== "draft") throw new Err.Conflict("order.error.notDraft");

  const product = await this.productService.loadProduct(productId);
  if (!product) throw new Err.NotFound("order.error.productNotFound");

  return await order.addItem(product, quantity).save();
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="use-data" title={l.trans({ en: "Use Data", ko: "Data 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Use Data", ko: "Data 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Pass `data` when the translated message needs values. The server keeps the dictionary key as `error`, and sends `data` beside it for interpolation.",
              ko: "번역 메시지에 값이 필요하면 `data`를 넘깁니다. 서버는 dictionary key를 `error`로 유지하고, 치환에 쓸 값을 `data`로 함께 보냅니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="order.document.ts"
          code={`addItem(product: Product, quantity: number) {
  if (product.stock < quantity) {
    throw new Err("order.error.stockNotEnough", {
      productName: product.name,
      quantity,
    });
  }

  this.items = [...this.items, { product: product.id, quantity }];
  return this;
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="client-handling" title={l.trans({ en: "Client Handling", ko: "클라이언트 처리" })}>
        <Docs.Title>{l.trans({ en: "Client Handling", ko: "클라이언트 처리" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Akan fetch restores an error response as `Err`. In UI code, catch it and pass its key and data to `msg.error()`.",
              ko: "Akan fetch는 에러 응답을 `Err`로 복원합니다. UI 코드에서는 catch한 뒤 key와 data를 `msg.error()`에 넘기면 됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Order.Util.tsx"
          code={`import { Err, fetch, msg } from "@apps/myApp/client";

export const AddOrderItem = ({ orderId, productId }: Props) => {
  const addItem = async () => {
    try {
      await fetch.addItem(orderId, productId, 3);
      msg.success("order.addItemSuccess");
    } catch (error) {
      if (error instanceof Err) {
        msg.error(error.error, { data: error.data });
        return;
      }
      msg.error("order.error.unknown");
    }
  };

  return <button onClick={addItem}>Add item</button>;
};`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="response-shape" title={l.trans({ en: "Response Shape", ko: "응답 형태" })}>
        <Docs.Title>{l.trans({ en: "Response Shape", ko: "응답 형태" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "HTTP and websocket errors use the same simple shape. Most app code does not need to build this by hand, but knowing it makes debugging easier.",
              ko: "HTTP와 websocket 에러는 같은 단순한 형태를 사용합니다. 앱 코드에서 직접 만들 필요는 거의 없지만, 알아두면 디버깅이 쉬워집니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Error response"
          code={`{
  "error": "order.error.stockNotEnough",
  "statusCode": 400,
  "data": {
    "productName": "Yogurt Icecream",
    "quantity": 3
  },
  "path": "/order/addItem",
  "timestamp": "2026-05-25T00:00:00.000Z"
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Use `Err` for user-facing domain failures. Use normal `Error` for programmer mistakes, missing setup, or impossible states.",
                ko: "사용자에게 보여줄 도메인 실패에는 `Err`를 사용하세요. 개발 실수, 설정 누락, 일어나면 안 되는 상태에는 일반 `Error`를 사용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Put repeated state rules in document methods. Put cross-model checks and loading logic in services.",
                ko: "반복되는 상태 규칙은 document method에 두세요. 여러 모델을 읽거나 비교하는 로직은 service에 둡니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Name keys by domain and reason: `order.error.notDraft`, `order.error.stockNotEnough`, `user.error.wrongPassword`.",
                ko: "key는 도메인과 이유가 보이게 지으세요. 예: `order.error.notDraft`, `order.error.stockNotEnough`, `user.error.wrongPassword`.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Do not translate on the server. Send the key and data, then let the client choose the user's language.",
                ko: "서버에서 번역하지 마세요. key와 data를 보내고, 클라이언트가 사용자의 언어로 번역하게 둡니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
