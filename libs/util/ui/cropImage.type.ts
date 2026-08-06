export interface CropRef {
  getCropImage: () => Promise<string | null | undefined>;
  getFileStream: () => Promise<File | undefined>;
  downloadCroppedImage: () => Promise<void>;
}
