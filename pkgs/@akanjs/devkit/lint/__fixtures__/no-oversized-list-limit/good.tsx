export const atTheCap = () => fetch.courtListInPublic(0, 500); // @ok
export const onePage = (orgId: string) => fetch.deviceListInOrg(orgId, 0, 20, "latest"); // @ok
export const variableLimit = (orgId: string, limit: number) => fetch.deviceListInOrg(orgId, 0, limit); // @ok
export const everyRowMode = (orgId: string) => fetch.deviceListInOrg(orgId, 0, 0); // @ok
export const yearSlice = () => fetch.statListInYear(2026); // @ok
export const yearAfterId = (orgId: string) => fetch.statListInOrgYear(orgId, 2026); // @ok
export const monthAndYear = () => fetch.statListInMonthOfYear(11, 2026); // @ok
export const twoYears = () => fetch.statListInRange(2025, 2026); // @ok
export const numbersBeforePaging = () => fetch.statListInRange(0, 2026, 0, 20); // @ok
export const numbersWithoutPaging = () => fetch.statListInRange(0, 2026, 0); // @ok
export const notAList = () => fetch.device(0, 1000); // @ok
export const notFetch = () => api.deviceList(0, 1000); // @ok
export const lowercaseList = () => fetch.checklist(0, 1000); // @ok
export const initAtTheCap = (orgId: string) => fetch.initDeviceInOrg(orgId, { limit: 500 }); // @ok
export const rateLimit = (orgId: string) => fetch.initDeviceInOrg(orgId, { rateLimit: 1000 }); // @ok
export const nestedLimit = (orgId: string) => fetch.initDeviceInOrg(orgId, { default: { limit: 1000 } }); // @ok
export const mutationLimit = (id: string) => fetch.updateQuota(id, { limit: 1000 }); // @ok
export const storeWrite = () => st.do.setLimitOnQuota(1000); // @ok
export const storeSetSmallLimit = () => st.do.setLimitOfDeviceInOrg(100); // @ok
export const storeSetPage = () => st.do.setPageOfDeviceInOrg(1000); // @ok
export const policyOnList = (orgId: string) => fetch.deviceListInOrg(orgId, 0, 20, "latest", { limit: 1000 }); // @ok
export const Docs = () => <code>fetch.courtListInPublic(0, 10000)</code>; // @ok
export const sample = "fetch.courtListInPublic(0, 10000)"; // @ok
