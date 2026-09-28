"use client";
import { lazy } from "akanjs/webkit";

export const RegistryLazy = lazy(() => import("./RegistryLazy_Dynamic"), { ssr: false });
