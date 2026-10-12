"use client";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { McpAppApprovals } from "../../webkit/McpAppApprovals";
import Approval from "./Approval";

export const EmbedApproval = () => {
  const approvals = McpAppApprovals.shared;
  const pending = useSyncExternalStore(approvals.subscribe, approvals.current, () => null);
  if (!pending) return null;
  return createPortal(
    <div data-akan-embed-overlay="" className="fixed inset-x-0 bottom-0 z-[100] bg-background shadow-lg">
      <Approval approval={pending} />
    </div>,
    document.body,
  );
};
