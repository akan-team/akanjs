"use client";
import { router, Translator } from "akanjs/client";
import { parseAkanI18nEnv } from "akanjs/common";
import { Component, type ReactNode } from "react";

export type StreamError = ReactNode | ((error: unknown, retry: () => void) => ReactNode);

interface StreamBoundaryProps {
  resetKey: string;
  error?: StreamError;
  children: ReactNode;
}
interface StreamBoundaryState {
  resetKey: string;
  failure: { error: unknown } | null;
}

//? Past the shell React rethrows a rejection in the browser, and with no boundary above it unmounts the root (#441).
export class StreamBoundary extends Component<StreamBoundaryProps, StreamBoundaryState> {
  override state: StreamBoundaryState = { resetKey: this.props.resetKey, failure: null };

  static getDerivedStateFromError(error: unknown): Partial<StreamBoundaryState> {
    return { failure: { error } };
  }

  static getDerivedStateFromProps(
    props: StreamBoundaryProps,
    state: StreamBoundaryState,
  ): Partial<StreamBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { resetKey: props.resetKey, failure: null };
  }

  override render() {
    const { failure } = this.state;
    if (!failure) return this.props.children;
    if (isRouteControl(failure.error)) return null;
    const { error } = this.props;
    if (typeof error === "function") return error(failure.error, retry);
    return error === undefined ? <LoadFailed error={failure.error} /> : error;
  }
}

const retry = () => router.refresh();

//? Raised below a route after the first byte, a not-found or redirect is the host's to answer; its subtree draws nothing.
const isRouteControl = (error: unknown) => {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return digest === "AKAN_NOT_FOUND" || (typeof digest === "string" && digest.startsWith("AKAN_REDIRECT"));
};

const LoadFailed = ({ error }: { error: unknown }) => {
  const lang = Translator.getActiveLocale() ?? parseAkanI18nEnv().defaultLocale;
  return (
    <div role="alert" className="flex w-full flex-col items-center justify-center gap-3 px-6 py-8 text-center text-sm">
      <p className="text-foreground/55">{Translator.translateByLocale(lang, "base.loadFailed")}</p>
      {process.env.NODE_ENV === "production" ? null : (
        <p className="max-w-md break-words font-mono text-foreground/40 text-xs">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      <button
        type="button"
        onClick={retry}
        className="rounded-field border border-border px-3 py-1.5 font-medium text-foreground/70 text-xs"
      >
        {Translator.translateByLocale(lang, "base.retry")}
      </button>
    </div>
  );
};
