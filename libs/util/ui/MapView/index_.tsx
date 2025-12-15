"use client";
import { lazy } from "@akanjs/next";

export const Google = lazy(() => import("./Google"), { ssr: false });
export const Marker = lazy(() => import("./Marker"), { ssr: false });
export const Polyline = lazy(() => import("./Polyline"), { ssr: false });
export const Map = lazy(() => import("./Map"), { ssr: false });
export const AimCenter = lazy(() => import("./AimCenter"), { ssr: false });
export const Pigeon = lazy(() => import("./Pigeon"), { ssr: false });
export const PigeonMap = lazy(() => import("./PigeonMap"), { ssr: false });
export const PigeonMarker = lazy(() => import("./PigeonMarker"), { ssr: false });
export const PigeonPolyline = lazy(() => import("./PigeonPolyline"), { ssr: false });
export const PigeonPolygon = lazy(() => import("./PigeonPolygon"), { ssr: false });
export const PigeonCircle = lazy(() => import("./PigeonCircle"), { ssr: false });
export const PigeonArc = lazy(() => import("./PigeonArc"), { ssr: false });
