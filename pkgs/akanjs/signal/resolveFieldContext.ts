import type { Internal } from "./internal";
import type { InternalInfo } from "./internalInfo";
import type { SignalContext } from "./signalContext";
import { SignalContractError } from "./signalContractError";

export class ResolveFieldContext {
  signalContext: SignalContext | null;
  internalInfo: InternalInfo<"resolveField">;
  internal: Internal;
  parent: unknown;
  constructor(
    parent: unknown,
    {
      signalContext,
      internalInfo,
      internal,
    }: { signalContext: SignalContext | null; internalInfo: InternalInfo<"resolveField">; internal: Internal },
  ) {
    this.signalContext = signalContext;
    this.internalInfo = internalInfo;
    this.internal = internal;
    this.parent = parent;
  }
  async exec() {
    if (!this.internalInfo.execFn) throw new SignalContractError("noHandler", "Exec function is not set");
    const internalArgs = await Promise.all(
      this.internalInfo.internalArgs.map((arg) =>
        this.signalContext ? (new arg.argRef().getArg(this.signalContext) ?? null) : null,
      ),
    );
    const result = await this.internalInfo.execFn.call(this.internal, this.parent, ...internalArgs);
    return result;
  }
}
