"use client";
import { badgeVariants } from "../Badge";

export const signalUi = {
  sectionTitle: "font-extrabold text-lg",
  sectionDescription: "text-foreground/70 text-sm",
  sectionPanel: "rounded-xl bg-background p-3",
  // TODO(daisyui): collapse-arrow/collapse는 구조적(checkbox+CSS) → Radix Accordion 또는 peer 기반으로.
  // Message의 마크업(input/title/content) 재구성 + 실환경 expand/collapse 검증 필요.
  endpointCard: "collapse-arrow collapse my-2 bg-base-200",
  endpointContent: "collapse-content flex w-full flex-col gap-4 bg-background/60",
  tablePanel: "overflow-x-auto rounded-xl bg-background p-3",
  inputRow: "flex w-full flex-col gap-2 py-2 md:flex-row md:items-center",
  inputLabel: "w-full font-semibold text-foreground/70 text-sm md:w-36",
  codePanel:
    "min-h-[300px] w-full rounded-xl border border-base-300 bg-background p-4 font-normal text-foreground text-sm",
};

export const getEndpointBadgeClassName = (type: string) =>
  badgeVariants({ variant: type === "query" || type === "pubsub" ? "primary" : "secondary" });

export const getGuardBadgeClassName = (guard: string) =>
  badgeVariants({ variant: guard === "Public" ? "primary" : guard === "None" ? "default" : "secondary" });

export const getStatusBadgeClassName = (status: string) =>
  badgeVariants({
    variant: status === "error" ? "error" : status === "success" || status === "listening" ? "primary" : "outline",
  });

export const getStatusTextareaClassName = (status: string) =>
  status === "error"
    ? "border-destructive text-destructive"
    : status === "success" || status === "listening"
      ? "border-primary"
      : status === "loading"
        ? "pointer-events-none opacity-50"
        : "";
