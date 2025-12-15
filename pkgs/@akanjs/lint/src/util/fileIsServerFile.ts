/* eslint-disable */
const serverFileNameSet = new Set<string>();
const clientFileNameSet = new Set(["st.ts", "store.ts"]);
const serverFileSuffixSet = new Set(["page.tsx", "layout.tsx", "Unit.tsx", "View.tsx"]);
const clientFileSuffixSet = new Set(["Zone.tsx", "Util.tsx", "Template.tsx"]);
export const fileIsServerFile = (absFilePath: string, sourceCode: string): boolean | null => {
  if (absFilePath.includes("eslint-rules")) return true;
  const filePaths = absFilePath.split("/");
  const filename = filePaths.at(-1) ?? "";
  const fileLastName = absFilePath.split(".").slice(-2).join(".");
  if (filename === "page.tsx") {
    if (filePaths.includes("admin")) return false;
    else return true;
  }
  if (filename === "layout.tsx") {
    if (filePaths.at(-2) === "app") return false;
    else return true;
  }
  if (serverFileNameSet.has(filename)) return true;
  if (clientFileNameSet.has(filename)) return false;
  if (serverFileSuffixSet.has(fileLastName)) return true;
  if (clientFileSuffixSet.has(fileLastName)) return false;
  if (new RegExp(/useEffect|useState|useContext|st\.do\.|st\.use\./g).test(sourceCode)) return false;
  return null;
};
