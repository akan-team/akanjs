"use client";

import { use } from "react";
import { lazy } from "../webkit/lazy";

const Chart = lazy(async () => ({ default: () => <canvas /> }), { ssr: false, loading: () => <i>chart loading</i> });

export const ClientNote = ({ label }: { label: string }) => <b>{label}</b>;

export const BrowserChart = () => <Chart />;

const never = new Promise<never>(() => undefined);

export const NeverReady = () => use(never);

export const ClientThrows = () => {
  throw new Error("the chart is missing");
};
