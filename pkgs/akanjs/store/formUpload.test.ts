import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { resetEnvCache, SLICE_META } from "akanjs/base";
import { ConstantRegistry, type ProtoFile, via } from "akanjs/constant";
import type { ClientSignal } from "akanjs/fetch";
import { formUploadOf } from "./formUploadOf";
import { store } from "./store";
import { setTestEnv } from "./store.fixture";
import { StoreInstance } from "./storeInstance";
import { StoreRegistry } from "./storeRegistry";

const FileInput = via((f) => ({ url: f(String), status: f(String) }));
const FileObj = via(FileInput, () => ({}));
const LightFile = via(FileObj, ["url", "status"] as const, () => ({}));
const UpFile = via(FileObj, LightFile, () => ({}));
const FileInsight = via(UpFile, () => ({}));
ConstantRegistry.buildModel("upFile", FileInput, FileObj, UpFile, LightFile, FileInsight, {});

const PostInput = via((f) => ({
  title: f(String),
  image: f(UpFile).optional(),
  images: f([UpFile]),
  attachments: f([UpFile]).optional(),
}));
const PostObj = via(PostInput, () => ({}));
const LightPost = via(PostObj, ["title"] as const, () => ({}));
const Post = via(PostObj, LightPost, () => ({}));
const PostInsight = via(Post, () => ({}));
const postConstant = ConstantRegistry.buildModel("upPost", PostInput, PostObj, Post, LightPost, PostInsight, {});

interface Deferred {
  resolve: (files: ProtoFile[]) => void;
  reject: (error: Error) => void;
}
type State = { [key: string]: any };
interface Instance {
  get: () => State;
  set: (patch: State) => void;
  do: { [key: string]: (...args: any[]) => Promise<void> };
  subscribe: (listener: () => void) => () => void;
}

const fileOf = (id: string, status = "active") => ({ id, url: `/f/${id}`, status }) as unknown as ProtoFile;
const idsOf = (files: ProtoFile[] | null) => (files ?? []).map((file) => file.id);
const picked = [new File(["a"], "a.png")];
let rootIndex = 0;

const makeInstance = () => {
  const uploads: Deferred[] = [];
  const reads: string[] = [];
  const fileStatus = new Map<string, string>();
  const reading: { hold: boolean } = { hold: false };
  const saved: unknown[] = [];
  const postSets: unknown[] = [];
  const handlers: { [key: string]: unknown } = {
    serializedSignal: { upFile: { endpoint: { addFiles: { fileUpload: true } } } },
    addUpPostFiles: () =>
      new Promise<ProtoFile[]>((resolve, reject) => {
        uploads.push({ resolve, reject });
      }),
    createUpPost: async (data: unknown) => {
      saved.push(data);
      return { id: "saved", ...(data as object) };
    },
    updateUpPost: async (id: string, data: unknown) => {
      saved.push(data);
      return { id, ...(data as object) };
    },
    upFile: (id: string) => {
      reads.push(id);
      if (reading.hold) return new Promise(() => undefined);
      return Promise.resolve(fileOf(id, fileStatus.get(id) ?? "active"));
    },
  };
  const fetch = new Proxy(handlers, { get: (target, key: string) => (target[key] ??= async () => null) });
  const signal = {
    refName: "upPost",
    _slice: { [SLICE_META]: {} },
    cnst: postConstant,
    fetch,
    serializedSignal: { prefix: "upPost", endpoint: {}, slice: { "": { args: [] } } },
    slices: [],
  } as unknown as ClientSignal<"upPost">;
  class UpPostStore extends store(signal, () => ({})) {
    _postSetImage(value: unknown) {
      postSets.push(value);
    }
  }
  StoreRegistry.register(UpPostStore);
  rootIndex += 1;
  const instance = new StoreInstance(StoreRegistry.merge(`uploadRoot${rootIndex}`, UpPostStore)) as unknown as Instance;
  void instance.do.newUpPost({ title: "x" });
  return { instance, uploads, reads, fileStatus, reading, saved, postSets, UpPostStore, state: () => instance.get() };
};

