import type { AkanSegmentOutlet } from "./rscSegmentOutlet";

const AKAN_SEGMENT_OUTLET_REFERENCE_ID = "pkgs/akanjs/server/rscSegmentOutlet.tsx";

function createAkanSegmentOutletServerReference(): typeof AkanSegmentOutlet {
  throw new Error("[rscSegmentOutlet] AkanSegmentOutlet is a client component and cannot run on the server");
}

function resolveAkanSegmentOutletReference(): typeof AkanSegmentOutlet {
  try {
    const { registerClientReference } = require("react-server-dom-webpack/server.node") as {
      registerClientReference<T>(proxyImplementation: T, id: string, exportName: string): T;
    };
    return registerClientReference(
      createAkanSegmentOutletServerReference as unknown as typeof AkanSegmentOutlet,
      AKAN_SEGMENT_OUTLET_REFERENCE_ID,
      "AkanSegmentOutlet",
    );
  } catch {
    return createAkanSegmentOutletServerReference as unknown as typeof AkanSegmentOutlet;
  }
}

export const AkanSegmentOutletReference = resolveAkanSegmentOutletReference();
