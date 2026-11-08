import { capitalize, lowerlize } from "./capitalize";

// `@akanjs/language` bundles this file into a CommonJS editor core: it must import nothing but `./capitalize`.

export const sliceNames = (refName: string, suffix = "") => {
  const [Model, Suffix] = [capitalize(refName), capitalize(suffix)];
  const live = `${refName}Live${Suffix}`;
  return {
    slice: `${refName}${Suffix}`,
    state: {
      defaultModel: `default${Model}${Suffix}`,
      modelInitList: `${refName}InitList${Suffix}`,
      modelInsight: `${refName}Insight${Suffix}`,
      modelList: `${refName}List${Suffix}`,
      modelListLoading: `${refName}ListLoading${Suffix}`,
      modelInitAt: `${refName}InitAt${Suffix}`,
      modelStaleAt: `${refName}StaleAt${Suffix}`,
      lastPageOfModel: `lastPageOf${Model}${Suffix}`,
      pageOfModel: `pageOf${Model}${Suffix}`,
      limitOfModel: `limitOf${Model}${Suffix}`,
      hasMoreOfModel: `hasMoreOf${Model}${Suffix}`,
      isCumulativeOfModel: `isCumulativeOf${Model}${Suffix}`,
      hasInsightOfModel: `hasInsightOf${Model}${Suffix}`,
      queryArgsOfModel: `queryArgsOf${Model}${Suffix}`,
      sortOfModel: `sortOf${Model}${Suffix}`,
      modelSelection: `${refName}Selection${Suffix}`,
    },
    action: {
      initModel: `init${Model}${Suffix}`,
      refreshModel: `refresh${Model}${Suffix}`,
      selectModel: `select${Model}${Suffix}`,
      setPageOfModel: `setPageOf${Model}${Suffix}`,
      loadMoreOfModel: `loadMoreOf${Model}${Suffix}`,
      setLimitOfModel: `setLimitOf${Model}${Suffix}`,
      setQueryArgsOfModel: `setQueryArgsOf${Model}${Suffix}`,
      setSortOfModel: `setSortOf${Model}${Suffix}`,
      applyLiveModel: `applyLive${Model}${Suffix}`,
      watchLiveModel: `watchLive${Model}${Suffix}`,
    },
    endpoint: {
      list: `${refName}List${Suffix}`,
      insight: `${refName}Insight${Suffix}`,
      live,
      subscribeLive: endpointNames(live).subscribe,
      init: `init${Model}${Suffix}`,
      getInit: `get${Model}Init${Suffix}`,
      initResult: `${refName}Init${Suffix}`,
    },
  };
};

export const queryNames = (queryKey: string) => {
  const Key = capitalize(queryKey);
  return {
    list: `list${Key}`,
    listIds: `listIds${Key}`,
    find: `find${Key}`,
    findId: `findId${Key}`,
    pick: `pick${Key}`,
    pickId: `pickId${Key}`,
    exists: `exists${Key}`,
    count: `count${Key}`,
    insight: `insight${Key}`,
    query: `query${Key}`,
    remove: `remove${Key}`,
    removeOne: `removeOne${Key}`,
    purge: `purge${Key}`,
    update: `update${Key}`,
    updateOne: `updateOne${Key}`,
  };
};

export const databaseStateNames = (refName: string) => {
  const className = capitalize(refName);
  return {
    model: refName,
    modelLoading: `${refName}Loading`,
    modelForm: `${refName}Form`,
    modelFormLoading: `${refName}FormLoading`,
    modelFormUploading: `${refName}FormUploading`,
    modelSubmit: `${refName}Submit`,
    modelViewAt: `${refName}ViewAt`,
    modelModal: `${refName}Modal`,
    modelDraft: `${refName}FormDraft`,
    modelOperation: `${refName}Operation`,
    defaultModel: `default${className}`,
  };
};

export const modelNames = (refName: string) => {
  const Model = capitalize(refName);
  return {
    ...databaseStateNames(refName),
    getModel: `get${Model}`,
    loadModel: `load${Model}`,
    loadModelMany: `load${Model}Many`,
    createModel: `create${Model}`,
    createModelMany: `create${Model}Many`,
    updateModel: `update${Model}`,
    removeModel: `remove${Model}`,
    modelModel: `${refName}Model`,
    modelLoader: `${refName}Loader`,
    modelCache: `${refName}Cache`,
    modelId: `${refName}Id`,
    lightModel: `light${Model}`,
    viewModel: `view${Model}`,
    getModelView: `get${Model}View`,
    modelView: `${refName}View`,
    editModel: `edit${Model}`,
    getModelEdit: `get${Model}Edit`,
    modelEdit: `${refName}Edit`,
    modelObj: `${refName}Obj`,
    modelObjList: `${refName}ObjList`,
    modelObjInsight: `${refName}ObjInsight`,
    addModelFiles: `add${Model}Files`,
    mergeModel: `merge${Model}`,
    createModelInForm: `create${Model}InForm`,
    updateModelInForm: `update${Model}InForm`,
    checkModelSubmitable: `check${Model}Submitable`,
    submitModel: `submit${Model}`,
    newModel: `new${Model}`,
    setModel: `set${Model}`,
    resetModel: `reset${Model}`,
    invalidateModel: `invalidate${Model}`,
    loadModelFormDraft: `load${Model}FormDraft`,
    restoreModelFormDraft: `restore${Model}FormDraft`,
    discardModelFormDraft: `discard${Model}FormDraft`,
    writeOnModel: `writeOn${Model}`,
    setViewOfModel: `setViewOf${Model}`,
    exportCsvOfModel: `exportCsvOf${Model}`,
    exportJsonOfModel: `exportJsonOf${Model}`,
  };
};

export const moduleNames = (refName: string) => {
  const Model = capitalize(refName);
  return {
    service: `${refName}Service`,
    ServiceClass: `${Model}Service`,
    SliceClass: `${Model}Slice`,
    ModelClass: `${Model}Model`,
    FilterClass: `${Model}Filter`,
    SignalClass: `${Model}Signal`,
    InternalClass: `${Model}Internal`,
    EndpointClass: `${Model}Endpoint`,
  };
};

// Built forward from the field: `set(.+)On(.+)` has several readings when a field or model name contains `On`.
export const formSetterNames = (className: string, key: string) => {
  const classKeyName = capitalize(key);
  return {
    field: lowerlize(key),
    Field: classKeyName,
    setFieldOnModel: `set${classKeyName}On${className}`,
    addFieldOnModel: `add${classKeyName}On${className}`,
    subFieldOnModel: `sub${classKeyName}On${className}`,
    addOrSubFieldOnModel: `addOrSub${classKeyName}On${className}`,
    // An agent tool only; no store action answers to it.
    moveFieldOnModel: `move${classKeyName}On${className}`,
    uploadFieldOnModel: `upload${classKeyName}On${className}`,
    // No model suffix: a subclass cannot override a generated mapped-type property (TS2425), so the name must differ.
    postSetField: `_postSet${classKeyName}`,
  };
};

export const stateSetterName = (key: string) => `set${capitalize(key)}`;

export const endpointNames = (key: string) => {
  const Key = capitalize(key);
  return { subscribe: `subscribe${Key}`, listen: `listen${Key}` };
};
