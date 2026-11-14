import type { Logger } from "akanjs/common";
import type { BuilderMessage, BuilderRequest, BuilderResponse } from "../artifact";
import type { ChildState, GatewayChildren } from "./gatewayChildren";

export class DevHostChannel {
  readonly #children: GatewayChildren;
  readonly #logger: Logger;
  #nextBuilderReqId = 1;
  //? Holds the spawn's state, not its index: a respawned replica restarts its BuilderRpc ids at 1.
  readonly #builderReqMap = new Map<number, { child: ChildState; childLocalId: number }>();

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

  forwardBuilderReq(child: ChildState, message: BuilderRequest) {
    if (this.#children.isUnavailable(child)) return;
    const gatewayReqId = this.#nextBuilderReqId++;
    this.#builderReqMap.set(gatewayReqId, { child, childLocalId: message.id });
    process.send?.({ ...message, id: gatewayReqId } satisfies BuilderRequest);
  }

  forwardBuilderRes(message: BuilderResponse) {
    const request = this.#builderReqMap.get(message.id);
    if (!request) {
      this.#logger.verbose(`No child found for ${message.type} id=${message.id}`);
      return;
    }
    this.#builderReqMap.delete(message.id);
    const { child, childLocalId } = request;
    if (this.#children.get(child.idx) !== child) return;
    this.#children.send(child, { ...message, id: childLocalId } satisfies BuilderResponse);
  }

  dropChild(proc: ChildState["proc"]) {
    for (const [gatewayReqId, request] of this.#builderReqMap)
      if (request.child.proc === proc) this.#builderReqMap.delete(gatewayReqId);
  }
}
