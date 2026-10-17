import { afterEach, describe, expect, jest, test } from "bun:test";
import { ConstantRegistry, type ProtoFile, via } from "akanjs/constant";
import type { FetchProxy } from "akanjs/fetch";
import { makeActions, makeFormSetter } from "./action";
import { createDatabaseState } from "./state";

const FileInput = via((f) => ({ url: f(String), status: f(String) }));
const FileObj = via(FileInput, () => ({}));
const LightFile = via(FileObj, ["url", "status"] as const, () => ({}));
const UpFile = via(FileObj, LightFile, () => ({}));
const FileInsight = via(UpFile, () => ({}));
ConstantRegistry.buildModel("upFile", FileInput, FileObj, UpFile, LightFile, FileInsight, {});

const PostInput = via((f) => ({ title: f(String), image: f(UpFile).optional(), images: f([UpFile]) }));
const PostObj = via(PostInput, () => ({}));
const LightPost = via(PostObj, ["title"] as const, () => ({}));
const Post = via(PostObj, LightPost, () => ({}));
const PostInsight = via(Post, () => ({}));
ConstantRegistry.buildModel("upPost", PostInput, PostObj, Post, LightPost, PostInsight, {});

interface Deferred {
  resolve: (files: ProtoFile[]) => void;
  reject: (error: Error) => void;
}
type Actions = { [key: string]: (...args: any[]) => any };
type State = { [key: string]: any };

const fileOf = (id: string, status = "active") => ({ id, url: `/f/${id}`, status }) as unknown as ProtoFile;

const contextOf = () => {
  const uploads: Deferred[] = [];
  const reads: string[] = [];
  const fileStatus = new Map<string, string>();
  const fetch = {
    serializedSignal: { upFile: { endpoint: { addFiles: { fileUpload: true } } } },
    addUpPostFiles: () =>
      new Promise<ProtoFile[]>((resolve, reject) => {
        uploads.push({ resolve, reject });
      }),
    upFile: async (id: string) => {
      reads.push(id);
      return fileOf(id, fileStatus.get(id) ?? "active");
    },
  } as unknown as FetchProxy<unknown>;
  const state: State = {
    ...createDatabaseState("upPost"),
    defaultUpPost: new Post(),
    upPostForm: { id: "", title: "x", image: null, images: [] },
  };
  const ctx = {
    ...(makeFormSetter("upPost", fetch) as unknown as Actions),
    ...(makeActions("upPost", {}, fetch) as unknown as Actions),
    set: (recipe: unknown) => {
      if (typeof recipe === "function") (recipe as (draft: State) => void)(state);
      else Object.assign(state, recipe);
    },
    get: () => state,
  } as Actions & { set: (recipe: unknown) => void; get: () => State };
  const call = (name: string, ...args: unknown[]) => (ctx[name] as (...a: unknown[]) => unknown).call(ctx, ...args);
  return { state, uploads, reads, fileStatus, call };
};

const picked = [new File(["a"], "a.png")];

afterEach(() => {
  jest.useRealTimers();
});

describe("upload<Field>On<Model> pending state", () => {
  test("a field holds a ticket while its upload is in flight and is cleared when it lands", async () => {
    const { state, uploads, call } = contextOf();
    const done = call("uploadImageOnUpPost", picked) as Promise<void>;
    expect(state.upPostFormUploading.image).toHaveLength(1);
    expect(state.upPostFormUploading.images).toBeUndefined();
    uploads[0]?.resolve([fileOf("f1")]);
    await done;
    expect(state.upPostFormUploading).toEqual({});
    expect(state.upPostForm.image.id).toBe("f1");
  });

  test("a failed upload releases its ticket and still rejects", async () => {
    const { state, uploads, call } = contextOf();
    const done = call("uploadImagesOnUpPost", picked) as Promise<void>;
    uploads[0]?.reject(new Error("network"));
    await expect(done).rejects.toThrow("network");
    expect(state.upPostFormUploading).toEqual({});
    expect(state.upPostForm.images).toEqual([]);
  });

  test("check<Model>Submitable keeps submit disabled while an upload is in flight", async () => {
    const { state, uploads, call } = contextOf();
    const done = call("uploadImageOnUpPost", picked) as Promise<void>;
    call("checkUpPostSubmitable");
    expect(state.upPostSubmit.disabled).toBe(true);
    uploads[0]?.resolve([fileOf("f1")]);
    await done;
    call("checkUpPostSubmitable");
    expect(state.upPostSubmit.disabled).toBeFalsy();
  });
});

