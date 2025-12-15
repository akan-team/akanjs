"use client";
import { Dayjs, GqlScalarName, isGqlScalar } from "@akanjs/base";
import { usePage } from "@akanjs/client";
import { constantInfo, getGqlTypeStr, getScalarExample } from "@akanjs/constant";
import { SerializedArg } from "@akanjs/signal";
import { st } from "@akanjs/store";
import { ChangeEvent } from "react";
import { AiOutlineDelete } from "react-icons/ai";

import { DatePicker } from "../DatePicker";
import { Input } from "../Input";
import Object from "./Object";

interface ArgProps {
  argType: GqlScalarName;
  value: any;
  onChange: (value: any) => void;
}
export default function Arg({ argType, value, onChange }: ArgProps) {
  return argType === "ID" ? (
    <Arg.ID value={value as string} onChange={onChange} />
  ) : argType === "Int" ? (
    <Arg.Int value={value as number} onChange={onChange} />
  ) : argType === "Float" ? (
    <Arg.Float value={value as number} onChange={onChange} />
  ) : argType === "String" ? (
    <Arg.String value={value as string} onChange={onChange} />
  ) : argType === "Boolean" ? (
    <Arg.Boolean value={value as boolean} onChange={onChange} />
  ) : argType === "Date" ? (
    <Arg.Date value={value as Dayjs} onChange={onChange} />
  ) : argType === "JSON" ? (
    <Arg.Json value={value as string} onChange={onChange} />
  ) : argType === "Upload" ? (
    <Arg.Upload value={value as FileList} onChange={onChange} />
  ) : (
    <></>
  );
}

