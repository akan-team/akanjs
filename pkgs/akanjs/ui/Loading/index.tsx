"use client";
import { createOverridable } from "../UiOverride";
import { Area } from "./Area";
import { Button } from "./Button";
import { Input } from "./Input";
import { ProgressBar } from "./ProgressBar";
import { Skeleton } from "./Skeleton";
import { Spin } from "./Spin";

/**
 * Loading indicators. Each member is an independent override slot (`LoadingSpin`, `LoadingSkeleton`,
 * `LoadingProgressBar`, `LoadingButton`, `LoadingInput`, `LoadingArea`), resolved from the closest
 * `page/**\/_overrides.tsx` in the route's ancestry, otherwise the shipped default.
 */
export const Loading = {
  Area: createOverridable("LoadingArea", Area),
  Button: createOverridable("LoadingButton", Button),
  Input: createOverridable("LoadingInput", Input),
  ProgressBar: createOverridable("LoadingProgressBar", ProgressBar),
  Skeleton: createOverridable("LoadingSkeleton", Skeleton),
  Spin: createOverridable("LoadingSpin", Spin),
};
