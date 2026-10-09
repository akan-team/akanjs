import type { EndpointCls } from "./endpoint";
import type { InternalCls } from "./internal";
import { FetchSerializer } from "./serializer";
import type { ServerSignalCls } from "./serverSignal";
import type { SliceCls } from "./slice";
import type { SerializedSignal } from "./types";

type SignalBaseRef<SigCls> = SigCls extends { srv: { srv: { refName: infer RefName } } } ? RefName : never;
type SignalWithBase<RefName extends string, SigCls> = SignalBaseRef<SigCls> extends RefName ? SigCls : never;

function assertSignalBase(refName: string, signalKind: string, signalCls: { srv?: { srv?: { refName?: unknown } } }) {
  const signalRefName = signalCls.srv?.srv?.refName;
  if (signalRefName !== refName) {
    throw new Error(
      `Signal base mismatch: ${signalKind} uses "${String(signalRefName)}", but registry expected "${refName}". Use srv.${refName}.with(...) when the signal needs another service.`,
    );
  }
}

export class DatabaseSignal<
  IntlCls extends InternalCls = InternalCls,
  EndpCls extends EndpointCls = EndpointCls,
  SlceCls extends SliceCls = SliceCls,
  SrvrCls extends ServerSignalCls = ServerSignalCls,
> {
  serializedSignal: SerializedSignal;

  constructor(
    public internal: IntlCls,
    public endpoint: EndpCls,
    public slice: SlceCls,
    public server: SrvrCls,
    origin?: string,
  ) {
    this.serializedSignal = {
      ...FetchSerializer.serializeDatabaseSignal(slice, endpoint),
      ...(origin ? { origin: [origin] } : {}),
    };
  }
}

export class ServiceSignal<
  IntlCls extends InternalCls = InternalCls,
  EndpCls extends EndpointCls = EndpointCls,
  SrvrCls extends ServerSignalCls = ServerSignalCls,
> {
  serializedSignal: SerializedSignal;

  constructor(
    public internal: IntlCls,
    public endpoint: EndpCls,
    public server: SrvrCls,
    origin?: string,
  ) {
    this.serializedSignal = {
      ...FetchSerializer.serializeServiceSignal(endpoint),
      ...(origin ? { origin: [origin] } : {}),
    };
  }
}

// TODO: add scalar signal for resolve field
export class SignalRegistry {
  static readonly #database = new Map<string, DatabaseSignal<InternalCls, EndpointCls, SliceCls, ServerSignalCls>>();
  static readonly #service = new Map<string, ServiceSignal<InternalCls, EndpointCls, ServerSignalCls>>();

  static registerDatabase<
    RefName extends string,
    IntlCls extends InternalCls,
    EndpCls extends EndpointCls,
    SlceCls extends SliceCls,
    SrvrCls extends ServerSignalCls,
  >(
    refName: RefName,
    internal: SignalWithBase<RefName, IntlCls>,
    endpoint: SignalWithBase<RefName, EndpCls>,
    slice: SignalWithBase<RefName, SlceCls>,
    server: SrvrCls,
    origin?: string,
  ): DatabaseSignal<IntlCls, EndpCls, SlceCls, SrvrCls> {
    assertSignalBase(refName, "internal", internal);
    assertSignalBase(refName, "endpoint", endpoint);
    assertSignalBase(refName, "slice", slice);
    const databaseSignal = new DatabaseSignal(internal, endpoint, slice, server, origin);
    SignalRegistry.#database.set(refName, databaseSignal);
    return databaseSignal;
  }
  static getDatabase(refName: string) {
    return SignalRegistry.#database.get(refName);
  }
  static registerService<
    RefName extends string,
    IntlCls extends InternalCls,
    EndpCls extends EndpointCls,
    SrvrCls extends ServerSignalCls,
  >(
    refName: RefName,
    internal: SignalWithBase<RefName, IntlCls>,
    endpoint: SignalWithBase<RefName, EndpCls>,
    server: SrvrCls,
    origin?: string,
  ): ServiceSignal<IntlCls, EndpCls, SrvrCls> {
    assertSignalBase(refName, "internal", internal);
    assertSignalBase(refName, "endpoint", endpoint);
    const serviceSignal = new ServiceSignal(internal, endpoint, server, origin);
    SignalRegistry.#service.set(refName, serviceSignal);
    return serviceSignal;
  }
  static getService(refName: string) {
    return SignalRegistry.#service.get(refName);
  }
}
