"use client";

interface QueryMakerProps {
  className?: string;
  sliceName: string;
  query?: { [key: string]: any };
}
interface QuerySetting {
  queryKey: string;
  arg: Record<string, any>;
}
const searchQuerySetting: QuerySetting = { queryKey: "search", arg: { $search: undefined as string | undefined } };
const byStatusQuerySetting: QuerySetting = { queryKey: "byStatuses", arg: { statuses: null } };

export default function QueryMaker({ className, sliceName, query }: QueryMakerProps) {
  return null;
  // const { l } = usePage();
  // const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  // const cnstInfo = constantInfo.getDatabase(sliceName);
  // const isModelSearchable = hasTextField(cnstInfo.full);
  // const { subMenu, filter } = st.use.searchParams();
  // const filterRef = cnstInfo.filter;
  // const filterQueryMap = getFilterQueryMap(filterRef);
  // const defaultQuerySetting = { ...(isModelSearchable ? searchQuerySetting : byStatusQuerySetting), ...(query ?? {}) };
  // const isInitialized = useRef(false);
  // const [querySetting, setQuerySetting] = useState<QuerySetting>(defaultQuerySetting);
  // const getQuery = useCallback(
  //   (querySetting: QuerySetting) => {
  //     if (querySetting.queryKey === "search") {
  //       const query = querySetting.arg;
  //       return query;
  //     } else {
  //       const queryFn = getFilterQuery(filterRef, querySetting.queryKey);
  //       const filterQueryArgMetas = getFilterArgMetas(filterRef, querySetting.queryKey);
  //       const queryArgs = filterQueryArgMetas.map((queryArgMeta) => querySetting.arg[queryArgMeta.name] as string);
  //       const query = queryFn(...queryArgs);
  //       return query;
  //     }
  //   },
  //   [filter]
  // );
  // const setQueryOfModel = useDebounce((querySetting: QuerySetting) => {
  //   const query = getQuery(querySetting);
  //   if (!isInitialized.current) {
  //     void storeDo[`init${capitalize(sliceName)}`](query);
  //     isInitialized.current = true;
  //   } else void storeDo[`setQueryArgsOf${capitalize(sliceName)}`](query);
  // });
  // useEffect(() => {
  //   if (filter && subMenu === sliceName) setQuerySetting({ queryKey: filter, arg: {} });
  // }, [filter, subMenu]);
  // useEffect(() => {
  //   setQueryOfModel(querySetting);
  // }, [querySetting]);
  // return (
  //   <div className={clsx("flex w-full items-center gap-4", className)}>
  //     <div className="flex flex-col gap-2">
  //       Query
  //       <Select<string>
  //         value={querySetting.queryKey}
  //         options={Object.keys(filterQueryMap).map((queryKey) => ({
  //           label: l.field("summary", queryKey),
  //           value: queryKey,
  //         }))}
  //         onChange={(queryKey: string) => {
  //           const filterQueryArgMetas = getFilterArgMetas(filterRef, queryKey);
  //           const defaultArg = Object.fromEntries(
  //             filterQueryArgMetas.map((queryArgMeta) => [
  //               queryArgMeta.name,
  //               queryArgMeta.nullable
  //                 ? null
  //                 : queryArgMeta.arrDepth
  //                   ? { $in: [] }
  //                   : queryArgMeta.default
  //                     ? typeof queryArgMeta.default === "function"
  //                       ? queryArgMeta.default()
  //                       : queryArgMeta.default
  //                     : (scalarDefaultMap.get(queryArgMeta.modelRef) ?? null),
  //             ])
  //           );
  //           setQuerySetting({ queryKey, arg: defaultArg });
  //         }}
  //       />
  //     </div>
  //     {querySetting.queryKey === "search" ? (
  //       <div className="flex w-full flex-col gap-2">
  //         Search
  //         <label className="input flex w-full items-center gap-2">
  //           <input
  //             type="text"
  //             className="grow"
  //             placeholder="Type to search..."
  //             value={(querySetting.arg.$search as string | undefined) ?? ""}
  //             onChange={(e) => {
  //               setQuerySetting({ ...querySetting, arg: e.target.value ? { $search: e.target.value } : {} });
  //             }}
  //           />
  //           <BiSearch className="size-4 opacity-70" />
  //         </label>
  //       </div>
  //     ) : (
  //       getFilterArgMetas(filterRef, querySetting.queryKey).map((queryArgMeta, idx) => (
  //         <div className="flex flex-col gap-2" key={idx}>
  //           <div className="text-sm text-gray-500">{l.qarg(sliceName, querySetting.queryKey, queryArgMeta.name)}</div>
  //           <QueryArg
  //             queryArgMeta={queryArgMeta}
  //             value={querySetting.arg[queryArgMeta.name] as string}
  //             onChange={(value) => {
  //               setQuerySetting({
  //                 ...querySetting,
  //                 arg: { ...querySetting.arg, [queryArgMeta.name]: value as string },
  //               });
  //             }}
  //           />
  //         </div>
  //       ))
  //     )}
  //   </div>
  // );
}

