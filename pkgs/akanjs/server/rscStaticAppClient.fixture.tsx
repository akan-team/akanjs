"use client";

import { lazy } from "../webkit/lazy";

const Chart = lazy(async () => ({ default: () => <canvas /> }), { ssr: false, loading: () => <i>chart loading</i> });

export const ClientNote = ({ label }: { label: string }) => <b>{label}</b>;

export const BrowserChart = () => <Chart />;
