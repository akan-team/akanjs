import { describe, expect, test } from "bun:test";
import { enumOf, ID, Int } from "akanjs/base";
import { ConstantRegistry, via } from ".";

class TextFieldTestStatus extends enumOf("textFieldTestStatus", ["active", "archived"] as const) {}

const NotiInput = via((f) => ({
  label: f(String, { text: "title" }),
  channel: f(String, { text: "filter" }),
}));
ConstantRegistry.buildScalar("textFieldTestNoti", NotiInput, { NotiInput });

const OrgInput = via((f) => ({
  orgName: f(String, { text: "title" }),
}));
const OrgObject = via(OrgInput, (f) => ({}));
const OrgLight = via(OrgObject, ["orgName"] as const, (r) => ({}));
const OrgFull = via(OrgObject, OrgLight, (r) => ({}));
const OrgInsight = via(OrgFull, (f) => ({}));
ConstantRegistry.buildModel("textFieldTestOrg", OrgInput, OrgObject, OrgFull, OrgLight, OrgInsight, {
  OrgInput,
  OrgObject,
  OrgFull,
  OrgLight,
  OrgInsight,
});

describe("TextFieldPaths", () => {
  test("collects every role from stored fields", () => {
    const Model = via((f) => ({
      headline: f(String, { text: "title" }),
      summary: f(String, { text: "desc" }),
      keywords: f([String], { text: "tag" }),
      cover: f(ID, { text: "thumb" }),
      team: f(OrgFull, { text: "filter" }),
      untagged: f(String),
    }));

    expect([...Model.text.title]).toEqual(["headline"]);
    expect([...Model.text.desc]).toEqual(["summary"]);
    expect([...Model.text.tag]).toEqual(["keywords"]);
    expect([...Model.text.thumb]).toEqual(["cover"]);
    expect([...Model.text.filter]).toEqual(["team"]);
  });

  test("registers a relation that also declares a text role", () => {
    const Model = via((f) => ({
      team: f(OrgFull, { text: "filter" }),
    }));

    expect(Model.relations.has(OrgFull)).toBe(true);
  });

  test("merges scalar child paths under the parent key", () => {
    const Model = via((f) => ({
      noti: f(NotiInput),
    }));

    expect([...Model.text.children.title]).toEqual(["noti.label"]);
    expect([...Model.text.children.filter]).toEqual(["noti.channel"]);
  });

  test("rejects an indexed child under a secret or hidden parent", () => {
    // `_doc` stores a secret in plaintext, so the mirror would publish `noti.label` even though `noti` itself is
    // never serialised to a client. Checking only the leaf field leaves that whole subtree open.
    expect(() => via((f) => ({ noti: f.secret(NotiInput) }))).toThrow(
      'Text field "noti.label" is under a secret field',
    );
    expect(() => via((f) => ({ noti: f.hidden(NotiInput) }))).toThrow(
      'Text field "noti.label" is under a hidden field',
    );
  });

  test("rejects an indexed child under a nested array", () => {
    expect(() => via((f) => ({ grid: f([[NotiInput]] as never) }))).toThrow(
      'Text field "grid.label" is under a nested array and cannot be indexed',
    );
  });

  test("indexes nothing under a Map, which has no fixed path to extract", () => {
    const Model = via((f) => ({ bag: f(Map, { of: NotiInput }) }));

    expect([...Model.text.children.title]).toEqual([]);
  });

  test("does not recurse into relation fields", () => {
    const Model = via((f) => ({
      org: f(OrgFull),
    }));

    expect([...Model.text.children.title]).toEqual([]);
    expect([...Model.text.title]).toEqual([]);
  });

  test("merges input and object declarations into the full model", () => {
    const Input = via((f) => ({
      headline: f(String, { text: "title" }),
    }));
    const Object_ = via(Input, (f) => ({
      summary: f(String, { text: "desc" }),
    }));
    const Light = via(Object_, ["headline"] as const, (r) => ({}));
    const Full = via(Object_, Light, (r) => ({}));

    expect([...Full.text.title]).toEqual(["headline"]);
    expect([...Full.text.desc]).toEqual(["summary"]);
  });

  test("rejects secret and hidden fields", () => {
    expect(() => via((f) => ({ token: f.secret(String, { text: "title" }) }))).toThrow(
      'Text field "token" is secret and must not be indexed',
    );
    expect(() => via((f) => ({ token: f.hidden(String, { text: "title" }) }))).toThrow(
      'Text field "token" is hidden and must not be indexed',
    );
  });

  test("rejects resolved fields, which never reach _doc", () => {
    const Input = via((f) => ({ headline: f(String) }));
    const Object_ = via(Input, (f) => ({}));
    expect(() => via(Object_, ["headline"] as const, (r) => ({ derived: r(String, { text: "title" }) }))).toThrow(
      'Text field "derived" is resolved and is absent from _doc',
    );
  });

  test("rejects Map fields", () => {
    expect(() => via((f) => ({ bag: f(Map, { of: String, text: "tag" }) }))).toThrow(
      'Text field "bag" is a Map and cannot be indexed',
    );
  });

  test("rejects nested arrays", () => {
    expect(() => via((f) => ({ grid: f([[String]] as never, { text: "tag" }) }))).toThrow(
      'Text field "grid" is a nested array and cannot be indexed',
    );
  });

  test("restricts title, desc, and tag to String", () => {
    expect(() => via((f) => ({ score: f(Int, { text: "title" }) }))).toThrow(
      'Text field "score" declares text: "title", which accepts String',
    );
    expect(() => via((f) => ({ cover: f(ID, { text: "desc" }) }))).toThrow(
      'Text field "cover" declares text: "desc", which accepts String',
    );
    expect(() => via((f) => ({ team: f(OrgFull, { text: "tag" }) }))).toThrow(
      'Text field "team" declares text: "tag", which accepts String',
    );
  });

  test("restricts thumb and filter to String, ID, or a model reference", () => {
    expect([...via((f) => ({ cover: f(ID, { text: "thumb" }) })).text.thumb]).toEqual(["cover"]);
    expect([...via((f) => ({ covers: f([ID], { text: "thumb" }) })).text.thumb]).toEqual(["covers"]);
    expect([...via((f) => ({ team: f(OrgFull, { text: "thumb" }) })).text.thumb]).toEqual(["team"]);
    expect(() => via((f) => ({ at: f(Date, { text: "filter" }) }))).toThrow(
      'Text field "at" declares text: "filter", which accepts String, ID, or a model reference',
    );
    expect(() => via((f) => ({ noti: f(NotiInput, { text: "filter" }) }))).toThrow(
      'Text field "noti" declares text: "filter", which accepts String, ID, or a model reference',
    );
  });

  test("accepts an enum, which is String backed", () => {
    const Model = via((f) => ({
      status: f(TextFieldTestStatus, { text: "filter" }),
    }));
    expect([...Model.text.filter]).toEqual(["status"]);
  });
});
