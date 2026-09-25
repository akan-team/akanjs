"use client";
import { type Dayjs, type DefaultPrimitiveName, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import { usePage } from "akanjs/client";
import { type ConstantCls, ConstantRegistry } from "akanjs/constant";
import type { SerializedArg } from "akanjs/signal";
import { st } from "akanjs/store";
import type { ChangeEvent } from "react";
import { AiOutlineDelete } from "react-icons/ai";
import { DatePicker } from "../DatePicker";
import { Input } from "../Input";
import UiObject from "./Object";
import { signalUi } from "./style";

interface ArgProps {
  argType: DefaultPrimitiveName;
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
  ) : argType === "Any" ? (
    <Arg.Json value={value as string} onChange={onChange} />
  ) : argType === "Upload" ? (
    <Arg.Upload value={value as FileList} onChange={onChange} />
  ) : (
    <></>
  );
}

interface ArgTableProps {
  refName: string;
  endpointKey: string;
  args: SerializedArg[];
}
const ArgTable = ({ refName, endpointKey, args }: ArgTableProps) => {
  const { l } = usePage();
  const onCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    st.do.showMessage({
      content: l.trans({ ko: "클립보드에 복사되었습니다.", en: "Copied to clipboard." }),
      type: "success",
      duration: 3,
    });
  };
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Arg Key</th>
          <th className="text-center">Type</th>
          <th className="text-center">Enum</th>
          <th className="text-center">Name</th>
          <th className="text-center">Description</th>
        </tr>
      </thead>
      {args.map((arg, idx) => {
        const argRef = ConstantRegistry.getModelRef(arg.refName, arg.modelType);
        const argEnum = arg.enum ? ConstantRegistry.enum.get(arg.enum) : undefined;
        return (
          <tbody className="font-normal" key={idx}>
            <tr>
              <td>
                <div className="font-bold">{arg.name}</div>
              </td>
              <td className="text-center">
                <UiObject.Type objRef={argRef as ConstantCls} arrDepth={arg.arrDepth ?? 0} />
              </td>
              <td width={argEnum ? "20%" : "10%"} className="text-center">
                {argEnum ? (
                  <div className="flex flex-col gap-2">
                    {argEnum.map((opt, idx) => (
                      <div key={idx}>
                        <button
                          key={idx}
                          data-tip={l._(`${arg.enum}.${opt}`)}
                          onClick={() => {
                            onCopy(opt.toString());
                          }}
                          className="tooltip tooltip-primary btn btn-outline btn-xs"
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
              <td className="text-center text-base-content/70">
                {l._(`${refName}.signal.${endpointKey}.arg.${arg.name}`)}
              </td>
              <td className="text-center text-base-content/70">
                {l._(`${refName}.signal.${endpointKey}.arg.${arg.name}.desc`)}
              </td>
            </tr>
          </tbody>
        );
      })}
    </table>
  );
};
Arg.Table = ArgTable;

interface ArgParamProps {
  endpointKey: string;
  arg: SerializedArg;
  value: any;
  onChange: (value: any) => void;
}
const ArgParam = ({ endpointKey, arg, value, onChange }: ArgParamProps) => {
  const argRef = ConstantRegistry.getModelRef(arg.refName, arg.modelType);
  if (!PrimitiveRegistry.has(argRef)) throw new Error(`Param arg - ${endpointKey}/${arg.name} must be scalar`);
  else if ((arg.arrDepth ?? 0) > 0) throw new Error(`Param arg - ${endpointKey}/${arg.name} must not be array`);
  const argType = PrimitiveRegistry.getName(argRef as typeof PrimitiveScalar) as DefaultPrimitiveName;
  return (
    <div className={signalUi.inputRow}>
      <div className={signalUi.inputLabel}>{arg.name}</div>
      <div className="w-full">
        <Arg argType={argType} value={value as string} onChange={onChange} />
      </div>
    </div>
  );
};
Arg.Param = ArgParam;

interface ArgQueryProps {
  endpointKey: string;
  arg: SerializedArg;
  value: any;
  onChange: (value: any) => void;
}
const ArgQuery = ({ endpointKey, arg, value, onChange }: ArgQueryProps) => {
  const argRef = ConstantRegistry.getModelRef(arg.refName, arg.modelType);
  if (!PrimitiveRegistry.has(argRef)) throw new Error(`Query arg - ${endpointKey}/${arg.name} must be scalar`);
  else if ((arg.arrDepth ?? 0) > 1)
    throw new Error(`Query arg - ${endpointKey}/${arg.name} must not be more than 2D array`);
  const argType = PrimitiveRegistry.getName(argRef as typeof PrimitiveScalar) as DefaultPrimitiveName;
  return (
    <div className={signalUi.inputRow}>
      <div className={signalUi.inputLabel}>{arg.name}</div>
      <div className="w-full">
        {(arg.arrDepth ?? 0) > 0 && Array.isArray(value) ? (
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
                  className="btn btn-outline btn-sm btn-square"
                  onClick={() => {
                    onChange([...(value.slice(0, idx) as string[]), ...(value.slice(idx + 1) as string[])]);
                  }}
                >
                  <AiOutlineDelete />
                </button>
              </div>
            ))}
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                onChange([...(value as string[]), arg.example]);
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
  endpointKey: string;
  arg: SerializedArg;
  value: any;
  onChange: (value: any) => void;
}
const ArgFormData = ({ endpointKey, arg, value, onChange }: ArgFormDataProps) => {
  const argRef = ConstantRegistry.getModelRef(arg.refName, arg.modelType);
  if (PrimitiveRegistry.getName(argRef as typeof PrimitiveScalar) !== "Upload")
    throw new Error(`FormData arg - ${endpointKey}/${arg.name} must be Upload`);
  else if ((arg.arrDepth ?? 0) < 1) throw new Error(`FormData arg - ${endpointKey}/${arg.name} must be array`);
  return (
    <div className={signalUi.inputRow}>
      <div className={signalUi.inputLabel}>{arg.name}</div>
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
      inputClassName="w-full min-h-[300px] rounded-xl border border-base-300 bg-base-100"
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
      className="file-input file-input-bordered w-full max-w-xs"
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.files);
      }}
    />
  );
};
Arg.Upload = ArgUpload;
