export const createImage = async (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve(image);
    });
    image.addEventListener("error", (error) => {
      reject(error);
    });
    //? Without it a cross-origin image taints the canvas and toBlob throws.
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
