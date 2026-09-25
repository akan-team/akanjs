"use client";
import { type AkanModalComponent, Dialog } from "akanjs/ui";

/**
 * App-authored Modal skin used to demonstrate the `page/_overrides.tsx` mechanism. It composes the
 * framework's headless Dialog parts, so the app re-skins the Modal without re-owning focus-trap,
 * escape handling, scroll-lock, or portal behavior. Typed as `AkanModalComponent` so it is checked as a
 * drop-in replacement for the framework `<Modal>`.
 */
export const BrandModal: AkanModalComponent = ({
  className,
  title,
  action,
  open,
  onCancel,
  bodyClassName,
  children,
  confirmClose = false,
}) => (
  <Dialog open={open}>
    <Dialog.Modal
      className={`rounded-none border-4 border-fuchsia-600 bg-fuchsia-50 shadow-none ${className ?? ""}`}
      onCancel={onCancel}
      bodyClassName={bodyClassName}
      confirmClose={confirmClose}
    >
      {title ? <Dialog.Title>{title}</Dialog.Title> : null}
      <Dialog.Content>
        <div data-testid="brand-modal" className="mb-2 font-semibold text-fuchsia-700">
          🎨 BrandModal override active
        </div>
        {children}
      </Dialog.Content>
      {action ? <Dialog.Action>{action}</Dialog.Action> : null}
    </Dialog.Modal>
  </Dialog>
);
