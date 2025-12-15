import fs from "fs";
import { imageSize } from "image-size";

export const getImageSize = async (filePathOrBuffer: string | Buffer) => {
  try {
    const buffer =
      typeof filePathOrBuffer === "string" ? await fs.promises.readFile(filePathOrBuffer) : filePathOrBuffer;
    const { width, height } = imageSize(buffer);
    return [width, height];
  } catch (error) {
    return [0, 0];
  }
};
