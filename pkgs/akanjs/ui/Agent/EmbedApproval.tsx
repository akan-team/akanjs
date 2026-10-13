"use client";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { McpAppApprovals } from "../../webkit/McpAppApprovals";
import { overlayZ } from "../overlayLayer";
import Approval from "./Approval";

export const EmbedApproval = () => {
  const approvals = McpAppApprovals.shared;
  const pending = useSyncExternalStore(approvals.subscribe, approvals.current, () => null);
  if (!pending) return null;
  return createPortal(
    <div
      data-akan-embed-overlay=""
      className="fixed inset-x-0 bottom-0 bg-background shadow-lg"
      style={{ zIndex: overlayZ.approval }}
    >
      <Approval approval={pending} />
    </div>,
    document.body,
  );
};
