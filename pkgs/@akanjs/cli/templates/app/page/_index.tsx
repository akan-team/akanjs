import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "_index.tsx",
    content: `import { page, usePage } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <h1 className="font-bold text-3xl">{l.trans({ en: "Hello, Akan.js", ko: "안녕하세요, Akan.js" })}</h1>
    </main>
  );
});
`,
  };
}
