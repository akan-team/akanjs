import type { AppInfo, LibInfo } from "akanjs";

interface Dict {
  migrationId: string;
  title: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return `import { migration } from "akanjs/server";

export default migration(${JSON.stringify(dict.title)})
  .plan(async ({ table }) => {
    // TODO: count the rows apply changes, and list each decision a person approves
    return { summary: {}, items: [] };
  })
  .apply(async ({ table }, { items }) => {
    // TODO: write through table(refName), so every change is logged and a rollback can undo it
  })
  .verify(async ({ table }) => {
    // TODO: one line per row apply left wrong; none means the data is as intended
    return [];
  });
`;
}
