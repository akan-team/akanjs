import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `
import { MetadataRoute } from "next";
import { env } from "@${dict.appName}/env/env.client";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: \`\${env.clientHttpUri}\`, lastModified: new Date() },
    //
  ];
}
  `;
}
