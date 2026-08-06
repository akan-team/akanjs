import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AbstractDoc } from "./abstractDoc";
import { AppExecutor, WorkspaceExecutor } from "./executors";

const tempRoots: string[] = [];

const makeApp = async (files: Record<string, string>) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-abstract-doc-"));
  tempRoots.push(root);
  const appName = "abstractDemo";
  for (const [filePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, "apps", appName, filePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }
  const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot: root, repoName: "repo" });
  return AppExecutor.from(workspace, appName);
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("AbstractDoc.kindOf", () => {
  test("reads the module kind off the sys-relative path", () => {
    expect(AbstractDoc.kindOf("lib/user/user.abstract.md")).toBe("domain");
    expect(AbstractDoc.kindOf("lib/_payment/payment.abstract.md")).toBe("service");
    expect(AbstractDoc.kindOf("lib/__scalar/money/money.abstract.md")).toBe("scalar");
    expect(AbstractDoc.kindOf("ui/Editor/editor.abstract.md")).toBe("other");
    expect(AbstractDoc.kindOf("lib/user/nested/user.abstract.md")).toBe("other");
    expect(AbstractDoc.kindOf("lib/__scalar/money.abstract.md")).toBe("other");
  });
});

describe("AbstractDoc.canReplaceWith", () => {
  const doc = new AbstractDoc("lib/user/user.abstract.md", ["# user Abstract", "a", "b", "c", "d", ""].join("\n"), []);

  test("accepts a shorter markdown file", () => {
    expect(doc.canReplaceWith("# user Abstract\nowns users.\n## Rules\n- one rule")).toBe(true);
  });

  test("rejects prose, a longer file, and a stub", () => {
    expect(doc.canReplaceWith("The abstract already meets the requirements.")).toBe(false);
    expect(doc.canReplaceWith(["# user Abstract", "a", "b", "c", "d", "e"].join("\n"))).toBe(false);
    expect(doc.canReplaceWith("# user Abstract\nowns users.")).toBe(false);
  });
});

describe("AbstractDoc.findAll", () => {
  test("finds abstracts across facet folders and filters by module", async () => {
    const app = await makeApp({
      "lib/user/user.abstract.md": "# user Abstract\n",
      "lib/user/user.constant.ts": "export class User {}\n",
      "lib/_payment/payment.abstract.md": "# payment Abstract\n",
      "lib/__scalar/money/money.abstract.md": "# money Abstract\n",
      "ui/Editor/editor.abstract.md": "# Editor Abstract\n",
      "lib/user/user.document.ts": "export class UserModel {}\n",
    });

    const docs = await AbstractDoc.findAll(app);
    expect(docs.map((doc) => doc.path)).toEqual([
      "lib/__scalar/money/money.abstract.md",
      "lib/_payment/payment.abstract.md",
      "lib/user/user.abstract.md",
      "ui/Editor/editor.abstract.md",
    ]);
    expect(docs.map((doc) => doc.kind)).toEqual(["scalar", "service", "domain", "other"]);

    const [userDoc] = await AbstractDoc.findAll(app, { module: "user" });
    expect(userDoc?.siblingFiles.sort()).toEqual(["user.constant.ts", "user.document.ts"]);

    const [serviceDoc] = await AbstractDoc.findAll(app, { module: "_payment" });
    expect(serviceDoc?.path).toBe("lib/_payment/payment.abstract.md");
  });
});
