import type { AkanRouteHead, AkanSegmentOutlet } from "./rscSegmentOutlet";

const AKAN_SEGMENT_OUTLET_REFERENCE_ID = "pkgs/akanjs/server/rscSegmentOutlet.tsx";

function resolveAkanSegmentOutletReference<T>(exportName: string): T {
  //? registerClientReference stamps $$id onto the function it is given, so each export needs its own.
  const serverReference = (): never => {
    throw new Error(`[rscSegmentOutlet] ${exportName} is a client component and cannot run on the server`);
  };
  try {
    const { registerClientReference } = require("react-server-dom-webpack/server.node") as {
      registerClientReference<T>(proxyImplementation: T, id: string, exportName: string): T;
    };
    return registerClientReference(serverReference as unknown as T, AKAN_SEGMENT_OUTLET_REFERENCE_ID, exportName);
  } catch {
    return serverReference as unknown as T;
  }
}

export const AkanSegmentOutletReference =
  resolveAkanSegmentOutletReference<typeof AkanSegmentOutlet>("AkanSegmentOutlet");
export const AkanRouteHeadReference = resolveAkanSegmentOutletReference<typeof AkanRouteHead>("AkanRouteHead");
