import { usePage } from "@apps/akan/client";
import { Code, Docs, type IntroItem } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  const utilPatterns: IntroItem[] = [
    {
      name: "[Module].Util.tsx",
      desc: l.trans({
        en: "Standard naming convention for module utilities.",
        ko: "모듈 유틸리티의 표준 명명 규칙입니다.",
      }),
      example: `apps/my-app/lib/product/Product.Util.tsx`,
    },
    {
      name: "Complex Logic",
      desc: l.trans({
        en: "Encapsulate complex state management and store interactions.",
        ko: "복잡한 상태 관리 및 스토어 상호 작용을 캡슐화합니다.",
      }),
      example: `<Product.Util.RefundModal />`,
    },
    {
      name: "Wrappers",
      desc: l.trans({
        en: "Wrappers for server-side actions or navigation.",
        ko: "서버 측 액션이나 네비게이션을 위한 래퍼입니다.",
      }),
      example: `<Product.Util.CreateWrapper />`,
    },
  ];

  return (
    <Scroll>
      <Scroll.Slide id="util-overview" title={"model.util.ts / [Model].Util.tsx"}>
        <Docs.Title>{"model.util.ts / [Model].Util.tsx"}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The Util module is a designated space for UI helpers, sub-components, and specific logic that supports your main application features. It is especially useful for packaging complex interactions, wrappers, and reusable logic to keep your 'Page' and 'Zone' files clean.",
              ko: "Util 모듈은 주요 애플리케이션 기능을 지원하는 UI 헬퍼, 서브 컴포넌트 및 특정 로직을 위한 지정된 공간입니다. 특히 복잡한 상호 작용, 래퍼 및 재사용 가능한 로직을 패키징하여 'Page' 및 'Zone' 파일을 깔끔하게 유지하는 데 유용합니다.",
            })}
          </div>
        </Docs.Description>
        <Docs.IntroTable type="field" items={utilPatterns} />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="complex-state" title={l.trans({ en: "Packaging Complex Logic", ko: "복잡한 로직 패키징" })}>
        <Docs.Title>{l.trans({ en: "Packaging Complex Logic", ko: "복잡한 로직 패키징" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "When a feature requires local state (like Modals), form handling, and store interactions, encapsulate it in a Util component.",
            ko: "기능이 로컬 상태(모달 등), 폼 처리 및 스토어 상호 작용을 필요로 할 때, 이를 Util 컴포넌트로 캡슐화합니다.",
          })}
        </Docs.Description>
        <div className="rounded-lg bg-base-200 p-3 lg:p-4">
          <Code.Snippet
            title="RefundModal Component"
            language="tsx"
            code={`import { useState } from "react";
import { Modal, Select, Button } from "@akanjs/ui";
import { st } from "@my-app/client";

interface RefundProps {
  id: string;
  defaultReason: string;
}

export const RefundButton = ({ id, defaultReason }: RefundProps) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState(defaultReason);

  return (
    <>
      <button className="btn btn-error" onClick={() => setModalOpen(true)}>
        Refund
      </button>
      
      <Modal
        open={modalOpen}
        title="Request Refund"
        onCancel={() => setModalOpen(false)}
        action={
          <Button
            className="btn btn-error w-full"
            onClick={async (e, { onError }) => {
              // Trigger Store Action
              await st.do.refundProduct(id, reason, { onError });
              setModalOpen(false);
            }}
          >
            Confirm
          </Button>
        }
      >
        <Select
          value={reason}
          options={["Defective", "Changed Mind", "Other"]}
          onChange={setReason}
        />
        <div className="text-warning">This action cannot be undone.</div>
      </Modal>
    </>
  );
};`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="ssr-wrapper" title={l.trans({ en: "Wrapper for Server Actions", ko: "서버 액션 래퍼" })}>
        <Docs.Title>{l.trans({ en: "Wrapper for Server Actions", ko: "서버 액션 래퍼" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "Use wrappers to handle client-side events that trigger server actions (via fetch) and navigation, while keeping children simpler.",
            ko: "클라이언트 측 이벤트가 서버 액션(fetch를 통해)과 네비게이션을 트리거하도록 처리하는 래퍼를 사용하여 자식 요소를 단순하게 유지합니다.",
          })}
        </Docs.Description>
        <div className="rounded-lg bg-base-200 p-3 lg:p-4">
          <Code.Snippet
            title="CreateOrderWrapper"
            language="tsx"
            code={`import { fetch, st } from "@my-app/client";
import { useRouter } from "next/navigation";

interface CreateOrderProps {
  productId: string;
  children: React.ReactNode;
}

export const CreateOrderWrapper = ({ productId, children }: CreateOrderProps) => {
  const router = useRouter();
  const self = st.use.self();
  
  const handleClick = async () => {
    if (!self.id) return;
    // Direct API call via fetch
    const order = await fetch.createOrder({ product: productId, user: self.id });
    router.push(\`/order/\${order.id}\`);
  };

  return (
    <div onClick={handleClick} className="cursor-pointer">
      {children}
    </div>
  );
};`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide
        id="action-component"
        title={l.trans({ en: "Endpoint Trigger Components", ko: "엔드포인트 트리거 컴포넌트" })}
      >
        <Docs.Title>{l.trans({ en: "Endpoint Trigger Components", ko: "엔드포인트 트리거 컴포넌트" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "Simple button components that trigger specific business logic or endpoints.",
            ko: "특정 비즈니스 로직이나 엔드포인트를 트리거하는 간단한 버튼 컴포넌트입니다.",
          })}
        </Docs.Description>
        <div className="rounded-lg bg-base-200 p-3 lg:p-4">
          <Code.Snippet
            title="ApproveButton"
            language="tsx"
            code={`import { st } from "@my-app/client";
import { AiOutlineCheck } from "react-icons/ai";

export const ApproveButton = ({ product }: { product: LightProduct }) => {
  return (
    <button 
      className="btn btn-primary btn-sm gap-2" 
      onClick={() => st.do.approveProduct(product.id)}
    >
      <AiOutlineCheck />
      Approve
    </button>
  );
};`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="reusable-component" title={l.trans({ en: "Context-Aware UI", ko: "컨텍스트 인지 UI" })}>
        <Docs.Title>{l.trans({ en: "Context-Aware UI", ko: "컨텍스트 인지 UI" })}</Docs.Title>
        <Docs.Description>
          {l.trans({
            en: "Components that adapt their rendering based on the global store state (e.g. current path, user role).",
            ko: "전역 스토어 상태(예: 현재 경로, 사용자 역할)에 따라 렌더링을 조정하는 컴포넌트입니다.",
          })}
        </Docs.Description>
        <div className="rounded-lg bg-base-200 p-3 lg:p-4">
          <Code.Snippet
            title="ContextBackButton"
            language="tsx"
            code={`import { st } from "@my-app/client";
import { Link } from "@akanjs/ui";

export const ContextBackButton = ({ sectionId }: { sectionId: string }) => {
  const path = st.use.path();
  
  // Only render if we are deep inside the specific section
  if (!path.startsWith(\`/section/\${sectionId}/\`)) return null;

  return (
    <Link.Back className="btn btn-ghost">
      &larr; Back
    </Link.Back>
  );
};`}
          />
        </div>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
