import type { cnst } from "@libs/shared/client";

export type AddFile = (file: cnst.File | cnst.File[], options?: { idx?: number; limit?: number }) => unknown;
