"use client";
import { cnst, Err, fetch, st } from "@libs/shared/client";
import { type GoogleProps, inputRecipe, MapView, Upload } from "@libs/util/ui";
import { cn } from "akanjs/client";
import { capitalize, pathGet } from "akanjs/common";
import type { ProtoFile, ProtoLightFile } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";
import { actionTagOf, useFieldTool, useFileFieldTool } from "akanjs/store";
import { Field as AkanField, Modal } from "akanjs/ui";
import { lazy, useInterval } from "akanjs/webkit";
import { memo, type ReactNode, useCallback, useState } from "react";
import { AiTwotoneEnvironment } from "react-icons/ai";

import { Editor } from "./Editor";
import type { RichProps } from "./field.type";

const DaumPostcode = lazy(() => import("react-daum-postcode"), { ssr: false });

const Rich = memo((props: RichProps) => {
  const hasValue = Object.hasOwn(props, "value");
  const {
    label,
    desc,
    labelClassName,
    className,
    slice,
    valuePath,
    value,
    onChange,
    addFile,
    addFilesGql,
    attachments,
    onAttachmentsChange,
    onUploadError,
    uploadPolicy,
    toolbar,
    blockActions,
    slashMenu,
    markdown,
    features,
    placeholder,
    nullable,
    disabled,
    editorHeight,
    plugins,
    agentName,
    agentBlocks,
    collab,
  } = props;
  // No useFieldTool here: it cannot describe an Any field, so AgentRichPlugin publishes this setter as markdown.
  const agentAction = agentName ?? actionTagOf(onChange)?.action ?? null;
  const { sliceName } = slice;
  const names = {
    modelForm: `${sliceName}Form`,
    addModelFiles: `add${capitalize(sliceName)}Files`,
  };
  const addModelFiles = (addFilesGql ??
    (fetch as unknown as Record<string, (...args: unknown[]) => unknown>)[names.addModelFiles]) as (
    fileList: FileList,
    id?: string,
  ) => Promise<(cnst.File | ProtoFile)[]>;
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Editor.Rich
        value={hasValue ? value : pathGet(valuePath, st.get()[names.modelForm as "adminForm"])}
        placeholder={placeholder}
        addFilesGql={addModelFiles}
        addFile={addFile}
        attachments={attachments}
        onAttachmentsChange={onAttachmentsChange}
        onUploadError={onUploadError}
        uploadPolicy={uploadPolicy}
        toolbar={toolbar}
        blockActions={blockActions}
        slashMenu={slashMenu}
        markdown={markdown}
        features={features}
        onChange={(val) => {
          onChange(val);
        }}
        disabled={disabled}
        className={cn("w-full", "")}
        height={editorHeight}
        plugins={plugins}
        agentName={agentAction}
        agentBlocks={agentBlocks}
        collab={collab}
      />
    </div>
  );
});