// interface QueryArgProps {
//   queryArgMeta: FilterArgMeta;
//   value: any;
//   onChange: (value: any) => void;
// }
// function QueryArg({ queryArgMeta, value, onChange }: QueryArgProps) {
//   const argType = getGqlTypeStr(queryArgMeta.modelRef) as GqlScalarName;
//   if (queryArgMeta.enum && queryArgMeta.arrDepth && queryArgMeta.arrDepth < 2)
//     return (
//       <QueryArg.Enum
//         options={queryArgMeta.enum.values}
//         value={value as (string | number)[] | null}
//         onChange={onChange}
//         nullable={queryArgMeta.nullable}
//         multiple={queryArgMeta.arrDepth ? queryArgMeta.arrDepth >= 1 : false}
//       />
//     );
//   return argType === "ID" ? (
//     <QueryArg.ID queryArgMeta={queryArgMeta} value={value as string} onChange={onChange} />
//   ) : argType === "Int" ? (
//     <QueryArg.Int value={value as number} onChange={onChange} />
//   ) : argType === "Float" ? (
//     <QueryArg.Float value={value as number} onChange={onChange} />
//   ) : argType === "String" ? (
//     <QueryArg.String value={value as string} onChange={onChange} />
//   ) : argType === "Boolean" ? (
//     <QueryArg.Boolean value={value as boolean} onChange={onChange} />
//   ) : argType === "Date" ? (
//     <QueryArg.Date value={value as Dayjs} onChange={onChange} />
//   ) : argType === "JSON" ? (
//     <QueryArg.Json value={value as string} onChange={onChange} />
//   ) : (
//     <></>
//   );
// }

// interface ArgEnumProps {
//   options: (string | number)[];
//   value: (string | number)[] | string | number | null;
//   onChange: (value: (string | number)[] | string | number | null) => void;
//   nullable?: boolean;
//   multiple?: boolean;
// }
// const ArgEnum = ({ options, value, onChange, nullable, multiple }: ArgEnumProps) => {
//   return (
//     <Select
//       options={options.map((option) => ({
//         label: option.toString(),
//         value: option,
//       }))}
//       value={value ?? []}
//       onChange={(val) => {
//         onChange(val as (string | number)[] | string | number | null);
//       }}
//       multiple={multiple}
//     />
//   );
// };
// QueryArg.Enum = ArgEnum;

// interface ArgIDProps {
//   queryArgMeta: FilterArgMeta;
//   value: string | null;
//   onChange: (value: string | null) => void;
// }
// const ArgID = ({ queryArgMeta, value, onChange }: ArgIDProps) => {
//   if (!queryArgMeta.ref)
//     return (
//       <Input
//         inputClassName="w-full"
//         value={value ?? ""}
//         onChange={(value) => {
//           onChange(value ? value : null);
//         }}
//         validate={(e) => true}
//       />
//     );
//   else return <SelectIDWithRef queryArgMeta={queryArgMeta} value={value} onChange={onChange} />;
// };
// QueryArg.ID = ArgID;

