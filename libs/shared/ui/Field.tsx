"use client";
import { cnst, Err, fetch, msg, usePage } from "@libs/shared/client";
import { type GoogleProps, inputRecipe, MapView, Upload } from "@libs/util/ui";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { ProtoFile, ProtoLightFile } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";
import { actionTagOf, useFieldTool, useFileFieldTool } from "akanjs/store";
import { Field as AkanField, Modal } from "akanjs/ui";
import { lazy, useInterval } from "akanjs/webkit";
import { type ComponentProps, memo, type ReactNode, useCallback, useState } from "react";
import { AiTwotoneEnvironment } from "react-icons/ai";

import { Editor } from "./Editor";
import type { RichProps } from "./field.type";

const DaumPostcode = lazy(() => import("react-daum-postcode"), { ssr: false });

type SliceUpload = (fileList: FileList | File[], parentId?: string) => Promise<ProtoFile[]>;

const sliceUploadOf = (slice: SliceMeta) =>
  (fetch as unknown as Record<string, SliceUpload>)[`add${capitalize(slice.sliceName)}Files`];

const filesOf = (files: File | File[] | FileList) =>
  files instanceof FileList ? [...files] : Array.isArray(files) ? files : [files];

const uploaderOf =
  <T extends cnst.LightFile>(slice: SliceMeta) =>
  async (files: File | File[] | FileList) =>
    (await sliceUploadOf(slice)(filesOf(files))) as unknown as T[];

const useUploadPoll = <T extends cnst.LightFile>(files: T[], onUpdate: (updatedFiles: T[]) => void) => {
  useInterval(async () => {
    const uploadingFiles = files.filter((file) => file.status === "uploading");
    if (!uploadingFiles.length) return;
    onUpdate(await Promise.all(uploadingFiles.map(async (file) => (await fetch.file(file.id)) as unknown as T)));
  }, 1000);
};

const replaced = <T extends cnst.LightFile>(files: T[], updatedFiles: T[]) =>
  files.map((file) => updatedFiles.find((updatedFile) => updatedFile.id === file.id) ?? file);

const Rich = memo(
  ({
    label,
    desc,
    labelClassName,
    className,
    slice,
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
  }: RichProps) => {
    // No useFieldTool here: it cannot describe an Any field, so AgentRichPlugin publishes this setter as markdown.
    const agentAction = agentName ?? actionTagOf(onChange)?.action ?? null;
    return (
      <div className={cn("flex flex-col", className)}>
        {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
        <Editor.Rich
          value={value}
          placeholder={placeholder}
          addFilesGql={addFilesGql ?? sliceUploadOf(slice)}
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
          onChange={onChange}
          disabled={disabled}
          className="w-full"
          height={editorHeight}
          plugins={plugins}
          agentName={agentAction}
          agentBlocks={agentBlocks}
          collab={collab}
        />
      </div>
    );
  },
);

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
  useFieldTool(onChange, { disabled });
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
  const { l } = usePage();
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
        title={l.trans({ en: "Select Address", ko: "주소 선택" })}
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
  nullable,
  value,
  slice,
  onChange,
  read,
  disabled,
  aspectRatio,
}: ImgProps<T>) => {
  useFieldTool(onChange, { disabled });
  useFileFieldTool(onChange, { read, label: (file) => file.filename, disabled });
  const upload = uploaderOf<T>(slice);
  useUploadPoll(value ? [value] : [], ([updatedFile]) => onChange(updatedFile ?? value));
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Upload.Image
        className={uploadClassName}
        type="image"
        styleType={styleType}
        aspectRatio={aspectRatio}
        protoFile={value}
        disabled={disabled}
        onSave={async (file) => {
          const [uploadedFile] = await upload(file);
          onChange(uploadedFile ?? null);
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
  useFieldTool(onChange, { disabled });
  useFileFieldTool(onChange, { read, label: (file) => file.filename, min: minlength, max: maxlength, disabled });
  const upload = uploaderOf<T>(slice);
  useUploadPoll(value, (updatedFiles) => onChange(replaced(value, updatedFiles)));
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={!minlength} label={label} desc={desc} /> : null}
      <Upload.Images
        multiple
        fileList={value}
        disabled={disabled}
        maxCount={maxlength}
        render={render as unknown as (file: ProtoLightFile) => ReactNode}
        styleType="square"
        onRemove={(file: File | FileList) => {
          onChange(value.filter((f) => f.id !== (file as unknown as ProtoLightFile).id));
        }}
        onSave={async (file) => {
          const files = filesOf(file);
          if (maxlength !== undefined && value.length + files.length > maxlength) {
            msg.warning("file.maxFilesExceeded", { data: { max: maxlength } });
            return;
          }
          onChange([...value, ...(await upload(files))]);
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
  useFieldTool(onChange, { disabled });
  const upload = uploaderOf<T>(slice);
  useUploadPoll(value ? [value] : [], ([updatedFile]) => onChange(updatedFile ?? value));
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
          const [uploadedFile] = await upload(file);
          onChange(uploadedFile ?? null);
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
  minlength,
  maxlength = 30,
  disabled,
}: FilesProps<T>) => {
  useFieldTool(onChange, { disabled });
  const upload = uploaderOf<T>(slice);
  useUploadPoll(value, (updatedFiles) => onChange(replaced(value, updatedFiles)));
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={!minlength} label={label} desc={desc} /> : null}
      <Upload.FileList
        multiple
        disabled={disabled}
        maxCount={maxlength}
        render={render as unknown as (file: ProtoLightFile) => ReactNode}
        fileList={value}
        onRemove={(file: ProtoLightFile) => {
          onChange(value.filter((f) => f.id !== file.id));
        }}
        onChange={async (file) => {
          const files = filesOf(file);
          if (value.length + files.length > maxlength) {
            msg.warning("file.maxFilesExceeded", { data: { max: maxlength } });
            return;
          }
          onChange([...value, ...(await upload(files))]);
        }}
      />
    </div>
  );
};

const Section = (props: ComponentProps<typeof AkanField>) => <AkanField {...props} />;

export const Field = Object.assign(Section, AkanField, { Rich, Coordinate, Postcode, Img, Imgs, File, Files });
