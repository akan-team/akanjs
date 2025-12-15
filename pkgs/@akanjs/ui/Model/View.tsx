"use client";
import { type ReactNode, useMemo } from "react";
import { AiOutlineMeh } from "react-icons/ai";

interface ViewProps<Full extends { id: string }> {
  className?: string;
  model: Full | null;
  modelLoading?: string | boolean;
  render: (model: Full) => ReactNode | null;
  loadingWrapper?: null | ((props: { children?: any; className?: string }) => ReactNode);
  empty?: null | (() => ReactNode);
  loading?: null | (() => ReactNode);
}
export default function View<Full extends { id: string }>({
  className,
  model,
  modelLoading = true,
  render,
  loadingWrapper,
  loading,
  empty,
}: ViewProps<Full>) {
  const RenderLoadingWrapper = useMemo(
    () =>
      loadingWrapper === null
        ? ({ children, className }) => children as ReactNode
        : (loadingWrapper ??
          (({ children, className }) => (
            <>
              {children}
              {modelLoading ? <div className="absolute inset-0 animate-pulse" /> : null}
            </>
          ))),
    [modelLoading]
  );
  const RenderModel = useMemo(
    () =>
      modelLoading
        ? loading === null
          ? () => null
          : (loading ??
            (() => (
              <div className="flex size-full flex-col items-center justify-center gap-3 pt-6 pb-3">
                <span className="loading loading-dots loading-lg" />
                Loading
              </div>
            )))
        : model
          ? () => render(model)
          : empty === null
            ? () => null
            : (empty ??
              (() => (
                <div className="flex w-full flex-col items-center justify-center gap-3 pt-6 pb-3">
                  <AiOutlineMeh className="scale-150 text-4xl" /> Empty
                </div>
              ))),
    [model, modelLoading]
  );
  return (
    <RenderLoadingWrapper className={className}>
      <RenderModel />
    </RenderLoadingWrapper>
  );
}
