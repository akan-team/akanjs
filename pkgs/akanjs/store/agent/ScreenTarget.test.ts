import "../../test/registerDom";
import { beforeEach, describe, expect, test } from "bun:test";
import { ScreenReader } from "./ScreenReader";
import { ScreenTarget } from "./ScreenTarget";

const render = (html: string) => {
  document.body.innerHTML = html;
};

describe("ScreenTarget", () => {
  beforeEach(() => {
    render(`
      <div data-agent-zone="comments">
        <h2>Comments</h2>
        <button data-akan-action="approveComment">Approve</button>
      </div>
      <section data-agent-scope="taskInOrg" id="tasks">
        <h2>Tasks</h2>
        <input data-akan-state="titleOnTask" value="Draft" />
        <button data-akan-action="submitTask">Save</button>
      </section>
    `);
  });

  test("finds a control by the annotation readScreen prints beside it", () => {
    expect(ScreenTarget.find("submitTask")?.textContent).toBe("Save");
    expect(ScreenTarget.find("titleOnTask")?.getAttribute("value")).toBe("Draft");
  });

  test("a page kept mounted under the current one is off screen, so nothing inside it is a target", () => {
    render(`
      <div id="pageContainer-/tasks" inert aria-hidden="true">
        <button data-akan-action="submitTask">Old</button>
        <button data-akan-action="removeTask">Remove</button>
      </div>
      <div id="pageContainer-/task"><button data-akan-action="submitTask">Save</button></div>
    `);
    expect(ScreenTarget.find("submitTask")?.textContent).toBe("Save");
    expect(ScreenTarget.find("removeTask")).toBeNull();
    expect(ScreenTarget.targetNames()).toEqual(["submitTask"]);
  });

  test("finds a container by zone path, scope path, or element id", () => {
    expect(ScreenTarget.container("comments")?.getAttribute("data-agent-zone")).toBe("comments");
    expect(ScreenTarget.container("taskInOrg")?.tagName).toBe("SECTION");
    expect(ScreenTarget.container("tasks")?.tagName).toBe("SECTION");
  });

  test("finds a skipped region by the name its marker prints, so a skipped read is recoverable", () => {
    render('<footer data-agent-skip="site footer"><p>terms body</p></footer>');
    expect(ScreenTarget.container("site footer")?.tagName).toBe("FOOTER");
  });

  test("a zone root scopes the search to its own subtree, itself included", () => {
    const zone = ScreenTarget.container("comments");
    expect(ScreenTarget.find("approveComment", zone)?.textContent).toBe("Approve");
    expect(ScreenTarget.find("submitTask", zone)).toBeNull();
    expect(ScreenTarget.container("comments", zone)).toBe(zone);
  });

  test("a resolved section reads as that part of the screen and nothing else", () => {
    const text = ScreenReader.read(ScreenTarget.container("taskInOrg"));
    expect(text).toContain("## Tasks");
    expect(text).toContain("submitTask");
    expect(text).not.toContain("Comments");
    expect(text).not.toContain("approveComment");
  });

  test("a heading resolves by its own text, and by the slug an agent would write for it", () => {
    render(`
      <div id="images-env"><h2>Images And Public Env</h2><p>public env body</p></div>
      <div id="secret-files"><h2>Secret Files</h2><p>secret body</p></div>
    `);
    expect(ScreenTarget.find("images-and-public-env")?.tagName).toBe("H2");
    expect(ScreenReader.readFrom(ScreenTarget.find("images-and-public-env") as HTMLElement)).toContain(
      "public env body",
    );
    expect(ScreenTarget.heading("Images And Public Env")?.textContent).toBe("Images And Public Env");
    expect(ScreenTarget.heading("images and public env")?.textContent).toBe("Images And Public Env");
    expect(ScreenTarget.heading("secret")?.textContent).toBe("Secret Files");
    expect(ScreenTarget.heading("pricing")).toBeNull();
    expect(ScreenTarget.containerNames()).toEqual(["images-env", "secret-files"]);
  });

  test("a control never resolves by its visible label, and the names on offer are the ones rendered", () => {
    expect(ScreenTarget.control("Save")).toBeNull();
    expect(ScreenTarget.containerNames()).toEqual(["comments", "taskInOrg"]);
    expect(ScreenTarget.anchorNames()).toEqual(["comments", "taskInOrg"]);
    expect(ScreenTarget.targetNames()).toEqual([
      "approveComment",
      "submitTask",
      "titleOnTask",
      "comments",
      "taskInOrg",
    ]);
  });
});
