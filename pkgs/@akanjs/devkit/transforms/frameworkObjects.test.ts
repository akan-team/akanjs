import { describe, expect, test } from "bun:test";
import path from "node:path";
import { ObjectMemberImports } from "./objectMemberImports";
import { hasUseClientDirective } from "./rscUseClientTransform";

const ui = path.resolve(import.meta.dir, "../../../akanjs/ui");

describe("framework objects on the server", () => {
  test("a server component renders Field, Layout.Header, Model.View and Dialog.LegacyModal, each a client reference", async () => {
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
        "pkgs/akanjs/ui/Field/index.tsx#Field",
        "pkgs/akanjs/ui/Layout/Header.tsx#Header",
        "pkgs/akanjs/ui/Model/View.tsx#default",
      ],
      errors: [],
    });
  }, 60_000);

  test("a server file naming Field.Text and Field.Switch imports each from its own client file", async () => {
    const objects = new ObjectMemberImports({ resolve: ObjectMemberImports.resolverOf(async () => null) });
    const result = await objects.rewrite(
      [
        `import { Field } from ${JSON.stringify(path.join(ui, "Field/index.tsx"))};`,
        `export const Page = () => <><Field.Text value="Ada" /><Field.Switch value /></>;`,
      ].join("\n"),
      path.join(import.meta.dir, "page.tsx"),
    );

    const imported = await Promise.all(
      [...(result?.contents ?? "").matchAll(/import \{ (\w+) as [\w$]+ \} from "([^"]+)";/g)].map(
        async ([, name, file]) => [
          name,
          path.relative(ui, file as string),
          hasUseClientDirective(await Bun.file(file as string).text()),
        ],
      ),
    );
    expect(imported).toEqual([
      ["Text", "Field/Text.tsx", true],
      ["Switch", "Field/Choice.tsx", true],
    ]);
    expect(result?.kept).toEqual([]);
  });
});
