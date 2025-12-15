export const getFilename = (absFilePath: string): string => {
  const filePaths = absFilePath.split("/");
  return filePaths.at(-1) ?? "";
};
