export const getAppName = (filePaths: string[]) => {
  const appsIdx = filePaths.findIndex((part) => part === "apps");
  const appName = appsIdx === -1 ? null : filePaths[appsIdx + 1];
  return appName;
};
