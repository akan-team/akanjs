export const everyCourt = () => fetch.courtListInPublic(0, 10000); // @flag
export const devicesOfOrg = (orgId: string) => fetch.deviceListInOrg(orgId, 0, 1000); // @flag
export const sortedDevices = (orgId: string) => fetch.deviceListInOrg(orgId, 0, 1000, "latest"); // @flag
export const withPolicy = (orgId: string) => fetch.deviceListInOrg(orgId, 0, 1000, null, { crystalize: false }); // @flag
export const rootList = () => fetch.deviceList(null, 501); // @flag
export const separated = () => fetch.deviceList(undefined, 10_000); // @flag
export const exponent = () => fetch.deviceList(0, 1e4); // @flag
export const namedSkip = (orgId: string, skip: number) => fetch.alertListInOrg(orgId, skip, 2000); // @flag
export const pagedSkip = (orgId: string, page: number) => fetch.alertListInOrg(orgId, (page - 1) * 20, 2000); // @flag
export const afterSliceNumbers = () => fetch.statListInYear(2026, 0, 600); // @flag
export const initInRoute = (orgId: string) => fetch.initDeviceInOrg(orgId, { limit: 1000 }); // @flag
export const initRoot = () => fetch.initDevice({ sort: "latest", limit: 9999 }); // @flag
export const getInit = (orgId: string) => fetch.getDeviceInitInOrg(orgId, { limit: 1000 }); // @flag
export const storeInit = (orgId: string) => st.do.initDeviceInOrg(orgId, { limit: 1000 }); // @flag
export const storeRefresh = () => st.do.refreshDeviceInOrg({ limit: 1000 }); // @flag
export const quotedKey = (orgId: string) => st.do.initDeviceInOrg(orgId, { "limit": 1000 }); // @flag
export const storeSetLimit = () => st.do.setLimitOfDeviceInOrg(1000); // @flag
export const Monitor = () => <button type="button" onClick={() => st.do.setLimitOfAlertInOrg(5000)}>All</button>; // @flag
