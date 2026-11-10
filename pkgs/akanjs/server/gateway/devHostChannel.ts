import type { Logger } from "akanjs/common";
import type { BuilderMessage, BuilderRequest, BuilderResponse } from "../artifact";
import type { GatewayChildren } from "./gatewayChildren";

export class DevHostChannel {
  readonly #children: GatewayChildren;
  readonly #logger: Logger;
  #nextBuilderReqId = 1;
  readonly #builderReqMap = new Map<number, { childIdx: number; childLocalId: number }>();

  constructor(children: GatewayChildren, logger: Logger) {
    this.#children = children;
    this.#logger = logger;
  }

  reportBackendBuildStatus({ ok, message }: { ok: boolean; message: string }) {
    process.send?.({
      type: "build-status",
      data: { generation: -1, phase: "backend", ok, files: [], message },
    } satisfies BuilderMessage);
  }

  forwardBuilderReq(childIdx: number, message: BuilderRequest) {
    const gatewayReqId = this.#nextBuilderReqId++;
    this.#builderReqMap.set(gatewayReqId, { childIdx, childLocalId: message.id });
    process.send?.({ ...message, id: gatewayReqId } satisfies BuilderRequest);
  }

  forwardBuilderRes(message: BuilderResponse) {
    const request = this.#builderReqMap.get(message.id);
    if (!request) {
      this.#logger.warn(`No child found for ${message.type} id=${message.id}`);
      return;
    }
    this.#builderReqMap.delete(message.id);
    const child = this.#children.get(request.childIdx);
    if (!child || child.proc.killed) return;
    this.#children.send(child, { ...message, id: request.childLocalId } satisfies BuilderResponse);
  }
}
