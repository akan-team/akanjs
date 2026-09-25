export const getImageSize = async (filePathOrBuffer: string | Buffer): Promise<[number, number]> => {
  try {
    const { width, height } = await new Bun.Image(filePathOrBuffer).metadata();
    return [width, height];
  } catch {
    return [0, 0];
  }
};
