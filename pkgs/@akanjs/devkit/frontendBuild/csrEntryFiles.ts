import path from "node:path";
import type { PageEntry } from "../artifact/implicitRootLayout";

//* The CSR entry file of each basePath's HTML, shared by the CSR artifact and the dev registry. Apart from both
//* builders so the resident dev builder names entries without loading the artifact builder's CSS compiler (tailwindcss).
export class CsrEntryFiles {
  static entryFilename(basePath: string): string {
    return `${basePath || "index"}.csr.tsx`;
  }

  static pageEntriesForBasePath(pageEntries: PageEntry[], basePath: string, basePaths: string[]): PageEntry[] {
    return pageEntries.filter((entry) => {
      const entryBasePath = CsrEntryFiles.basePathOfPageKey(entry.key, basePaths);
      return entryBasePath === null || entryBasePath === basePath;
    });
  }

  static basePathOfPageKey(pageKey: string, basePaths: string[]): string | null {
    const normalized = pageKey.split(path.sep).join("/").replace(/^\.\//, "");
    const segments = normalized.split("/");
    const firstPublicSegment = segments.find((segment) => segment !== "[lang]" && !/^\(.+\)$/.test(segment));
    return firstPublicSegment && basePaths.includes(firstPublicSegment) ? firstPublicSegment : null;
  }
}
