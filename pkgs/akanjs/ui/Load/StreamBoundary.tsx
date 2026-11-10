"use client";
import { Translator } from "akanjs/client";
import { parseAkanI18nEnv } from "akanjs/common";
import { Component, type ReactNode } from "react";

interface StreamBoundaryProps {
  resetKey: number;
  error?: ReactNode;
  children: ReactNode;
}
interface StreamBoundaryState {
  resetKey: number;
  failed: boolean;
}

//? Past the shell React rethrows a rejection in the browser, and with no boundary above it unmounts the root (#441).
export class StreamBoundary extends Component<StreamBoundaryProps, StreamBoundaryState> {
  override state: StreamBoundaryState = { resetKey: this.props.resetKey, failed: false };

  static getDerivedStateFromError(): Partial<StreamBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: StreamBoundaryProps,
    state: StreamBoundaryState,
  ): Partial<StreamBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { resetKey: props.resetKey, failed: false };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return this.props.error === undefined ? <LoadFailed /> : this.props.error;
  }
}

const LoadFailed = () => {
  const lang = Translator.getActiveLocale() ?? parseAkanI18nEnv().defaultLocale;
  return (
    <div
      role="alert"
      className="flex w-full items-center justify-center px-6 py-8 text-center text-foreground/55 text-sm"
    >
      {Translator.translateByLocale(lang, "base.loadFailed")}
    </div>
  );
};
