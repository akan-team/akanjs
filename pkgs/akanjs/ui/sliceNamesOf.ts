import { modelNames, sliceNames } from "akanjs/common";

export const sliceNamesOf = (model: string, sliceName: string) => {
  const { state, action } = sliceNames(model);
  const {
    modelId,
    modelObjList,
    modelObjInsight,
    newModel,
    editModel,
    viewModel,
    removeModel,
    setViewOfModel,
    exportCsvOfModel,
    exportJsonOfModel,
  } = modelNames(model);
  const names = {
    ...state,
    ...action,
    model,
    modelId,
    modelObjList,
    modelObjInsight,
    newModel,
    editModel,
    viewModel,
    removeModel,
    setViewOfModel,
    exportCsvOfModel,
    exportJsonOfModel,
  };
  const namesOfSlice = Object.fromEntries(
    Object.entries(names).map(([key, name]) => [key, sliceName.replace(model, name)]),
  ) as typeof names;
  return { names, namesOfSlice };
};
