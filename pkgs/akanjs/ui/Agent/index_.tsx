"use client";
import { lazy } from "akanjs/webkit";

// `ssr: false`: the chat is a pure client loop with no server-renderable content, so the page ships without it
// and the chunk loads after hydration — the launcher appearing post-mount is the normal chat-widget behavior.
export const Chat = lazy(() => import("./Chat"), { ssr: false });
