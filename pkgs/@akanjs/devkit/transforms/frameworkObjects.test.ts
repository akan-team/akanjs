import { describe, expect, test } from "bun:test";

describe("framework objects on the server", () => {
  test("a server component renders Field.Text, Layout.Header, Model.View and Dialog.LegacyModal, each its member's own client reference", async () => {
    const proc = Bun.spawn(
      [process.execPath, "--conditions", "react-server", `${import.meta.dir}/frameworkObjects.fixture.tsx`],
      { cwd: import.meta.dir, env: { ...process.env, NODE_ENV: "production" }, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    expect({ exit: await proc.exited, stderr }).toEqual({ exit: 0, stderr: "" });

    expect(JSON.parse(stdout)).toEqual({
      references: [
        "pkgs/akanjs/ui/Dialog/LegacyModal.tsx#LegacyModal",
        "pkgs/akanjs/ui/Dialog/Provider.tsx#Provider",
        "pkgs/akanjs/ui/Field/Label.tsx#Label",
        "pkgs/akanjs/ui/Field/Text.tsx#Text",
        "pkgs/akanjs/ui/Layout/Header.tsx#Header",
        "pkgs/akanjs/ui/Model/View.tsx#default",
      ],
      serverMarkup: true,
      errors: [],
    });
  }, 60_000);
});
