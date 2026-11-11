import { Err } from "../dict"; // @ok
import { Err as ClientErr } from "@libs/shared/client"; // @ok
import { Err as AppErr } from "@apps/demo/client"; // @ok
import type { Err as TypeOnly } from "akanjs/common"; // @ok
import { type Err as InlineType, Logger } from "akanjs/common"; // @ok
import type { Err as DeepType } from "akanjs/common/err.ts"; // @ok
import { hasErrKey } from "akanjs/common"; // @ok
import type { ErrConstructor, ErrPayload } from "akanjs/common"; // @ok
import { Err as NearName } from "akanjs/common/hasErrKey.ts"; // @ok
export type { Err as ReexportedType } from "akanjs/common"; // @ok
export { Logger as Log } from "akanjs/common"; // @ok
export const quotesTheRule = 'import { Err } from "akanjs/common"'; // @ok
