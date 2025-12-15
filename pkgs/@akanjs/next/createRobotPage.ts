import { MetadataRoute } from "next";

export const createRobotPage = (clientHttpUri: string, config?: MetadataRoute.Robots): MetadataRoute.Robots => {
  return {
    ...(config ?? {}),
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/admin/",
      ...(config?.rules ?? {}),
    },
    sitemap: `${clientHttpUri}/sitemap.xml`,
  };
};