describe("upload<Field>On<Model> scoping", () => {
  test("a result that lands after the form was reset is dropped", async () => {
    const { state, uploads, call } = contextOf();
    const done = call("uploadImageOnUpPost", picked) as Promise<void>;
    call("resetUpPost");
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state.upPostForm.image).toBeNull();
    expect(state.upPostFormUploading).toEqual({});
  });

  test("a result that lands after the form moved to another record is dropped", async () => {
    const { state, uploads, call } = contextOf();
    const done = call("uploadImagesOnUpPost", picked) as Promise<void>;
    state.upPostForm = { id: "other", title: "y", image: null, images: [fileOf("kept")] };
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state.upPostForm.images.map((file: ProtoFile) => file.id)).toEqual(["kept"]);
  });

  test("on a single field an older upload finishing last does not overwrite the newer pick", async () => {
    const { state, uploads, call } = contextOf();
    const first = call("uploadImageOnUpPost", picked) as Promise<void>;
    const second = call("uploadImageOnUpPost", picked) as Promise<void>;
    uploads[1]?.resolve([fileOf("newer")]);
    await second;
    uploads[0]?.resolve([fileOf("older")]);
    await first;
    expect(state.upPostForm.image.id).toBe("newer");
    expect(state.upPostFormUploading).toEqual({});
  });

  test("an explicit set of the field wins over an upload still in flight", async () => {
    const { state, uploads, call } = contextOf();
    const done = call("uploadImageOnUpPost", picked) as Promise<void>;
    call("setImageOnUpPost", null);
    expect(state.upPostFormUploading).toEqual({});
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state.upPostForm.image).toBeNull();
  });

  test("an explicit set of an array field keeps its uploads, which land in the new list", async () => {
    const { state, uploads, call } = contextOf();
    const done = call("uploadImagesOnUpPost", picked) as Promise<void>;
    call("setImagesOnUpPost", [fileOf("chosen")]);
    expect(state.upPostFormUploading.images).toHaveLength(1);
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state.upPostForm.images.map((file: ProtoFile) => file.id)).toEqual(["chosen", "late"]);
  });

  test("an array field inserts into the list as it is when the upload lands", async () => {
    const { state, uploads, call } = contextOf();
    const a = call("uploadImagesOnUpPost", picked) as Promise<void>;
    const b = call("uploadImagesOnUpPost", picked) as Promise<void>;
    expect(state.upPostFormUploading.images).toHaveLength(2);
    call("addImagesOnUpPost", fileOf("added"));
    uploads[1]?.resolve([fileOf("b")]);
    await b;
    expect(state.upPostFormUploading.images).toHaveLength(1);
    uploads[0]?.resolve([fileOf("a")]);
    await a;
    expect(state.upPostForm.images.map((file: ProtoFile) => file.id)).toEqual(["added", "b", "a"]);
    expect(state.upPostFormUploading).toEqual({});
  });
});

describe("upload status poll", () => {
  test("stops updating a single field once the field holds another file", async () => {
    jest.useFakeTimers();
    const { state, uploads, reads, fileStatus, call } = contextOf();
    fileStatus.set("f1", "uploading");
    const done = call("uploadImageOnUpPost", picked) as Promise<void>;
    uploads[0]?.resolve([fileOf("f1", "uploading")]);
    await done;
    call("setImageOnUpPost", fileOf("mine"));
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
    expect(reads).toEqual(["f1"]);
    expect(state.upPostForm.image.id).toBe("mine");
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    expect(reads).toEqual(["f1"]);
  });

  test("keeps updating the file while the field still holds it", async () => {
    jest.useFakeTimers();
    const { state, uploads, fileStatus, call } = contextOf();
    fileStatus.set("f1", "uploading");
    const done = call("uploadImageOnUpPost", picked) as Promise<void>;
    uploads[0]?.resolve([fileOf("f1", "uploading")]);
    await done;
    fileStatus.set("f1", "active");
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
    expect(state.upPostForm.image.status).toBe("active");
  });
});
