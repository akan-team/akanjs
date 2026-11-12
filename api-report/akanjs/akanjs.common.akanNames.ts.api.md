# `akanjs/common/akanNames.ts`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const databaseStateNames: (refName: string) => {
    model: string;
    modelLoading: string;
    modelForm: string;
    modelFormLoading: string;
    modelFormUploading: string;
    modelSubmit: string;
    modelViewAt: string;
    modelModal: string;
    modelDraft: string;
    modelOperation: string;
    defaultModel: string;
};

export declare const endpointNames: (key: string) => {
    subscribe: string;
    listen: string;
};

export declare const formSetterNames: (className: string, key: string) => {
    field: string;
    Field: string;
    setFieldOnModel: string;
    addFieldOnModel: string;
    subFieldOnModel: string;
    addOrSubFieldOnModel: string;
    moveFieldOnModel: string;
    uploadFieldOnModel: string;
    postSetField: string;
};

export declare const modelNames: (refName: string) => {
    getModel: string;
    loadModel: string;
    loadModelMany: string;
    createModel: string;
    createModelMany: string;
    updateModel: string;
    removeModel: string;
    modelModel: string;
    modelLoader: string;
    modelCache: string;
    modelId: string;
    lightModel: string;
    viewModel: string;
    getModelView: string;
    modelView: string;
    editModel: string;
    getModelEdit: string;
    modelEdit: string;
    modelObj: string;
    modelObjList: string;
    modelObjInsight: string;
    addModelFiles: string;
    mergeModel: string;
    createModelInForm: string;
    updateModelInForm: string;
    checkModelSubmitable: string;
    submitModel: string;
    newModel: string;
    setModel: string;
    resetModel: string;
    invalidateModel: string;
    loadModelFormDraft: string;
    restoreModelFormDraft: string;
    discardModelFormDraft: string;
    writeOnModel: string;
    setViewOfModel: string;
    exportCsvOfModel: string;
    exportJsonOfModel: string;
    model: string;
    modelLoading: string;
    modelForm: string;
    modelFormLoading: string;
    modelFormUploading: string;
    modelSubmit: string;
    modelViewAt: string;
    modelModal: string;
    modelDraft: string;
    modelOperation: string;
    defaultModel: string;
};

export declare const moduleNames: (refName: string) => {
    service: string;
    ServiceClass: string;
    SliceClass: string;
    ModelClass: string;
    FilterClass: string;
    SignalClass: string;
    InternalClass: string;
    EndpointClass: string;
};

export declare const queryNames: (queryKey: string) => {
    list: string;
    listIds: string;
    find: string;
    findId: string;
    pick: string;
    pickId: string;
    exists: string;
    count: string;
    insight: string;
    query: string;
    remove: string;
    removeOne: string;
    purge: string;
    update: string;
    updateOne: string;
};

export declare const sliceNames: (refName: string, suffix?: string) => {
    slice: string;
    state: {
        defaultModel: string;
        modelInitList: string;
        modelInsight: string;
        modelList: string;
        modelListLoading: string;
        modelInitAt: string;
        modelStaleAt: string;
        lastPageOfModel: string;
        pageOfModel: string;
        limitOfModel: string;
        hasMoreOfModel: string;
        isCumulativeOfModel: string;
        hasInsightOfModel: string;
        queryArgsOfModel: string;
        sortOfModel: string;
        modelSelection: string;
    };
    action: {
        initModel: string;
        refreshModel: string;
        selectModel: string;
        setPageOfModel: string;
        loadMoreOfModel: string;
        setLimitOfModel: string;
        setQueryArgsOfModel: string;
        setSortOfModel: string;
        applyLiveModel: string;
        watchLiveModel: string;
    };
    endpoint: {
        list: string;
        insight: string;
        live: string;
        subscribeLive: string;
        init: string;
        getInit: string;
        initResult: string;
    };
};

export declare const stateSetterName: (key: string) => string;
```
