import { DataList } from "akanjs/base";
import type { DynamicRecord } from "akanjs/common";
import { type BaseInsight, type BaseObject, type ConstantModel, withSharedInstances } from "akanjs/constant";
import type { LiveEventPayload, SerializedSlice } from "akanjs/signal";
import type { sliceKeysOf } from "./sliceKeys";
import type { SetGet } from "./types";

type ModelRow = BaseObject;
interface ListPatchSource {
  cnst: ConstantModel;
  names: { model: string; modelList: string; modelListLoading: string; modelInsight: string };
  slices: { sliceName: string; keys: ReturnType<typeof sliceKeysOf>; slice: SerializedSlice }[];
}

export const makeModelListPatches = ({ cnst, names, slices }: ListPatchSource) => {
  const isLiveSlice = (sliceName: string) => !!slices.find((entry) => entry.sliceName === sliceName)?.slice.live;
  // A live slice places the row through `applyLive`, so the server's echo of this create is not counted twice.
  const createdListPatchOf = (sliceName: string, model: ModelRow, seen: { [key: string]: unknown }) => {
    const listKey = sliceName.replace(names.model, names.modelList);
    if (isLiveSlice(sliceName) || seen[sliceName.replace(names.model, names.modelListLoading)] || !seen[listKey])
      return {};
    const insightKey = sliceName.replace(names.model, names.modelInsight);
    const modelInsight = seen[insightKey] as BaseInsight & { count: number };
    return {
      [listKey]: new DataList([model, ...(seen[listKey] as DataList<ModelRow>)]),
      [insightKey]: new cnst.insight().set({ ...modelInsight, count: modelInsight.count + 1 }),
    };
  };
  function applyLiveCreate(this: SetGet, sliceName: string, model: ModelRow) {
    const target = slices.find((entry) => entry.sliceName === sliceName);
    if (!target?.slice.live) return;
    const applyLive = (this as unknown as DynamicRecord)[target.keys.action.applyLiveModel] as
      | ((event: LiveEventPayload) => void)
      | undefined;
    applyLive?.({ op: "enter", id: model.id, light: new cnst.light().set(model) as unknown as object });
  }
  const updatedListPatchOf = (state: { [key: string]: unknown }, ...updatedModels: ModelRow[]) => {
    const lightModels = withSharedInstances(() =>
      updatedModels.map((updatedModel) => new cnst.light().set(updatedModel) as unknown as ModelRow),
    );
    const patch: { [key: string]: DataList<ModelRow> } = {};
    for (const { keys } of slices) {
      const namesOfSlice = keys.state;
      const modelList = state[namesOfSlice.modelList] as DataList<ModelRow>;
      if (state[namesOfSlice.modelListLoading] || !lightModels.some(({ id }) => modelList.has(id))) continue;
      const nextList = new DataList(modelList);
      for (const lightModel of lightModels) if (nextList.has(lightModel.id)) nextList.set(lightModel);
      patch[namesOfSlice.modelList] = nextList;
    }
    return patch;
  };
  return { createdListPatchOf, applyLiveCreate, updatedListPatchOf };
};
