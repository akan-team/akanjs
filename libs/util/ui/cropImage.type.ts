export interface CropRef {
  getCropImage: () => Promise<Blob | null>;
  getFileStream: () => Promise<File | undefined>;
  downloadCroppedImage: () => Promise<void>;
}
