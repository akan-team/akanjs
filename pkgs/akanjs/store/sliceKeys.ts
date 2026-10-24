import { capitalize } from "akanjs/common";
import type { SliceActionKey } from "./sliceRole";
import type { SliceStateKey } from "./state";

export const sliceKeysOf = (refName: string, suffix = "") => {
  const [Model, Suffix] = [capitalize(refName), capitalize(suffix)];
  const state: { [key in SliceStateKey]: string } = {
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
  };
  const action: { [key in SliceActionKey]: string } = {
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
  };
  return { state, action };
};
