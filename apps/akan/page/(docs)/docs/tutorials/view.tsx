import { usePage } from "@apps/akan/client";
import { Code, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();
  return (
    <Scroll>
      <Scroll.Slide id="show-details" title={l.trans({ en: "Show Details", ko: "상세하게 보여주기" })}>
        <Docs.Title>{l.trans({ en: "Show Details", ko: "상세하게 보여주기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `A Unit card renders the light model: just enough to tell orders apart. A detailed view is what opens when a customer taps one — the exact size, every topping, the order time, and whether it is ready.`,
              ko: `Unit 카드는 light model을 렌더링하며 주문을 구분할 수 있을 만큼만 보여줍니다. 상세 뷰는 고객이 주문을 눌렀을 때 열리는 화면으로, 정확한 크기와 추가한 토핑, 주문 시각, 준비 여부를 모두 보여줍니다.`,
            })}
          </div>
          <div>
            {l.trans({
              en: `In Akan.js, three components work together to build a detailed view:`,
              ko: `Akan.js에서는 세 가지 컴포넌트가 함께 상세 뷰를 만듭니다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">ViewWrapper (Util.tsx)</strong>
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `A clickable wrapper that triggers the view modal when clicked. Think of it as the "View Details" button functionality.`,
                  ko: `클릭하면 뷰 모달을 트리거하는 클릭 가능한 래퍼입니다. "상세보기" 버튼 기능이라고 생각하면 됩니다.`,
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">ViewModal (Model component)</strong>
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `A modal popup that displays when customers want to see details. It handles opening, closing, and data loading automatically.`,
                  ko: `고객이 세부사항을 보고 싶을 때 표시되는 모달 팝업입니다. 열기, 닫기, 데이터 로딩을 자동으로 처리합니다.`,
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">Detail View (View.tsx)</strong>
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `The actual content inside the modal, showing all the order information in an organized layout.`,
                  ko: `모달 안의 실제 내용으로, 모든 주문 정보를 체계적으로 표시합니다.`,
                })}
              </div>
            </div>
          </div>
          <div>
            {l.trans({
              en: `This separation allows each component to have a single responsibility: the wrapper handles clicking, the modal handles the popup behavior, and the view handles the display formatting.`,
              ko: `이러한 분리는 각 컴포넌트가 단일 책임을 갖도록 합니다: 래퍼는 클릭을 처리하고, 모달은 팝업 동작을 처리하며, 뷰는 표시 형식을 처리합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide id="view-wrapper" title={l.trans({ en: "Add View Modal", ko: "보기 모달 추가하기" })}>
        <Docs.Title>{l.trans({ en: "Add View Modal", ko: "보기 모달 추가하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's add a view modal to our ice cream order page. This creates a popup window where customers can see all their order details in an organized format. The modal functions like a detailed receipt that appears when customers want to review their order information.`,
              ko: `이제 아이스크림 주문 페이지에 보기 모달을 추가해봅시다. 이것은 고객들이 모든 주문 세부사항을 체계적인 형식으로 볼 수 있는 팝업 창을 생성합니다. 모달은 고객이 주문 정보를 검토하고 싶을 때 나타나는 상세 영수증처럼 기능합니다.`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Zone.tsx"
            code={`
"use client"; // [!code collapse:5]
import { type cnst, fetch, IcecreamOrder } from "@apps/koyo/client";
import type { ClientInit, ClientView, SliceMeta } from "akanjs/fetch";
import { Load, Model } from "akanjs/ui";
import { Fragment } from "react";

interface CardProps {
  className?: string;
  init: ClientInit<"icecreamOrder", cnst.LightIcecreamOrder>;
  slice?: SliceMeta;
}
export const Card = ({ className, init, slice = fetch.slice.icecreamOrder }: CardProps) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(icecreamOrder: cnst.LightIcecreamOrder) => (
        <Fragment key={icecreamOrder.id}>
          <IcecreamOrder.Unit.Card icecreamOrder={icecreamOrder} />
          <Model.ViewModal
            id={icecreamOrder.id}
            slice={slice}
            renderTitle={(icecreamOrder: cnst.IcecreamOrder) => \`IcecreamOrder - \${icecreamOrder.id}\`}
            renderView={(icecreamOrder: cnst.IcecreamOrder) => (
              <IcecreamOrder.View.General className="w-full" icecreamOrder={icecreamOrder} />
            )}
          />
        </Fragment>
      )}
    />
  );
};

interface ViewProps { // [!code collapse:12]
  className?: string;
  view: ClientView<"icecreamOrder", cnst.IcecreamOrder>;
}
export const View = ({ view }: ViewProps) => {
  return (
    <Load.View
      view={view}
      renderView={(icecreamOrder) => <IcecreamOrder.View.General icecreamOrder={icecreamOrder} />}
    />
  );
};
`}
          />
          <div>
            {l.trans({
              en: `This code renders each order as a card with its own view modal. Let's examine what each part does:`,
              ko: `이 코드는 각 주문을 카드로 렌더링하고, 주문마다 보기 모달을 붙입니다. 각 부분이 무엇을 하는지 살펴봅시다:`,
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              <strong>{l.trans({ en: "Load.Units Component", ko: "Load.Units 컴포넌트" })}</strong>:{" "}
              {l.trans({
                en: "Renders every order as a Unit card in a list, each showing basic order information",
                ko: "모든 주문을 Unit 카드로 목록에 렌더링하며, 각 카드는 기본 주문 정보를 표시합니다",
              })}
            </li>
            <li>
              <strong>{l.trans({ en: "Model.ViewModal", ko: "Model.ViewModal" })}</strong>:{" "}
              {l.trans({
                en: "The modal popup for one order, opened when its View button is clicked. The id prop tells it which order it belongs to, and it loads that order's data automatically",
                ko: "주문 하나의 모달 팝업으로, 그 주문의 보기 버튼을 누르면 열립니다. id prop으로 어느 주문의 모달인지 알려주면 주문 데이터를 자동으로 불러옵니다",
              })}
            </li>
          </ul>
          <div>
            {l.trans({
              en: `The ViewModal component handles opening, closing, data loading, and content display automatically. Model.ViewEditModal adds Edit and Remove for the verbs a signal opens; ours opens only creation, so ViewModal is all we need.`,
              ko: `ViewModal 컴포넌트는 열기, 닫기, 데이터 로딩, 콘텐츠 표시를 자동으로 처리합니다. Model.ViewEditModal은 signal이 연 동작에 맞춰 수정·삭제 버튼을 붙이는데, 우리 signal은 생성만 열어두었으므로 ViewModal이면 충분합니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide
        id="button-on-unit"
        title={l.trans({ en: "Add View Button to Unit Cards", ko: "Unit 카드에 뷰 버튼 추가하기" })}
      >
        <Docs.Title>{l.trans({ en: "Add View Button to Unit Cards", ko: "Unit 카드에 뷰 버튼 추가하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's add a "View" button to each order's Unit card. This button provides a clear interface element that customers can click to access detailed order information. The button will be positioned and styled to integrate with the existing Unit card design.`,
              ko: `이제 각 주문의 Unit 카드에 "보기" 버튼을 추가해봅시다. 이 버튼은 고객이 상세한 주문 정보에 접근하기 위해 클릭할 수 있는 명확한 인터페이스 요소를 제공합니다. 버튼은 기존 Unit 카드 디자인과 통합되도록 배치되고 스타일링됩니다.`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.Unit.tsx"
            code={`
import { type cnst, fetch, usePage } from "@apps/koyo/client"; // [!code collapse:2]
import { cn, type ModelProps } from "akanjs/client";
import { buttonRecipe, Model } from "akanjs/ui"; // [!code ++]

export const Card = ({ icecreamOrder }: ModelProps<"icecreamOrder", cnst.LightIcecreamOrder>) => {
  const { l } = usePage();
  return (
    <div className="group flex w-full flex-wrap justify-between gap-2 overflow-hidden rounded-xl bg-linear-to-br from-background via-muted to-border px-8 py-6 shadow-md transition-all duration-300 hover:shadow-xl">
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <span className="inline-block rounded bg-muted px-2 py-1 font-bold text-xs uppercase tracking-wider">
            {l("icecreamOrder.id")}
          </span>
          <span className="ml-2 font-mono text-primary">#{icecreamOrder.id.slice(-4)}</span> // [!code ++]
        </div>
        <div className="mt-4 flex items-center gap-2"> // [!code collapse:17]
          <span className="inline-block rounded border border-border bg-background px-2 py-1 font-bold text-primary text-xs uppercase tracking-wider">
            {l("icecreamOrder.status")}
          </span>
          <span
            className={cn(
              "ml-2 rounded-full px-3 py-1 font-semibold text-sm",
              icecreamOrder.status === "active" && "border border-primary/40 bg-background text-primary",
              icecreamOrder.status === "processing" && "border border-warning/40 bg-background text-warning",
              icecreamOrder.status === "served" && "border border-info/40 bg-info text-info-foreground",
              icecreamOrder.status === "finished" && "border border-accent/40 bg-background text-accent",
              icecreamOrder.status === "canceled" && "border border-border bg-background text-foreground/70",
            )}
          >
            {l(\`icecreamOrderStatus.\${icecreamOrder.status}\`)}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 rounded-xl bg-background p-4"> // [!code ++:7]
        <Model.ViewWrapper slice={fetch.slice.icecreamOrder} modelId={icecreamOrder.id}>
          <button className={buttonRecipe({ variant: "primary" })}>
            <span>{l.trans({ en: "View", ko: "보기" })}</span>
          </button>
        </Model.ViewWrapper>
      </div>
    </div>
  );
};`}
          />
          <div>
            {l.trans({
              en: `The key addition here is the ViewWrapper around the button:`,
              ko: `여기서 핵심 추가사항은 버튼 주변의 ViewWrapper입니다:`,
            })}
          </div>
          <ul className="my-4 list-disc space-y-2 pl-5">
            <li>
              <strong>Model.ViewWrapper</strong>:{" "}
              {l.trans({
                en: "This wraps our button and handles the click functionality to show the detailed view",
                ko: "이것은 버튼을 감싸고 상세 뷰를 보여주는 클릭 기능을 처리합니다",
              })}
            </li>
            <li>
              <strong>slice and modelId props</strong>:{" "}
              {l.trans({
                en: "We pass the slice and modelId so the modal knows which order to display details for",
                ko: "slice와 modelId를 전달하여 모달이 어떤 주문의 세부사항을 표시할지 알 수 있도록 합니다",
              })}
            </li>
            <li>
              <strong>Button styling</strong>:{" "}
              {l.trans({
                en: "The button uses the buttonRecipe primary variant for consistent styling across the app",
                ko: "버튼은 앱 전체에서 일관된 스타일링을 위해 buttonRecipe의 primary variant를 사용합니다",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide id="design-detail-view" title={l.trans({ en: "Design Detail View", ko: "상세 뷰 디자인하기" })}>
        <Docs.Title>{l.trans({ en: "Design Detail View", ko: "상세 뷰 디자인하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Now let's create the detailed view component in View.tsx that displays all the ice cream order information in a structured layout. This component will organize and present the order data in a readable format when the modal opens.`,
              ko: `이제 View.tsx에서 모든 아이스크림 주문 정보를 구조화된 레이아웃으로 표시하는 상세 뷰 컴포넌트를 만들어봅시다. 이 컴포넌트는 모달이 열릴 때 주문 데이터를 읽기 쉬운 형식으로 구성하고 표시합니다.`,
            })}
          </div>
          <Code.Snippet
            className="w-full"
            title="apps/koyo/lib/icecreamOrder/IcecreamOrder.View.tsx"
            code={`
import { type cnst, usePage } from "@apps/koyo/client"; // [!code collapse:8]
import { cn } from "akanjs/client";

interface GeneralProps {
  className?: string;
  icecreamOrder: cnst.IcecreamOrder;
}

export const General = ({ className, icecreamOrder }: GeneralProps) => {
  const { l } = usePage();
  return (
    <div className={cn(className, "mx-auto w-full space-y-6 rounded-xl p-8 shadow-lg")}>
      <div className="flex items-center gap-3 border-b pb-4">
        <span className="font-extrabold text-3xl text-primary">🍦</span>
        <span className="font-bold text-2xl">{l("icecreamOrder.modelName")}</span>
        <span className="ml-auto text-foreground/50 text-xs">#{icecreamOrder.id}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.size")}</div>
        <div>{icecreamOrder.size} cc</div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.toppings")}</div>
        <div className="flex flex-wrap gap-2">
          {icecreamOrder.toppings.length === 0 ? (
            <span className="text-foreground/70 italic">{l.trans({ en: "No toppings", ko: "토핑 없음" })}</span>
          ) : (
            icecreamOrder.toppings.map((topping) => (
              <span
                key={topping}
                className="inline-block rounded-full bg-background px-2 py-1 font-medium text-primary text-xs"
              >
                {l(\`topping.\${topping}\`)}
              </span>
            ))
          )}
        </div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.status")}</div>
        <div>
          <span
            className={cn(
              "inline-block rounded-full px-2 py-1 font-semibold text-xs",
              icecreamOrder.status === "active" && "border border-primary/40 bg-background text-primary",
              icecreamOrder.status === "processing" && "border border-warning/40 bg-background text-warning",
              icecreamOrder.status === "served" && "border border-info/40 bg-info text-info-foreground",
              icecreamOrder.status === "finished" && "border border-accent/40 bg-background text-accent",
              icecreamOrder.status === "canceled" && "border border-border bg-background text-foreground/70",
            )}
          >
            {l(\`icecreamOrderStatus.\${icecreamOrder.status}\`)}
          </span>
        </div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.createdAt")}</div>
        <div className="text-foreground/70">{icecreamOrder.createdAt.format("YYYY-MM-DD HH:mm:ss")}</div>
        <div className="font-semibold text-foreground/50">{l("icecreamOrder.updatedAt")}</div>
        <div className="text-foreground/70">{icecreamOrder.updatedAt.format("YYYY-MM-DD HH:mm:ss")}</div>
      </div>
    </div>
  );
};`}
          />
          <div>
            {l.trans({
              en: `This detailed view component creates a comprehensive display of the ice cream order:`,
              ko: `이 상세 뷰 컴포넌트는 아이스크림 주문의 포괄적인 표시를 생성합니다:`,
            })}
          </div>
          <div className="my-4 space-y-3">
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">{l.trans({ en: "Header Section", ko: "헤더 섹션" })}</strong>
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `Shows an ice cream emoji, the order title from dictionary, and the order ID number for reference`,
                  ko: `아이스크림 이모지, dictionary의 주문 제목, 참조용 주문 ID 번호를 보여줍니다`,
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">{l.trans({ en: "Grid Layout", ko: "그리드 레이아웃" })}</strong>
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `Uses a 2-column grid to organize field labels and values in a clean, scannable format`,
                  ko: `2열 그리드를 사용하여 필드 레이블과 값을 깔끔하고 읽기 쉬운 형식으로 구성합니다`,
                })}
              </div>
            </div>
            <div className={panelRecipe({ radius: "lg", padding: "sm" })}>
              <div className="mb-2">
                <strong className="text-primary">{l.trans({ en: "Visual Elements", ko: "시각적 요소" })}</strong>
              </div>
              <div className="text-foreground/70 text-sm">
                {l.trans({
                  en: `Toppings display as colored badges, status shows with conditional styling, and timestamps are formatted for readability`,
                  ko: `토핑은 색상 배지로 표시되고, 상태는 조건부 스타일링으로 표시되며, 타임스탬프는 가독성을 위해 형식화됩니다`,
                })}
              </div>
            </div>
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide id="test-implementation" title={l.trans({ en: "Test Your Implementation", ko: "구현 테스트하기" })}>
        <Docs.Title>{l.trans({ en: "Test Your Implementation", ko: "구현 테스트하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `Let's test the detailed view implementation. Navigate to your ice cream order page and click the "View" button on any Unit card to verify that the system works correctly.`,
              ko: `상세 뷰 구현을 테스트해봅시다. 아이스크림 주문 페이지로 이동해서 Unit 카드의 "보기" 버튼을 클릭하여 시스템이 올바르게 작동하는지 확인하세요.`,
            })}
          </div>
          <div className={panelRecipe({ radius: "lg" }, "my-4")}>
            <div className="mb-2 font-semibold text-primary">
              {l.trans({ en: "Testing Steps:", ko: "테스트 단계:" })}
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-foreground/70 text-sm">
              <li>
                {l.trans({
                  en: "Navigate to http://localhost:8282",
                  ko: "http://localhost:8282 로 이동",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Create a new ice cream order if you don't have any",
                  ko: "주문이 없다면 새 아이스크림 주문을 생성",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Click the 'View' button on any Unit card",
                  ko: "Unit 카드의 '보기' 버튼 클릭",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Verify the modal opens with detailed order information",
                  ko: "상세 주문 정보가 포함된 모달이 열리는지 확인",
                })}
              </li>
              <li>
                {l.trans({
                  en: "Check that all fields display correctly with proper translations",
                  ko: "모든 필드가 적절한 번역과 함께 올바르게 표시되는지 확인",
                })}
              </li>
            </ol>
          </div>
          <div>
            {l.trans({
              en: `A modal popup should appear displaying all order details: size, toppings (as colored badges), status (with conditional colors), and timestamps. The modal closes when you click outside it or press the X button.`,
              ko: `모든 주문 세부사항을 표시하는 모달 팝업이 나타나야 합니다: 사이즈, 토핑(색상 배지로), 상태(조건부 색상으로), 타임스탬프. 모달 밖을 클릭하거나 X 버튼을 누르면 모달이 닫힙니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />
      <Scroll.Slide id="next-steps" title={l.trans({ en: "What's Next?", ko: "다음은 무엇인가요?" })}>
        <Docs.Title>{l.trans({ en: "What's Next?", ko: "다음은 무엇인가요?" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: `In the next tutorial, we'll add status management functionality that allows shop staff to update orders from "active" to "processing" to "served". This will complete the order workflow system and provide full lifecycle management for ice cream orders.`,
              ko: `다음 튜토리얼에서는 가게 직원이 주문을 "활성"에서 "처리중"으로, "완료"로 업데이트할 수 있는 상태 관리 기능을 추가할 것입니다. 이것으로 주문 워크플로우 시스템이 완성되고 아이스크림 주문에 대한 전체 생명주기 관리가 제공될 것입니다.`,
            })}
          </div>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
