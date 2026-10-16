export class TaskStore { async reload(orgId: string) { await fetch.initTaskInOrg(orgId); } } // @flag
