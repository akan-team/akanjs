"use client";
import { clsx } from "@akanjs/client";
import { capitalize, pathGet } from "@akanjs/common";
import { lazy, useInterval } from "@akanjs/next";
import { Field as AkanField, Modal } from "@akanjs/ui";
import { cnst, fetch, st, usePage } from "@shared/client";
import { MapView, Upload } from "@util/ui";
import { memo, type ReactNode, useCallback, useState } from "react";
import { AiTwotoneEnvironment } from "react-icons/ai";

import { Editor } from "./Editor";

const DaumPostcode = lazy(() => import("react-daum-postcode"), { ssr: false });

interface SlateProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  sliceName: string;
  valuePath: string;
  onChange: (value: unknown) => void;
  addFile: (file: cnst.File | cnst.File[], options?: { idx?: number; limit?: number }) => void;
  placeholder?: string;
  nullable?: boolean;
  disabled?: boolean;
  onPressEnter?: () => void;
  editorHeight?: string;
}
const Slate = memo(
  ({
    label,
    desc,
    labelClassName,
    className,
    sliceName,
    valuePath,
    onChange,
    addFile,
    placeholder,
    nullable,
    disabled,
    onPressEnter,
    editorHeight,
  }: SlateProps) => {
    const { l } = usePage();
    const names = {
      modelForm: `${sliceName}Form`,
      addModelFiles: `add${capitalize(sliceName)}Files`,
    };
    const addModelFiles = fetch[names.addModelFiles] as (fileList: FileList, id?: string) => Promise<cnst.File[]>;
    return (
      <div className={clsx("flex flex-col", className)}>
        {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
        {!disabled ? (
          <Editor.Slate
            defaultValue={pathGet(valuePath, st.get()[names.modelForm as "adminForm"])}
            placeholder={placeholder}
            addFilesGql={addModelFiles}
            addFile={addFile}
            onChange={(val) => {
              onChange(val);
            }}
            disabled={disabled}
            className={clsx("w-full", "")}
            height={editorHeight}
          />
        ) : null}
      </div>
    );
  }
);

interface YooptaProps {
  className?: string;
  readonly?: boolean;
  value: object;
  onChange: (value: any) => void;
}

const Yoopta = ({ className, readonly, value, onChange }: YooptaProps) => {
  return <Editor.Yoopta readOnly={readonly} value={value} onChange={onChange} />;
};

interface CoordinateProps {
  className?: string;
  labelClassName?: string;
  mapClassName?: string;
  disabled?: boolean;
  label?: string;
  desc?: string;
  coordinate: cnst.util.Coordinate | null;
  nullable?: boolean;
  mapKey: string;
  onChange: (coordinate: cnst.util.Coordinate) => void;
}
const Coordinate = ({
  className,
  labelClassName,
  mapClassName,
  disabled,
  label,
  desc,
  nullable,
  coordinate,
  mapKey,
  onChange,
}: CoordinateProps) => {
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <MapView.Google
        mapKey={mapKey}
        className={mapClassName}
        center={coordinate ?? undefined}
        zoom={3}
        onClick={(coordinate) => {
          if (!disabled) onChange(coordinate);
        }}
      >
        {coordinate ? (
          <MapView.Marker coordinate={coordinate}>
            <AiTwotoneEnvironment className="text-2xl" />
          </MapView.Marker>
        ) : null}
      </MapView.Google>
    </div>
  );
};