beforeEach(() => {
  setTestEnv("uploadtest");
  resetEnvCache();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("upload<Field>On<Model> pending state", () => {
  test("a field holds a ticket while its upload is in flight and is cleared when it lands", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    expect(state().upPostFormUploading.image).toHaveLength(1);
    expect(state().upPostFormUploading.images).toBeUndefined();
    uploads[0]?.resolve([fileOf("f1")]);
    await done;
    expect(state().upPostFormUploading).toEqual({});
    expect(state().upPostForm.image.id).toBe("f1");
  });

  test("a failed upload releases its ticket, even after the form moved to another record", async () => {
    const { instance, uploads, state } = makeInstance();
    const first = instance.do.uploadImagesOnUpPost(picked);
    uploads[0]?.reject(new Error("network"));
    await expect(first).rejects.toThrow("network");
    expect(state().upPostFormUploading).toEqual({});
    const second = instance.do.uploadImagesOnUpPost(picked);
    instance.do.writeOnUpPost("id", "other");
    uploads[1]?.reject(new Error("network"));
    await expect(second).rejects.toThrow("network");
    expect(state().upPostFormUploading).toEqual({});
    expect(state().upPostForm.images).toEqual([]);
  });

  test("a result for another record releases its ticket without writing", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImagesOnUpPost(picked);
    instance.do.writeOnUpPost("id", "other");
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state().upPostFormUploading).toEqual({});
    expect(state().upPostForm.images).toEqual([]);
  });

  test("check<Model>Submitable keeps submit disabled while an upload is in flight", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    await instance.do.checkUpPostSubmitable();
    expect(state().upPostSubmit.disabled).toBe(true);
    uploads[0]?.resolve([fileOf("f1")]);
    await done;
    await instance.do.checkUpPostSubmitable();
    expect(state().upPostSubmit.disabled).toBeFalsy();
  });

  test("a subscriber never sees the field idle before the uploaded file is in the form", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    const seenWhenIdle: unknown[] = [];
    const unsubscribe = instance.subscribe(() => {
      if (!state().upPostFormUploading.image) seenWhenIdle.push(state().upPostForm.image?.id ?? null);
    });
    uploads[0]?.resolve([fileOf("f1")]);
    await done;
    unsubscribe();
    expect(seenWhenIdle[0]).toBe("f1");
  });
});

describe("upload<Field>On<Model> scoping", () => {
  test("setting a File field with nothing pending leaves the uploading state as it was", async () => {
    const { instance, state } = makeInstance();
    const before = state().upPostFormUploading;
    await instance.do.setImageOnUpPost(fileOf("mine"));
    expect(state().upPostFormUploading).toBe(before);
  });

  test("a result that lands after the form was reset is dropped", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    await instance.do.resetUpPost();
    expect(state().upPostFormUploading).toEqual({});
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state().upPostForm.image).toBeNull();
  });

  test("a result that lands after the whole form was set is dropped, even with the same empty id", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    await instance.do.setUpPostForm({ ...state().upPostForm, title: "replacement" });
    expect(state().upPostFormUploading).toEqual({});
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state().upPostForm.title).toBe("replacement");
    expect(state().upPostForm.image).toBeNull();
  });

  test("a result that lands after a new form was opened is dropped", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    await instance.do.newUpPost({ title: "second" });
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state().upPostForm.image).toBeNull();
  });

  test("on a single field an older upload finishing last does not overwrite the newer pick", async () => {
    const { instance, uploads, state } = makeInstance();
    const first = instance.do.uploadImageOnUpPost(picked);
    const second = instance.do.uploadImageOnUpPost(picked);
    uploads[1]?.resolve([fileOf("newer")]);
    await second;
    uploads[0]?.resolve([fileOf("older")]);
    await first;
    expect(state().upPostForm.image.id).toBe("newer");
    expect(state().upPostFormUploading).toEqual({});
  });

  test("an explicit set of a single field wins over an upload still in flight", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    await instance.do.setImageOnUpPost(null);
    expect(state().upPostFormUploading).toEqual({});
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state().upPostForm.image).toBeNull();
  });

  test("an explicit set of an array field keeps its uploads, which land in the new list", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImagesOnUpPost(picked);
    await instance.do.setImagesOnUpPost([fileOf("chosen")]);
    expect(state().upPostFormUploading.images).toHaveLength(1);
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(idsOf(state().upPostForm.images)).toEqual(["chosen", "late"]);
  });

  test("a nullable array cleared to null during an upload takes the result as its first item", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadAttachmentsOnUpPost(picked);
    await instance.do.setAttachmentsOnUpPost(null);
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(idsOf(state().upPostForm.attachments)).toEqual(["late"]);
  });

  test("an array field inserts into the list as it is when the upload lands", async () => {
    const { instance, uploads, state } = makeInstance();
    const a = instance.do.uploadImagesOnUpPost(picked);
    const b = instance.do.uploadImagesOnUpPost(picked);
    expect(state().upPostFormUploading.images).toHaveLength(2);
    await instance.do.addImagesOnUpPost(fileOf("added"));
    uploads[1]?.resolve([fileOf("b")]);
    await b;
    expect(state().upPostFormUploading.images).toHaveLength(1);
    uploads[0]?.resolve([fileOf("a")]);
    await a;
    expect(idsOf(state().upPostForm.images)).toEqual(["added", "b", "a"]);
    expect(state().upPostFormUploading).toEqual({});
  });
});

