"use client";
import { cnst, Err, usePage } from "@libs/shared/client";
import { type GoogleProps, inputRecipe, MapView } from "@libs/util/ui";
import { cn } from "akanjs/client";
import { useFieldTool } from "akanjs/store";
import { Field as AkanField, Modal } from "akanjs/ui";
import { lazy } from "akanjs/webkit";
import { useCallback, useState } from "react";
import { AiTwotoneEnvironment } from "react-icons/ai";

const DaumPostcode = lazy(() => import("react-daum-postcode"), { ssr: false });

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