interface PostcodeProps {
  className?: string;
  label?: string;
  desc?: string;
  labelClassName?: string;
  nullable?: boolean;
  kakaoKey: string;
  address: string | null;
  onChange: ({
    address,
    addressEn,
    zipcode,
    coordinate,
  }: {
    address: string;
    addressEn: string;
    zipcode: string;
    coordinate: cnst.util.Coordinate;
  }) => void;
}
const Postcode = ({ className, labelClassName, nullable, kakaoKey, label, desc, address, onChange }: PostcodeProps) => {
  const [postModalOpen, setPostModalOpen] = useState(false);
  const getCoordinate = useCallback(async (address: string): Promise<cnst.util.Coordinate> => {
    const kakaoResp = (await (
      await window.fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${address}`, {
        headers: {
          authorization: `KakaoAK ${kakaoKey}`,
        },
      })
    ).json()) as { documents?: { x: string; y: string }[] };
    if (!kakaoResp.documents?.[0]) throw new Error("주소를 찾을 수 없습니다.");
    return {
      type: "Point",
      coordinates: [parseFloat(kakaoResp.documents[0].x), parseFloat(kakaoResp.documents[0].y)],
      altitude: 0,
    };
  }, []);
  return (
    <>
      <div className={clsx("flex flex-col", className)}>
        {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
        <input
          value={address ?? ""}
          className="input w-96"
          onClick={() => {
            setPostModalOpen(true);
          }}
        />
      </div>
      <Modal
        open={postModalOpen}
        onCancel={() => {
          setPostModalOpen(false);
        }}
        bodyClassName="p-0"
        title="주소 선택"
      >
        <div className="size-full">
          <DaumPostcode
            onClose={() => {
              setPostModalOpen(false);
            }}
            onComplete={({ address, addressEnglish: addressEn, zonecode: zipcode }) => {
              void getCoordinate(address).then((coordinate) => {
                onChange({ address, addressEn, zipcode, coordinate });
              });
            }}
          />
        </div>
      </Modal>
    </>
  );
};

interface ImageProps {
  label?: string;
  desc?: string;
  styleType?: "circle" | "square";
  labelClassName?: string;
  uploadClassName?: string;
  className?: string;
  nullable?: boolean;
  sliceName: string;
  value: cnst.File | null;
  render?: (file: cnst.File) => ReactNode;
  onChange: (file: cnst.File | null) => void;
  disabled?: boolean;
  aspectRatio?: number[];
}
const Img = ({
  label,
  desc,
  styleType = "circle",
  labelClassName,
  uploadClassName,
  className,
  render,
  nullable,
  value,
  sliceName,
  onChange,
  disabled,
  aspectRatio,
}: ImageProps) => {
  const names = {
    addModelFiles: `add${capitalize(sliceName)}Files`,
  };
  const addFiles = fetch[names.addModelFiles] as (fileList: FileList | File[], id?: string) => Promise<cnst.File[]>;
  useInterval(async () => {
    if (value?.status !== "uploading") return;
    onChange(await fetch.file(value.id));
  }, 1000);
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Upload.Image
        className={uploadClassName}
        type="image"
        styleType={styleType}
        aspectRatio={aspectRatio}
        protoFile={value}
        onSave={async (file) => {
          const files = file instanceof FileList ? await addFiles(file) : await addFiles([file]);
          onChange(files[0]);
        }}
        onRemove={() => {
          onChange(null);
        }}
      />
    </div>
  );
};

interface ImagesProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  sliceName: string;
  render?: (file: cnst.File) => ReactNode;
  value: cnst.File[];
  onChange: (files: cnst.File[]) => void;
  disabled?: boolean;
  minlength?: number;
  maxlength?: number;
}

const Imgs = ({
  className,
  label,
  desc,
  labelClassName,
  render,
  value,
  onChange,
  sliceName,
  minlength = 1,
  maxlength = 30,
  disabled,
}: ImagesProps) => {
  const names = {
    addModelFiles: `add${capitalize(sliceName)}Files`,
  };
  const addFiles = fetch[names.addModelFiles] as (fileList: FileList | File[], id?: string) => Promise<cnst.File[]>;
  useInterval(async () => {
    if (!value.length) return;
    const uploadingFiles = value.filter((f) => f.status === "uploading");
    if (!uploadingFiles.length) return;
    const newFiles = await Promise.all(uploadingFiles.map(async (f) => await fetch.file(f.id)));
    onChange(value.map((f) => newFiles.find((nf) => nf.id === f.id) ?? f));
  }, 1000);
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={!!minlength} label={label} desc={desc} /> : null}
      <Upload.Images
        multiple
        fileList={value}
        disabled={disabled}
        render={render}
        styleType="square"
        onRemove={(file: File | FileList) => {
          onChange(value.filter((f) => f.id !== (file as unknown as cnst.File).id));
        }}
        onSave={async (file) => {
          //! Max Length 처리해야함.
          const files = file instanceof FileList ? await addFiles(file) : await addFiles([file]);
          onChange([...value, ...files]);
        }}
      />
    </div>
  );
};

interface FileProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  uploadClassName?: string;
  render?: (file: cnst.File) => ReactNode;
  sliceName: string;
  nullable?: boolean;
  value: cnst.File | null;
  onChange: (file: cnst.File | null) => void;
  disabled?: boolean;
}
const File = ({
  label,
  desc,
  labelClassName,
  uploadClassName,
  className,
  render,
  nullable,
  value,
  onChange,
  sliceName,
  disabled,
}: FileProps) => {
  const names = {
    addModelFiles: `add${capitalize(sliceName)}Files`,
  };
  const addFiles = fetch[names.addModelFiles] as (fileList: FileList | File[], id?: string) => Promise<cnst.File[]>;
  useInterval(async () => {
    if (value?.status !== "uploading") return;
    onChange(await fetch.file(value.id));
  }, 1000);
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Upload.File
        render={render}
        uploadClassName={uploadClassName}
        disabled={disabled}
        file={value}
        onRemove={() => {
          onChange(null);
        }}
        onChange={async (file) => {
          const files = file instanceof FileList ? await addFiles(file) : await addFiles([file]);
          onChange(files[0]);
        }}
      />
    </div>
  );
};

interface FilesProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  sliceName: string;
  render?: (file: cnst.File) => ReactNode;
  value: cnst.File[];
  onChange: (files: cnst.File[]) => void;
  disabled?: boolean;
  minlength?: number;
  maxlength?: number;
}

const Files = ({
  className,
  label,
  desc,
  labelClassName,
  render,
  value,
  onChange,
  sliceName,
  minlength = 1,
  maxlength = 30,
  disabled,
}: FilesProps) => {
  const names = {
    addModelFiles: `add${capitalize(sliceName)}Files`,
  };
  const addFiles = fetch[names.addModelFiles] as (fileList: FileList | File[], id?: string) => Promise<cnst.File[]>;
  useInterval(async () => {
    if (!value.length) return;
    const uploadingFiles = value.filter((f) => f.status === "uploading");
    if (!uploadingFiles.length) return;
    const newFiles = await Promise.all(uploadingFiles.map(async (f) => await fetch.file(f.id)));
    onChange(value.map((f) => newFiles.find((nf) => nf.id === f.id) ?? f));
  }, 1000);
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={!!minlength} label={label} desc={desc} /> : null}
      <Upload.FileList
        multiple
        disabled={disabled}
        render={render}
        fileList={value}
        onRemove={(file: cnst.File) => {
          onChange(value.filter((f) => f.id !== file.id));
        }}
        onChange={async (file) => {
          //! Max Length 처리해야함.
          if (maxlength && value.length + (file instanceof FileList ? file.length : 1) > maxlength) return;
          const files =
            file instanceof FileList ? await addFiles([...(file as File[])]) : await addFiles([file as File]);
          onChange([...value, ...files]);
        }}
      />
    </div>
  );
};

export const Field = Object.assign(AkanField, { Slate, Yoopta, Coordinate, Postcode, Img, Imgs, File, Files });
