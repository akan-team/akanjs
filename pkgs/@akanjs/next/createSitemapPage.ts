import { MetadataRoute } from "next";

const lastModified = new Date();
export const createSitemapPage = (clientHttpUri: string, paths: string[]): MetadataRoute.Sitemap => {
  return paths.map((path) => ({ url: `${clientHttpUri}${path}`, lastModified }));
};
