"use client";

export const signalUi = {
  sectionTitle: "font-extrabold text-lg",
  sectionDescription: "text-base-content/70 text-sm",
  sectionPanel: "rounded-xl bg-base-100 p-3",
  endpointCard: "collapse-arrow collapse my-2 bg-base-200",
  endpointContent: "collapse-content flex w-full flex-col gap-4 bg-base-100/60",
  tablePanel: "overflow-x-auto rounded-xl bg-base-100 p-3",
  inputRow: "flex w-full flex-col gap-2 py-2 md:flex-row md:items-center",
  inputLabel: "w-full font-semibold text-base-content/70 text-sm md:w-36",
  codePanel:
    "textarea min-h-[300px] w-full rounded-xl border border-base-300 bg-base-100 p-4 font-normal text-sm text-base-content",
};

export const getEndpointBadgeClassName = (type: string) =>
  type === "query" || type === "pubsub" ? "badge badge-primary" : "badge badge-secondary";

export const getGuardBadgeClassName = (guard: string) =>
  guard === "Public" ? "badge badge-primary" : guard === "None" ? "badge" : "badge badge-secondary";

export const getStatusBadgeClassName = (status: string) =>
  status === "error"
    ? "badge badge-error"
    : status === "success" || status === "listening"
      ? "badge badge-primary"
      : "badge badge-outline";

export const getStatusTextareaClassName = (status: string) =>
  status === "error"
    ? "border-error text-error"
    : status === "success" || status === "listening"
      ? "border-primary"
      : status === "loading"
        ? "textarea-disabled"
        : "";
