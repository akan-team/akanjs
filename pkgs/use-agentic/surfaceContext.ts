"use client";
import { useContext } from "react";
import type { AgentGate } from "./AgentGate";
import { AgenticSurface } from "./AgenticSurface";
import { sharedContext } from "./sharedContext";

export const SurfaceContext = sharedContext<AgenticSurface | null>("surface", null);
export const ScopeContext = sharedContext<string[]>("scope", []);
export const GateContext = sharedContext<AgentGate | null>("gate", null);

export const useSurface = () => useContext(SurfaceContext) ?? AgenticSurface.shared;
export const useScopePath = () => useContext(ScopeContext);
export const useAgentGate = () => useContext(GateContext);