// interface SelectIDWithRefProps {
//   queryArgMeta: FilterArgMeta;
//   value: string | null;
//   onChange: (value: string | null) => void;
// }
// const SelectIDWithRef = ({ queryArgMeta, value, onChange }: SelectIDWithRefProps) => {
//   if (!queryArgMeta.ref) throw new Error("No ref in queryArgMeta");
//   const [modalOpen, setModalOpen] = useState(false);
//   const storeUse = st.use as { [key: string]: () => unknown };
//   const modelList = storeUse[`${queryArgMeta.ref}List`]() as DataList<{ id: string }>;
//   const renderOption = queryArgMeta.renderOption ?? ((value: { id: string }) => value.id);
//   const selectedModel = value ? modelList.get(value) : null;
//   return (
//     <>
//       <button
//         className="btn"
//         onClick={() => {
//           setModalOpen(true);
//         }}
//       >
//         {selectedModel ? renderOption(selectedModel) : `Select ${queryArgMeta.ref}`}
//       </button>
//       <Modal
//         open={modalOpen}
//         onCancel={() => {
//           setModalOpen(false);
//         }}
//       >
//         <div className="flex w-full flex-col gap-4 pb-[256px]">
//           <QueryMaker sliceName={queryArgMeta.ref} />
//           <Select<string | null>
//             value={value}
//             options={modelList.map((model) => ({
//               label: renderOption(model),
//               value: model.id,
//             }))}
//             onChange={(value) => {
//               onChange(value);
//             }}
//           />
//         </div>
//       </Modal>
//     </>
//   );
// };

// interface ArgIntProps {
//   value: number;
//   onChange: (value: number) => void;
// }
// const ArgInt = ({ value, onChange }: ArgIntProps) => {
//   return (
//     <Input.Number
//       inputClassName="w-full"
//       value={value}
//       onChange={(value) => {
//         onChange(value ?? 0);
//       }}
//       validate={(e) => true}
//     />
//   );
// };
// QueryArg.Int = ArgInt;

// interface ArgFloatProps {
//   value: number;
//   onChange: (value: number) => void;
// }
// const ArgFloat = ({ value, onChange }: ArgFloatProps) => {
//   return (
//     <Input.Number
//       inputClassName="w-full"
//       value={value}
//       onChange={(value) => {
//         onChange(value ?? 0);
//       }}
//       validate={(e) => true}
//     />
//   );
// };
// QueryArg.Float = ArgFloat;

// interface ArgStringProps {
//   value: string | null | undefined;
//   onChange: (value: string | null) => void;
// }
// const ArgString = ({ value, onChange }: ArgStringProps) => {
//   return (
//     <Input
//       inputClassName="w-full"
//       value={value ?? ""}
//       onChange={(value) => {
//         onChange(value ? value : null);
//       }}
//       validate={(e) => true}
//     />
//   );
// };
// QueryArg.String = ArgString;

// interface ArgBooleanProps {
//   value: boolean;
//   onChange: (value: boolean) => void;
// }
// const ArgBoolean = ({ value, onChange }: ArgBooleanProps) => {
//   return (
//     <Input.Checkbox
//       className="w-full"
//       checked={value}
//       onChange={(value) => {
//         onChange(value);
//       }}
//     />
//   );
// };
// QueryArg.Boolean = ArgBoolean;

// interface ArgDateProps {
//   value: Dayjs;
//   onChange: (value: Dayjs | null) => void;
// }
// const ArgDate = ({ value, onChange }: ArgDateProps) => {
//   return (
//     <DatePicker
//       className="w-full"
//       value={value}
//       onChange={(value) => {
//         onChange(value);
//       }}
//     />
//   );
// };
// QueryArg.Date = ArgDate;

// interface ArgJsonProps {
//   value: string;
//   onChange: (value: string) => void;
// }
// const ArgJson = ({ value, onChange }: ArgJsonProps) => {
//   return (
//     <Input.TextArea
//       validate={(e) => true}
//       className="w-full"
//       inputClassName="w-full min-h-[300px]"
//       value={value}
//       onPressEnter={(value) => {
//         onChange(value);
//       }}
//       onChange={(value) => {
//         onChange(value);
//       }}
//     />
//   );
// };
// QueryArg.Json = ArgJson;
