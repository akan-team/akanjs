"use client";
import { useContext } from "react";
import { AgenticSurface } from "./AgenticSurface";
import { sharedContext } from "./sharedContext";

export const SurfaceContext = sharedContext<AgenticSurface | null>("surface", null);
export const ScopeContext = sharedContext<string[]>("scope", []);

export const useSurface = () => useContext(SurfaceContext) ?? AgenticSurface.shared;
export const useScopePath = () => useContext(ScopeContext);