describe("_postSet<Field> after an upload", () => {
  test("runs with the written file once the result lands, and not for a dropped result", async () => {
    const { instance, uploads, postSets } = makeInstance();
    const first = instance.do.uploadImageOnUpPost(picked);
    const second = instance.do.uploadImageOnUpPost(picked);
    uploads[1]?.resolve([fileOf("newer")]);
    await second;
    uploads[0]?.resolve([fileOf("older")]);
    await first;
    expect(postSets.map((value) => (value as ProtoFile).id)).toEqual(["newer"]);
  });
});

describe("saving while an upload is in flight", () => {
  test("create<Model>InForm and a direct submit<Model> save nothing until the upload lands", async () => {
    const { instance, uploads, saved, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    await instance.do.createUpPostInForm();
    await instance.do.submitUpPost();
    expect(saved).toEqual([]);
    uploads[0]?.resolve([fileOf("f1")]);
    await done;
    await instance.do.submitUpPost();
    expect(saved).toHaveLength(1);
    expect(state().upPostFormUploading).toEqual({});
  });

  test("update<Model>InForm saves nothing until the upload lands", async () => {
    const { instance, uploads, saved } = makeInstance();
    instance.do.writeOnUpPost("id", "aaaaaaaaaaaaaaaaaaaaaaaa");
    const done = instance.do.uploadImageOnUpPost(picked);
    await instance.do.updateUpPostInForm();
    expect(saved).toEqual([]);
    uploads[0]?.resolve([fileOf("f1")]);
    await done;
    await instance.do.updateUpPostInForm();
    expect(saved).toHaveLength(1);
  });
});

describe("whole-form sets outside the generated actions", () => {
  test("an edit shell hydrating the form drops the upload", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    const hydrated = { ...state().upPostForm, title: "from server" };
    instance.set({ upPost: hydrated, upPostForm: hydrated, upPostFormLoading: false, upPostModal: "edit" });
    expect(state().upPostFormUploading).toEqual({});
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state().upPostForm.image).toBeNull();
  });

  test("restoring a draft drops the upload", async () => {
    const { instance, uploads, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    const form = { ...state().upPostForm, title: "from draft" };
    instance.set({
      upPostFormDraft: {
        key: "k",
        baseHash: "",
        baseUpdatedAt: null,
        pending: { savedAt: new Date(), form },
        appliedAt: null,
      },
    });
    expect(state().upPostFormUploading.image).toHaveLength(1);
    await instance.do.restoreUpPostFormDraft();
    expect(state().upPostFormUploading).toEqual({});
    uploads[0]?.resolve([fileOf("late")]);
    await done;
    expect(state().upPostForm.title).toBe("from draft");
    expect(state().upPostForm.image).toBeNull();
  });
});

