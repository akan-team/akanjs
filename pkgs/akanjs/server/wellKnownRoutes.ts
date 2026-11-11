import type { BaseBuildArtifact, HttpRoutes } from "./types";

const APPLE_APP_SITE_ASSOCIATION_PATH = "/.well-known/apple-app-site-association";
const ANDROID_ASSET_LINKS_PATH = "/.well-known/assetlinks.json";

export class WellKnownRoutes {
  static build(artifact: BaseBuildArtifact, prodMode: boolean): HttpRoutes {
    return {
      [APPLE_APP_SITE_ASSOCIATION_PATH]: () =>
        WellKnownRoutes.#deepLinkAssociationResponse(APPLE_APP_SITE_ASSOCIATION_PATH, artifact, {
          cacheControl: prodMode ? "public, max-age=3600" : "no-store",
        }) ?? new Response("Not Found", { status: 404 }),
      [ANDROID_ASSET_LINKS_PATH]: () =>
        WellKnownRoutes.#deepLinkAssociationResponse(ANDROID_ASSET_LINKS_PATH, artifact, {
          cacheControl: prodMode ? "public, max-age=3600" : "no-store",
        }) ?? new Response("Not Found", { status: 404 }),
      // Machines fetch these (Chrome asks for com.chrome.devtools.json on every DevTools load): no SSR 404 render.
      // Exact well-known routes (deep links, MCP OAuth metadata) still win — Bun matches static before wildcard.
      "/.well-known/*": () =>
        new Response("Not Found", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        }),
    };
  }

  static #deepLinkAssociationResponse(
    pathname: string,
    artifact: BaseBuildArtifact,
    { cacheControl }: { cacheControl: string },
  ) {
    const associations = artifact.deepLinkAssociations ?? [];
    if (pathname === APPLE_APP_SITE_ASSOCIATION_PATH) {
      const details = associations
        .filter((association) => association.domains.length > 0 && association.iosTeamId && association.iosAppId)
        .map((association) => ({
          appIDs: [`${association.iosTeamId}.${association.iosAppId}`],
          components: [{ "/": "/*" }],
        }));
      if (details.length === 0) return null;
      return WellKnownRoutes.#jsonResponse({ applinks: { apps: [], details } }, cacheControl);
    }
    //? The Android debug buildType appends applicationIdSuffix ".debug"; only a non-main server vouches for it.
    const packageSuffixes = process.env.AKAN_PUBLIC_ENV === "main" ? [""] : ["", ".debug"];
    const assetLinks = associations
      .filter(
        (association) =>
          association.domains.length > 0 &&
          !!association.androidAppId &&
          (association.androidSha256CertFingerprints?.length ?? 0) > 0,
      )
      .flatMap((association) =>
        packageSuffixes.map((suffix) => ({
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: `${association.androidAppId}${suffix}`,
            sha256_cert_fingerprints: association.androidSha256CertFingerprints,
          },
        })),
      );
    if (assetLinks.length === 0) return null;
    return WellKnownRoutes.#jsonResponse(assetLinks, cacheControl);
  }

  static #jsonResponse(body: unknown, cacheControl: string) {
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": cacheControl,
      },
    });
  }
}
