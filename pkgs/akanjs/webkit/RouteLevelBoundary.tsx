"use client";
import { isRouteControl, router } from "akanjs/client";
import { Component, type ReactNode } from "react";
import { RenderFailure } from "./RenderFailure";

interface RouteLevelBoundaryProps {
  children?: ReactNode;
}
interface RouteLevelBoundaryState {
  children?: ReactNode;
  failure: { error: unknown } | null;
}

//? Past the first byte a level's server error reaches the browser as a rethrow, and with no boundary above it React
//? unmounts the root (#441). Only the Flight client gives an error a string digest, so a client render bug passes on.
export class RouteLevelBoundary extends Component<RouteLevelBoundaryProps, RouteLevelBoundaryState> {
  override state: RouteLevelBoundaryState = { children: this.props.children, failure: null };

  static getDerivedStateFromError(error: unknown): Partial<RouteLevelBoundaryState> {
    return { failure: { error } };
  }

  //? A refresh or a navigation hands the level a new payload, whose elements are new objects: it renders again.
  static getDerivedStateFromProps(
    props: RouteLevelBoundaryProps,
    state: RouteLevelBoundaryState,
  ): Partial<RouteLevelBoundaryState> | null {
    return props.children === state.children ? null : { children: props.children, failure: null };
  }

  override render() {
    const { failure } = this.state;
    if (!failure) return this.props.children;
    if (typeof (failure.error as { digest?: unknown } | null)?.digest !== "string") throw failure.error;
    if (isRouteControl(failure.error)) return null;
    return <RenderFailure error={failure.error} onRetry={retry} />;
  }
}

const retry = () => router.refresh();