describe("formUploadOf", () => {
  test("answers the form's upload action for a generated File setter, and nothing for anything else", async () => {
    const { UpPostStore } = makeInstance();
    StoreRegistry.instance.addStore(StoreRegistry.merge(`uploadRegistryRoot${rootIndex}`, UpPostStore));
    const registry = StoreRegistry.instance as unknown as Instance;
    await registry.do.newUpPost({ title: "x" });
    const field = formUploadOf(registry.do.setImageOnUpPost);
    expect(field).not.toBeNull();
    void field?.upload(picked);
    expect(registry.get().upPostFormUploading.image).toHaveLength(1);
    expect(formUploadOf(registry.do.setTitleOnUpPost)).toBeNull();
    expect(formUploadOf(() => undefined)).toBeNull();
  });

  const registryWith = async () => {
    const made = makeInstance();
    StoreRegistry.instance.addStore(StoreRegistry.merge(`uploadRefreshRoot${rootIndex}`, made.UpPostStore));
    const registry = StoreRegistry.instance as unknown as Instance;
    await registry.do.newUpPost({ title: "x" });
    return { ...made, registry };
  };

  test("refresh keeps an array upload that landed while the refresh was in flight", async () => {
    const { registry, uploads } = await registryWith();
    await registry.do.setImagesOnUpPost([fileOf("a", "uploading")]);
    const field = formUploadOf(registry.do.setImagesOnUpPost);
    const landing = field?.upload(picked);
    uploads[uploads.length - 1]?.resolve([fileOf("b")]);
    await landing;
    field?.refresh([fileOf("a", "active")]);
    expect(registry.get().upPostForm.images.map((file: ProtoFile) => [file.id, file.status])).toEqual([
      ["a", "active"],
      ["b", "active"],
    ]);
  });

  test("refresh leaves a single field alone once it holds a newer pick", async () => {
    const { registry } = await registryWith();
    await registry.do.setImageOnUpPost(fileOf("a", "uploading"));
    const field = formUploadOf(registry.do.setImageOnUpPost);
    await registry.do.setImageOnUpPost(fileOf("b"));
    field?.refresh([fileOf("a", "active")]);
    expect(registry.get().upPostForm.image.id).toBe("b");
  });

  test("refresh updates the file the field still holds without releasing a pending upload", async () => {
    const { registry } = await registryWith();
    await registry.do.setImageOnUpPost(fileOf("a", "uploading"));
    const field = formUploadOf(registry.do.setImageOnUpPost);
    void field?.upload(picked);
    field?.refresh([fileOf("a", "active")]);
    expect(registry.get().upPostForm.image.status).toBe("active");
    expect(registry.get().upPostFormUploading.image).toHaveLength(1);
  });

  test("answers nothing for a custom setter beside a custom upload action", () => {
    class AvatarStore extends store("avatarOnly" as const, () => ({ avatar: null as unknown })) {
      setAvatar(value: unknown) {
        this.set({ avatar: value });
      }
      uploadAvatar() {}
    }
    StoreRegistry.register(AvatarStore);
    StoreRegistry.instance.addStore(StoreRegistry.merge(`avatarRoot${rootIndex}`, AvatarStore));
    const registry = StoreRegistry.instance as unknown as Instance;
    expect(formUploadOf(registry.do.setAvatar)).toBeNull();
  });
});

describe("upload status poll", () => {
  const flush = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  };

  test("reads nothing once the field no longer holds the file, even while a read is pending", async () => {
    jest.useFakeTimers();
    const { instance, uploads, reads, reading, state } = makeInstance();
    const done = instance.do.uploadImageOnUpPost(picked);
    uploads[0]?.resolve([fileOf("f1", "uploading")]);
    await done;
    reading.hold = true;
    jest.advanceTimersByTime(3000);
    await flush();
    expect(reads).toEqual(["f1"]);
    await instance.do.setImageOnUpPost(fileOf("mine"));
    jest.advanceTimersByTime(9000);
    await flush();
    expect(reads).toEqual(["f1"]);
    expect(state().upPostForm.image.id).toBe("mine");
  });

  test("keeps updating the file while the field still holds it", async () => {
    jest.useFakeTimers();
    const { instance, uploads, fileStatus, state } = makeInstance();
    fileStatus.set("f1", "active");
    const done = instance.do.uploadImagesOnUpPost(picked);
    uploads[0]?.resolve([fileOf("f1", "uploading")]);
    await done;
    jest.advanceTimersByTime(3000);
    await flush();
    expect(state().upPostForm.images[0].status).toBe("active");
  });
});
