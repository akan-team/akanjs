# `akanjs/client/native/camera`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface CameraApi {
    takePhoto(options?: TakePhotoOptions): Promise<Photo>;
    pickImages(options?: PickImagesOptions): Promise<{
        photos: Photo[];
    }>;
    saveToGallery(args: {
        url: string;
    }): Promise<void>;
    checkPermission(): Promise<{
        camera: PermissionState;
    }>;
    requestPermission(): Promise<{
        camera: PermissionState;
    }>;
}

export type PermissionState = "denied" | "granted" | "prompt";

export interface Photo extends FileRef {
    width?: number;
    height?: number;
}

export interface PickImagesOptions {
    limit?: number;
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
}

export interface TakePhotoOptions {
    source?: "camera" | "library";
    direction?: "front" | "rear";
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
}

export interface UseCamera {
    supported: boolean;
    photo: Photo | null;
    pending: boolean;
    error: AkanNativeError | null;
    takePhoto(options?: TakePhotoOptions): Promise<Photo | null>;
}

export declare const camera: import("akanjs/client/native.ts").Plugin<CameraApi, Record<never, never>>;

export declare function useCamera(): UseCamera;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface FileRef {
    url: string;
    mime: string;
    size: number;
}
```
