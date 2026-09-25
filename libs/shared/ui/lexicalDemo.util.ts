import type { cnst } from "@libs/shared/client";

export const mockAddFilesGql = async (fileList: FileList) => {
  const file = fileList[0];
  return [
    {
      id: `mock-${file.name}-${file.size}`,
      url: URL.createObjectURL(file),
      filename: file.name,
      size: file.size,
      mimetype: file.type,
      imageSize: [0, 0],
      status: "active",
      progress: 100,
    },
  ] as unknown as cnst.File[];
};
