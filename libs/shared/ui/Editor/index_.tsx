"use client";
import { lazy } from "@akanjs/next";

export const Slate = lazy(() => import("./Slate"));
export const SlateContent = lazy(() => import("./SlateContent"));
export const Yoopta = lazy(() => import("./Yoopta/Editor"));
