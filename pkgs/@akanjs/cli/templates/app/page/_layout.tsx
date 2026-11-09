import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict, options: { libs: string[] }) {
  const isUsingShared = options.libs.includes("shared");
  const rendered = isUsingShared
    ? `(
      <>
        {children}
        <Auth.User />
        <Auth.Admin />
      </>
    )`
    : "<>{children}</>";
  return {
    filename: "_layout.tsx",
    content: `import "./styles.css";
${isUsingShared ? 'import { Auth } from "@libs/shared/ui";\n' : ""}import { rootLayout } from "akanjs/client";

export default rootLayout()
  .theme("light")
  .head(<title>${dict.appName}</title>)
  .render(({ children }) => {
    return ${rendered};
  });
`,
  };
}
