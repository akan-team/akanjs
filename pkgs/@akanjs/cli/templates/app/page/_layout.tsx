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
  .fonts([
    {
      name: "pretendard",
      default: true,
      subsets: ["latin", "ks-x-1001"],
      paths: [
        { src: "/fonts/Pretendard-Regular.woff2", weight: 400 },
        { src: "/fonts/Pretendard-Medium.woff2", weight: 500 },
        { src: "/fonts/Pretendard-SemiBold.woff2", weight: 600 },
        { src: "/fonts/Pretendard-Bold.woff2", weight: 700 },
      ],
    },
  ])
  .theme("light")
  .head(<title>${dict.appName}</title>)
  .render(({ children }) => {
    return ${rendered};
  });
`,
  };
}
