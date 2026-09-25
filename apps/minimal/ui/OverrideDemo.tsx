"use client";
import { Modal } from "akanjs/ui";
import { useState } from "react";

/**
 * Interactive demo for the `page/_overrides.tsx` mechanism. It renders the framework `<Modal>`; the root
 * `_overrides.tsx` re-binds the Modal slot to the app's BrandModal, so the override appears here without this
 * component importing BrandModal at all.
 */
export const OverrideDemo = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="font-bold text-2xl">UI Override Demo</h1>
      <p className="max-w-md text-center opacity-70">
        This renders the framework Modal. A root page/_overrides.tsx re-binds the Modal slot to the app&apos;s
        BrandModal, so the override appears without changing this component.
      </p>
      <button
        type="button"
        data-testid="open-modal"
        className="rounded bg-fuchsia-600 px-4 py-2 font-semibold text-white"
        onClick={() => setOpen(true)}
      >
        Open Modal
      </button>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title="Override Demo"
        action={
          <button type="button" className="rounded bg-gray-200 px-4 py-2" onClick={() => setOpen(false)}>
            Close
          </button>
        }
      >
        <p>If you see the fuchsia border and the override label, the BrandModal override is active.</p>
      </Modal>
    </div>
  );
};
