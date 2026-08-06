"use client";
import { badgeRecipe } from "../Badge";

export const signalUi = {
  sectionTitle: "font-extrabold text-lg",
  sectionDescription: "text-foreground/70 text-sm",
  sectionPanel: "rounded-xl bg-background p-3",
  tablePanel: "overflow-x-auto rounded-xl bg-background p-3",
  // daisyui `.table` 대체: 시맨틱 토큰 표 스타일.
  tableClass:
    "w-full text-left text-sm [&_th]:px-3 [&_th]:py-2 [&_th]:font-medium [&_th]:text-foreground/60 [&_td]:px-3 [&_td]:py-2 [&_tbody_tr]:border-border [&_tbody_tr]:border-t",
  inputRow: "flex w-full flex-col gap-2 py-2 md:flex-row md:items-center",
  inputLabel: "w-full font-semibold text-foreground/70 text-sm md:w-36",
  codePanel:
    "min-h-[300px] w-full rounded-xl border border-border bg-background p-4 font-normal text-foreground text-sm",
};

export const getEndpointBadgeClassName = (type: string) =>
  badgeRecipe({ variant: type === "query" || type === "pubsub" ? "primary" : "secondary" });

export const getGuardBadgeClassName = (guard: string) =>
  badgeRecipe({ variant: guard === "Public" ? "primary" : guard === "None" ? "default" : "secondary" });

export const getStatusBadgeClassName = (status: string) =>
  badgeRecipe({
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