interface CoordinateProps {
  className?: string;
  labelClassName?: string;
  mapClassName?: string;
  disabled?: boolean;
  label?: string;
  desc?: string;
  coordinate: cnst.util.Coordinate | null;
  nullable?: boolean;
  mapKey?: string;
  mapOptions?: GoogleProps["options"];
  onChange: (coordinate: cnst.util.Coordinate) => void;
}
export const Coordinate = ({
  className,
  labelClassName,
  mapClassName,
  disabled,
  label,
  desc,
  nullable,
  coordinate,
  mapKey,
  mapOptions,
  onChange,
}: CoordinateProps) => {
  useFieldTool(onChange);
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      {mapKey ? (
        <MapView.Google
          mapKey={mapKey}
          className={mapClassName}
          center={coordinate ?? undefined}
          zoom={3}
          options={mapOptions}
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
      ) : (
        <MapView.PigeonMap
          className={cn("h-72 w-full", mapClassName)}
          center={coordinate ?? undefined}
          zoom={3}
          onClick={(coordinate) => {
            if (!disabled) onChange(coordinate);
          }}
        >
          {coordinate ? (
            <MapView.PigeonMarker className="z-10" coordinate={coordinate}>
              <AiTwotoneEnvironment className="text-2xl" />
            </MapView.PigeonMarker>
          ) : null}
        </MapView.PigeonMap>
      )}
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
export const Postcode = ({
  className,
  labelClassName,
  nullable,
  kakaoKey,
  label,
  desc,
  address,
  onChange,
}: PostcodeProps) => {
  useFieldTool(onChange);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const getCoordinate = useCallback(async (address: string): Promise<cnst.util.Coordinate> => {
    const kakaoResp = (await (
      await window.fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${address}`, {
        headers: {
          authorization: `KakaoAK ${kakaoKey}`,
        },
      })
    ).json()) as { documents?: { x: string; y: string }[] };
    if (!kakaoResp.documents?.[0]) throw new Err("shared.error.addressNotFound");
    return new cnst.util.Coordinate({
      type: "Point",
      coordinates: [parseFloat(kakaoResp.documents[0].x), parseFloat(kakaoResp.documents[0].y)],
      altitude: 0,
    });
  }, []);
  return (
    <>
      <div className={cn("flex flex-col", className)}>
        {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
        <input
          value={address ?? ""}
          className={inputRecipe({}, "w-96")}
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

interface ImgProps<T extends cnst.LightFile> {
  label?: string;
  desc?: string;
  styleType?: "circle" | "square";
  labelClassName?: string;
  uploadClassName?: string;
  className?: string;
  nullable?: boolean;
  slice: SliceMeta;
  value: T | null;
  render?: (file: T) => ReactNode;
  onChange: (file: T | null) => void;
  /**
   * 대화가 이 칸에 넣을 수 있는 그림. 넘기지 않으면 에이전트 도구가 아예 안 선다 — 후보가 없는 칸에
   * 모든 id 를 거절하는 도구가 서면 안 된다(`useFileFieldTool`).
   */
  read?: () => readonly T[];
  disabled?: boolean;
  aspectRatio?: number[];
}
export const Img = <T extends cnst.LightFile = cnst.File>({
  label,
  desc,
  styleType = "circle",
  labelClassName,
  uploadClassName,
  className,
  render,
  nullable,
  value,
  slice,
  onChange,
  read,
  disabled,
  aspectRatio,
}: ImgProps<T>) => {
  useFieldTool(onChange);
  useFileFieldTool(onChange, { read, label: (file) => file.filename, disabled });
  const { sliceName } = slice;
  const names = {
    addModelFiles: `add${capitalize(sliceName)}Files`,
  };
  const addFiles = (fetch as unknown as Record<string, (...args: unknown[]) => unknown>)[names.addModelFiles] as (
    fileList: FileList | File[],
    id?: string,
  ) => Promise<T[]>;
  useInterval(async () => {
    if (value?.status !== "uploading") return;
    onChange((await fetch.file(value.id)) as unknown as T);
  }, 1000);
  return (
    <div className={cn("flex flex-col", className)}>
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

interface ImgsProps<T extends cnst.LightFile> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  slice: SliceMeta;
  render?: (file: T) => ReactNode;
  value: T[];
  onChange: (files: T[]) => void;
  /**
   * 대화가 이 칸에 넣을 수 있는 그림. 넘기지 않으면 에이전트 도구가 아예 안 선다 — 후보가 없는 칸에
   * 모든 id 를 거절하는 도구가 서면 안 된다(`useFileFieldTool`).
   */
  read?: () => readonly T[];
  disabled?: boolean;
  minlength?: number;
  maxlength?: number;
}

export const Imgs = <T extends cnst.LightFile = cnst.File>({
  className,
  label,
  desc,
  labelClassName,
  render,
  value,
  onChange,
  slice,
  read,
  minlength,
  maxlength,
  disabled,
}: ImgsProps<T>) => {
  useFieldTool(onChange);
  useFileFieldTool(onChange, { read, label: (file) => file.filename, min: minlength, max: maxlength, disabled });
  const { sliceName } = slice;
  const names = {
    addModelFiles: `add${capitalize(sliceName)}Files`,
  };
  const addFiles = (fetch as unknown as Record<string, (...args: unknown[]) => unknown>)[names.addModelFiles] as (
    fileList: FileList | File[],
    id?: string,
  ) => Promise<T[]>;
  useInterval(async () => {
    if (!value.length) return;
    const uploadingFiles = value.filter((f) => f.status === "uploading");
    if (!uploadingFiles.length) return;
    const newFiles = await Promise.all(uploadingFiles.map(async (f) => (await fetch.file(f.id)) as unknown as T));
    onChange(value.map((f) => newFiles.find((nf) => nf.id === f.id) ?? f));
  }, 1000);
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? (
        <AkanField.Label className={labelClassName} nullable={!!(minlength ?? 1)} label={label} desc={desc} />
      ) : null}
      <Upload.Images
        multiple
        fileList={value}
        disabled={disabled}
        render={render as unknown as (file: ProtoLightFile) => ReactNode}
        styleType="square"
        onRemove={(file: File | FileList) => {
          onChange(value.filter((f) => f.id !== (file as unknown as ProtoLightFile).id));
        }}
        onSave={async (file) => {
          // TODO: Max Length 처리해야함.
          const files = file instanceof FileList ? await addFiles(file) : await addFiles([file]);
          onChange([...value, ...files]);
        }}
      />
    </div>
  );
};

interface FileProps<T extends cnst.LightFile> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  uploadClassName?: string;
  render?: (file: T) => ReactNode;
  slice: SliceMeta;
  nullable?: boolean;
  value: T | null;
  onChange: (file: T | null) => void;
  disabled?: boolean;
  accept?: string;
}
export const File = <T extends cnst.LightFile = cnst.File>({
  label,
  desc,
  labelClassName,
  uploadClassName,
  className,
  render,
  nullable,
  value,
  onChange,
  slice,
  disabled,
  accept,
}: FileProps<T>) => {
  useFieldTool(onChange);
  const { sliceName } = slice;
  const names = {
    addModelFiles: `add${capitalize(sliceName)}Files`,
  };
  const addFiles = (fetch as unknown as Record<string, (...args: unknown[]) => unknown>)[names.addModelFiles] as (
    fileList: FileList | File[],
    id?: string,
  ) => Promise<T[]>;
  useInterval(async () => {
    if (value?.status !== "uploading") return;
    onChange((await fetch.file(value.id)) as unknown as T);
  }, 1000);
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Upload.File
        render={render as unknown as (file: ProtoLightFile) => ReactNode}
        uploadClassName={uploadClassName}
        disabled={disabled}
        accept={accept}
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

interface FilesProps<T extends cnst.LightFile> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  slice: SliceMeta;
  render?: (file: T) => ReactNode;
  value: T[];
  onChange: (files: T[]) => void;
  disabled?: boolean;
  minlength?: number;
  maxlength?: number;
}

export const Files = <T extends cnst.LightFile = cnst.File>({
  className,
  label,
  desc,
  labelClassName,
  render,
  value,
  onChange,
  slice,
  minlength = 1,
  maxlength = 30,
  disabled,
}: FilesProps<T>) => {
  useFieldTool(onChange);
  const { sliceName } = slice;
  const names = {
    addModelFiles: `add${capitalize(sliceName)}Files`,
  };
  const addFiles = (fetch as unknown as Record<string, (...args: unknown[]) => unknown>)[names.addModelFiles] as (
    fileList: FileList | File[],
    id?: string,
  ) => Promise<T[]>;
  useInterval(async () => {
    if (!value.length) return;
    const uploadingFiles = value.filter((f) => f.status === "uploading");
    if (!uploadingFiles.length) return;
    const newFiles = await Promise.all(uploadingFiles.map(async (f) => (await fetch.file(f.id)) as unknown as T));
    onChange(value.map((f) => newFiles.find((nf) => nf.id === f.id) ?? f));
  }, 1000);
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={!!minlength} label={label} desc={desc} /> : null}
      <Upload.FileList
        multiple
        disabled={disabled}
        render={render as unknown as (file: ProtoLightFile) => ReactNode}
        fileList={value}
        onRemove={(file: ProtoLightFile) => {
          onChange(value.filter((f) => f.id !== file.id));
        }}
        onChange={async (file) => {
          // TODO: Max Length 처리해야함.
          if (maxlength && value.length + (file instanceof FileList ? file.length : 1) > maxlength) return;
          const files =
            file instanceof FileList ? await addFiles([...(file as File[])]) : await addFiles([file as File]);
          onChange([...value, ...files]);
        }}
      />
    </div>
  );
};

export const Field = Object.assign(AkanField, { Rich, Coordinate, Postcode, Img, Imgs, File, Files });
