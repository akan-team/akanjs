"use client";
import { Dialog, Modal } from "akanjs/ui";
import { useState } from "react";

type ModalKey = "basic" | "action" | "long" | "confirm" | "plain";

const longItems = Array.from({ length: 28 }, (_, index) => `Scrollable content row ${index + 1}`);

export const ModalTests = () => {
  const [openModal, setOpenModal] = useState<ModalKey | null>(null);
  const [result, setResult] = useState("아직 실행된 action이 없습니다.");

  const open = (key: ModalKey) => {
    setOpenModal(key);
  };

  const close = () => {
    setOpenModal(null);
  };

  return (
    <main className="min-h-screen bg-base-100 px-6 py-10 text-base-content">
      <section className="mx-auto flex max-w-5xl flex-col gap-8">
        <div>
          <p className="font-semibold text-primary text-sm tracking-[0.24em]">AKAN MODAL TESTS</p>
          <h1 className="mt-3 font-black text-4xl tracking-tight md:text-5xl">Headless Modal 샘플 페이지</h1>
          <p className="mt-4 max-w-2xl text-base-content/70">
            Radix Dialog 제거 후 `Modal`과 compound `Dialog`의 주요 케이스를 직접 열어보고 닫기 동작, overlay, Escape,
            action slot, scroll 영역, confirm close를 확인하는 페이지입니다.
          </p>
        </div>

        <div className="rounded-2xl border border-base-300 bg-base-200/60 p-4">
          <div className="text-base-content/60 text-sm">최근 action 결과</div>
          <div className="mt-1 font-semibold">{result}</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TestCard
            title="Basic Modal"
            description="title과 body만 있는 가장 기본 controlled Modal입니다."
            onOpen={() => open("basic")}
          />
          <TestCard
            title="Action Modal"
            description="footer action slot에서 저장/취소 버튼을 확인합니다."
            onOpen={() => open("action")}
          />
          <TestCard
            title="Long Content"
            description="body scroll, height 제한, overlay close를 확인합니다."
            onOpen={() => open("long")}
          />
          <TestCard
            title="Confirm Close"
            description="닫기 전에 window.confirm을 거치는 confirmClose 케이스입니다."
            onOpen={() => open("confirm")}
          />
          <TestCard
            title="No Title"
            description="title 없이 content만 있는 Modal의 ARIA/레이아웃 확인용입니다."
            onOpen={() => open("plain")}
          />
          <CompoundDialogCard
            onSave={() => {
              setResult(`Compound Dialog action: ${new Date().toLocaleTimeString()}`);
            }}
          />
        </div>
      </section>

      <Modal open={openModal === "basic"} onCancel={close} title="Basic Modal">
        <div className="space-y-3">
          <p>기본 모달입니다. X 버튼, overlay click, Escape key로 닫히는지 확인하세요.</p>
          <p className="text-base-content/60 text-sm">
            닫힘 애니메이션이 끝난 뒤 unmount되는지도 함께 확인할 수 있습니다.
          </p>
        </div>
      </Modal>

      <Modal
        open={openModal === "action"}
        onCancel={close}
        title="Action Modal"
        action={
          <div className="flex justify-end gap-2 border-base-300 border-t p-4">
            <button type="button" className="btn btn-ghost" onClick={close}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setResult(`Modal action saved: ${new Date().toLocaleTimeString()}`);
                close();
              }}
            >
              저장
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p>아래 action slot이 모달 하단에 렌더링되는지 확인합니다.</p>
          <input className="input input-bordered w-full" placeholder="focus와 입력 동작 확인" />
        </div>
      </Modal>

      <Modal open={openModal === "long"} onCancel={close} title="Long Content">
        <div className="space-y-3">
          <p className="text-base-content/70">
            긴 콘텐츠를 넣어 body 영역이 스크롤되고, 배경 body scroll이 잠기는지 확인합니다.
          </p>
          <div className="grid gap-2">
            {longItems.map((item) => (
              <div key={item} className="rounded-xl border border-base-300 bg-base-200 px-4 py-3">
                {item}
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={openModal === "confirm"} onCancel={close} title="Confirm Close" confirmClose>
        <div className="space-y-3">
          <p>닫기를 시도하면 브라우저 confirm이 먼저 표시됩니다.</p>
          <p className="text-base-content/60 text-sm">
            cancel을 누르면 모달이 유지되고, confirm을 누르면 닫힘 애니메이션 후 unmount됩니다.
          </p>
          <textarea
            className="textarea textarea-bordered min-h-28 w-full"
            placeholder="작성 중인 값이 있다고 가정합니다."
          />
        </div>
      </Modal>

      <Modal open={openModal === "plain"} onCancel={close}>
        <div className="space-y-3">
          <p className="font-bold text-lg">No Title Modal</p>
          <p>title prop이 없어도 body와 close 동작이 정상인지 확인합니다.</p>
        </div>
      </Modal>
    </main>
  );
};

interface TestCardProps {
  title: string;
  description: string;
  onOpen: () => void;
}

const TestCard = ({ title, description, onOpen }: TestCardProps) => {
  return (
    <article className="flex min-h-44 flex-col justify-between rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <div>
        <h2 className="font-bold text-xl">{title}</h2>
        <p className="mt-2 text-base-content/65 text-sm leading-6">{description}</p>
      </div>
      <button type="button" className="btn btn-primary mt-5" onClick={onOpen}>
        열기
      </button>
    </article>
  );
};

interface CompoundDialogCardProps {
  onSave: () => void;
}

const CompoundDialogCard = ({ onSave }: CompoundDialogCardProps) => {
  return (
    <article className="flex min-h-44 flex-col justify-between rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <div>
        <h2 className="font-bold text-xl">Compound Dialog</h2>
        <p className="mt-2 text-base-content/65 text-sm leading-6">
          `Dialog.Trigger`, `Dialog.Title`, `Dialog.Content`, `Dialog.Action` 조합을 확인합니다.
        </p>
      </div>
      <Dialog>
        <Dialog.Trigger className="mt-5">
          <button type="button" className="btn btn-secondary w-full">
            열기
          </button>
        </Dialog.Trigger>
        <Dialog.Modal>
          <Dialog.Title>Compound Dialog</Dialog.Title>
          <Dialog.Content>
            <div className="space-y-4">
              <p>compound API를 직접 조합한 모달입니다.</p>
              <input className="input input-bordered w-full" placeholder="Dialog.Content 내부 input" />
            </div>
          </Dialog.Content>
          <Dialog.Action>
            <div className="flex justify-end border-base-300 border-t p-4">
              <button type="button" className="btn btn-secondary" onClick={onSave}>
                action 실행
              </button>
            </div>
          </Dialog.Action>
        </Dialog.Modal>
      </Dialog>
    </article>
  );
};
