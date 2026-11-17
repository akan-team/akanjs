import { lazy } from "akanjs/webkit";

export const LazyLegacyModal = lazy(() => import("./LegacyModal").then((module) => module.LegacyModal), {
  suspense: true,
});
