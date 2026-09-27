"use client";
import { lazy } from "akanjs/webkit";

// Akan rich-text editor (Lexical). `Rich` edits; `RichContent` renders read-only.
export const Rich = lazy(() => import("./Lexical/Editor"));
// `suspense` keeps a document only the client editor can draw — one holding an Excalidraw board, one whose
// stored JSON is corrupt — from suspending up to the route and costing the whole page its server render.
export const RichContent = lazy(() => import("./Lexical/Content"), { suspense: true });
