import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { ServiceLoopCallScanner } from "./serviceLoopCallScanner";

const scan = (body: string, answersCaller: (method: string) => boolean = () => true) =>
  new ServiceLoopCallScanner().scan(
    ts.createSourceFile(
      "court.service.ts",
      `export class CourtService extends serve(db.court, () => ({})) {\n${body}\n}\n`,
      ts.ScriptTarget.Latest,
      true,
    ),
    answersCaller,
  );

describe("ServiceLoopCallScanner", () => {
  test("names a service, model or generated query called per item, directly or through a method of its own", () => {
    const calls = scan(`  async syncAll(ids: string[]) {
    for (const id of await this.listIds()) await this.pcService.ping(id);
    await Promise.all(ids.map((id) => this.#touch(id)));
    ids.forEach((id) => this.logger.info(id));
  }
  async #touch(id: string) {
    await this.getCourt(id);
  }`);

    expect(calls).toEqual([{ method: "syncAll", line: 3, calls: ["this.pcService.ping", "this.#touch"] }]);
  });

  test("spares a counted loop, a call made once, and a method no endpoint reaches", () => {
    const body = `  async retry(id: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) await this.courtModel.touch(id);
    while (await this.courtModel.isLocked(id)) await Bun.sleep(10);
  }
  async sweep(ids: string[]) {
    const courts = await this.loadCourtMany(ids);
    for (const court of courts) court.touch();
    await Promise.all(ids.map((id) => this.pcService.ping(id)));
  }`;

    expect(scan(body, (method) => method === "retry")).toEqual([]);
  });

  test("spares a get or load a per-element callback issues in one tick, which the DataLoader batches", () => {
    const calls = scan(`  async courtsOf(ids: string[], pcIds: string[]) {
    await Promise.all(ids.map((id) => this.getCourt(id)));
    await Promise.all(pcIds.map((id) => this.pcModel.loadPc(id)));
    await Promise.all(ids.map((id) => this.courtModel.countCourt({ id })));
    for (const id of ids) await this.courtModel.getCourt(id);
  }`);

    expect(calls).toEqual([
      { method: "courtsOf", line: 5, calls: ["this.courtModel.countCourt", "this.courtModel.getCourt"] },
    ]);
  });
});
