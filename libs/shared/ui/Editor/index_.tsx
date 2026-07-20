"use client";
import { lazy } from "akanjs/webkit";

// Akan rich-text editor (Lexical). `Rich` edits; `RichContent` renders read-only.
export const Rich = lazy(() => import("./Lexical/Editor"));
export const RichContent = lazy(() => import("./Lexical/Content"));
