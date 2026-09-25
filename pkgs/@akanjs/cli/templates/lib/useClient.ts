import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  return `
import { makePageProto, registerClientRuntime } from "akanjs/client";
import { FetchClient } from "akanjs/fetch";
import * as cnst from "./cnst";
import { getAllDictionary } from "./dict" with { type: "macro" };
import type * as dict from "./dict";
import { getSerializedSignal } from "./sig" with { type: "macro" };
import type * as signal from "./sig";

const dictionary = process.env.AKAN_PUBLIC_RENDER_ENV === "csr" ? getAllDictionary() : {};
const pageProto = makePageProto<typeof dict>(dictionary);
const fetchProto = FetchClient.build<typeof signal>(cnst, getSerializedSignal(), { Err: pageProto.Err });
export const runtime = registerClientRuntime({ ...pageProto, ...fetchProto }, { scope: ${JSON.stringify(scanInfo?.type ?? "lib")} });

export const { msg, Err, usePage, sig, fetch } = runtime;
`;
}