interface ArgTableProps {
  refName: string;
  gqlKey: string;
  argMetas: SerializedArg[];
}
const ArgTable = ({ refName, gqlKey, argMetas }: ArgTableProps) => {
  const { l } = usePage();
  const onCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    st.do.showMessage({ content: "클립보드에 복사되었습니다.", type: "success", duration: 3 });
  };
  return (
    <table className="table">
      <thead>
        <tr className="text-bold">
          <th>Arg Key</th>
          <th className="text-center">Type</th>
          <th className="text-center">Enum</th>
          <th className="text-center">Name</th>
          <th className="text-center">Description</th>
        </tr>
      </thead>
      {argMetas.map((argMeta, idx) => {
        const argRef = constantInfo.getModelRef(argMeta.refName, argMeta.modelType);
        return (
          <tbody className="font-normal" key={idx}>
            <tr>
              <td>{argMeta.name}</td>
              <td className="text-center">
                <Object.Type objRef={argRef} arrDepth={argMeta.arrDepth} />
              </td>
              <td width={argMeta.argsOption.enum ? "20%" : "10%"} className="text-center">
                {argMeta.argsOption.enum ? (
                  <div className="flex flex-col gap-2">
                    {argMeta.argsOption.enum.map((opt: string, idx: number) => (
                      <div key={idx}>
                        <button
                          key={idx}
                          data-tip={l._(`${argMeta.argsOption.enum?.refName}.${opt}`)}
                          onClick={() => {
                            onCopy(opt);
                          }}
                          className="tooltip tooltip-primary btn btn-secondary btn-xs"
                        >
                          {opt}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  "-"
                )}
              </td>
              <td className="text-center">{l._(`${refName}.signal.${gqlKey}.arg.${argMeta.name}`)}</td>
              <td className="text-center">{l._(`${refName}.signal.${gqlKey}.arg.${argMeta.name}.desc`)}</td>
            </tr>
          </tbody>
        );
      })}
    </table>
  );
};
Arg.Table = ArgTable;

interface ArgParamProps {
  gqlKey: string;
  argMeta: SerializedArg;
  value: any;
  onChange: (value) => void;
}
const ArgParam = ({ gqlKey, argMeta, value, onChange }: ArgParamProps) => {
  const argRef = constantInfo.getModelRef(argMeta.refName, argMeta.modelType);
  if (!isGqlScalar(argRef)) throw new Error(`Param arg - ${gqlKey}/${argMeta.name} must be scalar`);
  else if (argMeta.arrDepth > 0) throw new Error(`Param arg - ${gqlKey}/${argMeta.name} must not be array`);
  const argType = getGqlTypeStr(argRef) as GqlScalarName;
  return (
    <div className="flex w-full items-center gap-2">
      <div className="w-36 pl-2">- {argMeta.name}</div>
      <div className="w-full">
        <Arg argType={argType} value={value as string} onChange={onChange} />
      </div>
    </div>
  );
};
Arg.Param = ArgParam;

interface ArgQueryProps {
  gqlKey: string;
  argMeta: SerializedArg;
  value: any;
  onChange: (value: any) => void;
}
const ArgQuery = ({ gqlKey, argMeta, value, onChange }: ArgQueryProps) => {
  const argRef = constantInfo.getModelRef(argMeta.refName, argMeta.modelType);
  if (!isGqlScalar(argRef)) throw new Error(`Query arg - ${gqlKey}/${argMeta.name} must be scalar`);
  else if (argMeta.arrDepth > 1)
    throw new Error(`Query arg - ${gqlKey}/${argMeta.name} must not be more than 2D array`);
  const argType = getGqlTypeStr(argRef) as GqlScalarName;
  return (
    <div className="flex items-center gap-2">
      <div className="w-36 pl-2">- {argMeta.name}</div>
      <div className="w-full">
        {argMeta.arrDepth > 0 && Array.isArray(value) ? (
          <div>
            {value.map((val, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Arg
                  argType={argType}
                  value={val as string}
                  onChange={(val) => {
                    onChange([...(value.slice(0, idx) as string[]), val, ...(value.slice(idx + 1) as string[])]);
                  }}
                />
                <button
                  className="btn btn-sm btn-square"
                  onClick={() => {
                    onChange([...(value.slice(0, idx) as string[]), ...(value.slice(idx + 1) as string[])]);
                  }}
                >
                  <AiOutlineDelete />
                </button>
              </div>
            ))}
            <button
              className="btn btn-sm"
              onClick={() => {
                onChange([...(value as string[]), getScalarExample(argRef)]);
              }}
            >
              + Add
            </button>
          </div>
        ) : (
          <Arg argType={argType} value={value as string} onChange={onChange} />
        )}
      </div>
    </div>
  );
};
Arg.Query = ArgQuery;

interface ArgFormDataProps {
  gqlKey: string;
  argMeta: SerializedArg;
  value: any;
  onChange: (value: any) => void;
}
const ArgFormData = ({ gqlKey, argMeta, value, onChange }: ArgFormDataProps) => {
  const argRef = constantInfo.getModelRef(argMeta.refName, argMeta.modelType);
  if (getGqlTypeStr(argRef) !== "Upload") throw new Error(`FormData arg - ${gqlKey}/${argMeta.name} must be Upload`);
  else if (argMeta.arrDepth < 1) throw new Error(`FormData arg - ${gqlKey}/${argMeta.name} must be array`);
  return (
    <div className="flex w-full items-center gap-2">
      <div className="w-36 pl-2">- {argMeta.name}</div>
      <div className="w-full">
        <Arg argType="Upload" value={value as FileList} onChange={onChange} />
      </div>
    </div>
  );
};
Arg.FormData = ArgFormData;

interface ArgIDProps {
  value: string;
  onChange: (value: string) => void;
}
const ArgID = ({ value, onChange }: ArgIDProps) => {
  return (
    <Input
      inputClassName="w-full"
      value={value}
      onChange={(value) => {
        onChange(value);
      }}
      validate={(e) => true}
    />
  );
};
Arg.ID = ArgID;

interface ArgIntProps {
  value: number;
  onChange: (value: number) => void;
}
const ArgInt = ({ value, onChange }: ArgIntProps) => {
  return (
    <Input.Number
      inputClassName="w-full"
      value={value}
      onChange={(value) => {
        onChange(value ?? 0);
      }}
      validate={(e) => true}
    />
  );
};
Arg.Int = ArgInt;

interface ArgFloatProps {
  value: number;
  onChange: (value: number) => void;
}
const ArgFloat = ({ value, onChange }: ArgFloatProps) => {
  return (
    <Input.Number
      inputClassName="w-full"
      value={value}
      onChange={(value) => {
        onChange(value ?? 0);
      }}
      validate={(e) => true}
    />
  );
};
Arg.Float = ArgFloat;

interface ArgStringProps {
  value: string;
  onChange: (value: string) => void;
}
const ArgString = ({ value, onChange }: ArgStringProps) => {
  return (
    <Input
      inputClassName="w-full"
      value={value}
      onChange={(value) => {
        onChange(value);
      }}
      validate={(e) => true}
    />
  );
};
Arg.String = ArgString;

interface ArgBooleanProps {
  value: boolean;
  onChange: (value: boolean) => void;
}
const ArgBoolean = ({ value, onChange }: ArgBooleanProps) => {
  return (
    <Input.Checkbox
      className="w-full"
      checked={value}
      onChange={(value) => {
        onChange(value);
      }}
    />
  );
};
Arg.Boolean = ArgBoolean;

interface ArgDateProps {
  value: Dayjs;
  onChange: (value: Dayjs | null) => void;
}
const ArgDate = ({ value, onChange }: ArgDateProps) => {
  return (
    <DatePicker
      className="w-full"
      value={value}
      onChange={(value) => {
        onChange(value);
      }}
    />
  );
};
Arg.Date = ArgDate;

interface ArgJsonProps {
  value: string;
  onChange: (value: string) => void;
}
const ArgJson = ({ value, onChange }: ArgJsonProps) => {
  return (
    <Input.TextArea
      validate={(e) => true}
      className="w-full"
      inputClassName="w-full min-h-[300px]"
      value={value}
      onPressEnter={(value) => {
        onChange(value);
      }}
      onChange={(value) => {
        onChange(value);
      }}
    />
  );
};
Arg.Json = ArgJson;

interface ArgUploadProps {
  value: FileList | null;
  onChange: (value: FileList | null) => void;
}
const ArgUpload = ({ value, onChange }: ArgUploadProps) => {
  return (
    <input
      type="file"
      multiple
      className="file-input w-full max-w-xs"
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        onChange(new Array(e.target.files?.length).fill(0).map((_, idx) => e.target.files?.[idx]) as any as FileList);
      }}
    />
  );
};
Arg.Upload = ArgUpload;
