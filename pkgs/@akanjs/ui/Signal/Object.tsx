"use client";
import { getNonArrayModel, isGqlClass, isGqlScalar, scalarNameMap, type Type } from "@akanjs/base";
import { usePage } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { constantInfo, getFieldMetas, getGqlTypeStr } from "@akanjs/constant";
import { useState } from "react";

import { Modal } from "../Modal";

export default function Object() {
  return <div></div>;
}

interface ObjectTypeProps {
  objRef: Type;
  arrDepth: number;
  nullable?: boolean;
}
const ObjectType = ({ objRef, arrDepth, nullable }: ObjectTypeProps) => {
  const isModelType = !isGqlScalar(objRef);
  const gqlName = getGqlTypeStr(objRef);
  const [openDetail, setOpenDetail] = useState(false);
  return (
    <>
      <div
        className={isModelType ? "btn btn-sm btn-primary" : ""}
        onClick={() => {
          if (isModelType) setOpenDetail(true);
        }}
      >
        {"[".repeat(arrDepth)}
        {gqlName}
        {"]".repeat(arrDepth)}
        {nullable ? "" : "!"}
      </div>
      {isModelType ? (
        <Modal
          title={`Model Type - ${gqlName}`}
          open={openDetail}
          onCancel={() => {
            setOpenDetail(false);
          }}
        >
          {openDetail ? <ObjectDetail objRef={objRef} /> : null}
        </Modal>
      ) : null}
    </>
  );
};
Object.Type = ObjectType;

interface ObjectDetailProps {
  objRef: Type;
}
const ObjectDetail = ({ objRef }: ObjectDetailProps) => {
  const modelRefName = constantInfo.getRefName(objRef);
  const fieldMetas = getFieldMetas(objRef);
  const { l } = usePage();
  return (
    <div>
      <table className="table">
        <thead>
          <tr className="text-bold">
            <th className="text-base">Key</th>
            <th className="text-center text-base">Type</th>
            <th className="text-center text-base">Field Name</th>
            <th className="text-center text-base">Description</th>
            <th className="text-center text-base">Enum</th>
          </tr>
        </thead>
        {fieldMetas.map(({ key, arrDepth, nullable, modelRef, isClass, enum: enumOpt, isMap, of }, idx) => (
          <tbody className="font-normal" key={idx}>
            <tr>
              <td className="">{key}</td>
              <td className="text-center">
                {isClass ? (
                  <ObjectType objRef={modelRef} arrDepth={arrDepth} />
                ) : (
                  `${"[".repeat(arrDepth)}${getGqlTypeStr(modelRef)}${"]".repeat(arrDepth)}${nullable ? "" : "!"}`
                )}

                {isMap ? (
                  <>
                    {" => "}
                    {(() => {
                      const [valueRef, valueArrDepth] = getNonArrayModel(of as Type);
                      if (isGqlClass(of as Type)) return <ObjectType objRef={valueRef} arrDepth={valueArrDepth} />;
                      else
                        return `${"[".repeat(valueArrDepth)}${scalarNameMap.get(of as Type)}${"]".repeat(valueArrDepth)}`;
                    })()}
                  </>
                ) : null}
              </td>
              <td className="text-center">{l._(`${modelRefName}.${key}`)}</td>
              <td className="text-center">{l._(`${modelRefName}.${key}.desc`)}</td>
              <td className="flex flex-wrap items-center justify-center gap-2 text-center">
                {enumOpt
                  ? enumOpt.map((opt, idx: number) => (
                      <div key={idx} className="tooltip tooltip-primary" data-tip={l._(`${enumOpt.refName}.${opt}`)}>
                        <button className="btn btn-xs">{opt}</button>
                      </div>
                    ))
                  : "-"}
              </td>
            </tr>
          </tbody>
        ))}
      </table>
    </div>
  );
};
Object.Detail = ObjectDetail;

interface ObjectSchemaProps {
  objRef: Type;
}
const ObjectSchema = ({ objRef }: ObjectSchemaProps) => {
  const { l } = usePage();
  const refName = capitalize(constantInfo.getRefName(objRef));
  const gqlName = `${constantInfo.isLight(objRef) ? "Light" : ""}${refName}${constantInfo.isInsight(objRef) ? "Insight" : ""}`;
  return (
    <div className="flex break-after-page flex-col gap-4">
      <div className="mt-24" />
      <div className="text-3xl font-bold">{gqlName}</div>
      <div className="mb-5"> - {l._(`${refName}.modelDesc`)}</div>
      <div className="text-2xl font-bold">Schema</div>
      <ObjectDetail objRef={objRef} />
    </div>
  );
};
Object.Schema = ObjectSchema;
