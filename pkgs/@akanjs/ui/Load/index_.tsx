"use client";
import { lazy } from "@akanjs/next";

export const View = lazy(() => import("./View"), { ssr: false });
export const Units = lazy(() => import("./Units"), { ssr: false });
export const Pagination = lazy(() => import("./Pagination"), { ssr: false });
