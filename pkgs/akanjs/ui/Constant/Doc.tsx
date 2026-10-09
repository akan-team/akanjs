"use client";

import { usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { Fragment, useMemo, useState } from "react";
import { AiOutlineInfoCircle, AiOutlineSearch } from "react-icons/ai";
import { BiNetworkChart, BiTable } from "react-icons/bi";

import { buttonRecipe } from "../Button";
import { Input } from "../Input";
import { Modal } from "../Modal";
import {
  Code,
  Collapse,
  DocTable,
  dictText,
  docDash,
  docPill,
  docUi,
  Panel,
  Section,
  Segmented,
  SummaryCard,
  SummaryGrid,
  Toolbar,
} from "../Reference";
import { originText, ownerOf } from "../Reference/origin";
import { Graph } from "./Graph";
import {
  type ConstantSchemaOptions,
  type DatabaseModelVariant,
  type DatabaseSchema,
  databaseModelVariants,
  type EnumSchema,
  type FieldSchema,
  getConstantOwnerOrder,
  getConstantSchemaDoc,
  getDefaultVariant,
  getVariantTitle,
  type ScalarSchema,
} from "./schemaDoc";
import type { SchemaGraphEdge, SchemaGraphNode, SchemaNodeKind } from "./schemaGraph";

const docText = {
  pageTitle: { en: "Constant Schema Docs", ko: "Constant 스키마 문서" },
  printTitle: { en: "Constant Schema Definition", ko: "Constant 스키마 정의서" },
  summary: {
    en: "Database models, scalar models, enums, and relations from ConstantRegistry.",
    ko: "ConstantRegistry에 등록된 데이터베이스 모델, scalar 모델, enum과 관계입니다.",
  },
  databaseModels: { en: "Database Models", ko: "데이터베이스 모델" },
  scalarModels: { en: "Scalar Models", ko: "scalar 모델" },
  enums: { en: "Enums", ko: "enum" },
  relations: { en: "Relations", ko: "관계" },
  table: { en: "Table", ko: "표" },
  diagram: { en: "Diagram", ko: "다이어그램" },
  search: { en: "Search models or enums", ko: "모델 또는 enum 검색" },
  noDatabaseMatch: { en: "No database model matches.", ko: "일치하는 데이터베이스 모델이 없습니다." },
  enum: { en: "Enum", ko: "enum" },
  key: { en: "Key", ko: "키" },
  refName: { en: "Ref Name", ko: "참조 이름" },
  field: { en: "Field", ko: "필드" },
  type: { en: "Type", ko: "타입" },
  kind: { en: "Kind", ko: "종류" },
  fieldType: { en: "Field Type", ko: "필드 타입" },
  required: { en: "Required", ko: "필수" },
  optional: { en: "Optional", ko: "선택" },
  relation: { en: "Relation", ko: "관계" },
  default: { en: "Default", ko: "기본값" },
  constraints: { en: "Constraints", ko: "제약 조건" },
  values: { en: "Values", ko: "값" },
  description: { en: "Description", ko: "설명" },
  descriptions: { en: "Descriptions", ko: "설명" },
  usedBy: { en: "Used By", ko: "사용처" },
  detail: { en: "Detail", ko: "상세" },
  diagramTitle: { en: "Schema Relationship Diagram", ko: "스키마 관계 다이어그램" },
  selectedModel: { en: "Selected Model", ko: "선택한 모델" },
  external: { en: "External", ko: "외부" },
  selectNode: { en: "Select a node in the diagram.", ko: "다이어그램에서 노드를 선택하세요." },
  unknownOrigin: { en: "Unknown library", ko: "출처 미상" },
} as const;

const fieldCountText = (count: number) => ({ en: `${count} fields`, ko: `필드 ${count}개` });

const variantItems = databaseModelVariants.map((variant) => ({ key: variant, label: getVariantTitle(variant) }));

/** A model reference is the one type a reader may want to look up elsewhere, so only those carry colour. */
const typeTone = (field: FieldSchema) =>
  field.typeKind === "database" || field.typeKind === "scalar" ? "info" : "muted";

const typeLabelOf = (field: FieldSchema) => `${field.typeLabel}${field.required ? "!" : ""}`;

/** A declared `null` default is the same as none, and a column of them reads as data the field does not carry. */
const defaultLabelOf = (field: FieldSchema) => (field.defaultLabel === "null" ? undefined : field.defaultLabel);

const headsOf = (l: ReturnType<typeof usePage>["l"], keys: (keyof typeof docText)[]) =>
  keys.map((key) => <th key={key}>{l.trans(docText[key])}</th>);

const printTable = "print:overflow-visible print:rounded-none print:border-0";

interface ZoneProps extends ConstantSchemaOptions {
  openAll?: boolean;
  groupBy?: "lib";
}

export const Zone = ({ models, scalars, enums, include, exclude, libs, openAll, groupBy }: ZoneProps) => {
  const { l } = usePage();
  const schemaDoc = useMemo(
    () => getConstantSchemaDoc({ models, scalars, enums, include, exclude, libs }),
    [models, scalars, enums, include, exclude, libs],
  );
  const viewItems = [
    { key: "table", label: l.trans(docText.table), icon: <BiTable /> },
    { key: "diagram", label: l.trans(docText.diagram), icon: <BiNetworkChart /> },
  ] as const;
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "diagram">("table");
  const filteredDatabases = useMemo(
    () => schemaDoc.databases.filter((database) => matchesQuery(database.refName, query)),
    [schemaDoc.databases, query],
  );
  const filteredScalars = useMemo(
    () => schemaDoc.scalars.filter((scalar) => matchesQuery(scalar.refName, query)),
    [schemaDoc.scalars, query],
  );
  const filteredEnums = useMemo(
    () =>
      schemaDoc.enums.filter(
        (enumSchema) => matchesQuery(enumSchema.refName, query) || matchesQuery(enumSchema.key, query),
      ),
    [schemaDoc.enums, query],
  );
  const groups = useMemo(() => {
    const owners = groupBy === "lib" ? [...getConstantOwnerOrder(), ""] : [null];
    const inGroup = (owner: string | null) => (entry: { origin: string[] }) =>
      owner === null || (ownerOf(entry.origin) ?? "") === owner;
    return owners
      .map((owner) => ({
        owner,
        databases: filteredDatabases.filter(inGroup(owner)),
        scalars: filteredScalars.filter(inGroup(owner)),
        enums: filteredEnums.filter(inGroup(owner)),
      }))
      .filter((group) => group.owner === null || group.databases.length + group.scalars.length + group.enums.length);
  }, [groupBy, filteredDatabases, filteredScalars, filteredEnums]);
  return (
    <div className="flex break-after-page flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className={docUi.pageTitle}>{l.trans(docText.pageTitle)}</h1>
        <p className={docUi.sectionDescription}>{l.trans(docText.summary)}</p>
      </div>
      <SummaryGrid>
        <SummaryCard label={l.trans(docText.databaseModels)} value={filteredDatabases.length} />
        <SummaryCard label={l.trans(docText.scalarModels)} value={filteredScalars.length} />
        <SummaryCard label={l.trans(docText.enums)} value={filteredEnums.length} />
        <SummaryCard label={l.trans(docText.relations)} value={schemaDoc.relations.length} />
      </SummaryGrid>
      <Toolbar>
        <Input
          icon={<AiOutlineSearch className="text-foreground/40" />}
          iconClassName="-mr-8 z-10 pl-3"
          inputClassName="w-72 pl-9"
          nullable
          onChange={setQuery}
          placeholder={l.trans(docText.search)}
          value={query}
        />
        <Segmented className="ml-auto" items={viewItems} onChange={setViewMode} value={viewMode} />
      </Toolbar>
      {groups.map(({ owner, databases, scalars: groupScalars, enums: groupEnums }) => {
        const body =
          viewMode === "diagram" ? (
            <Diagram databases={databases} scalars={groupScalars} />
          ) : (
            <SchemaTables
              databases={databases}
              scalars={groupScalars}
              enums={groupEnums}
              openAll={openAll}
              showEmpty={owner === null}
            />
          );
        if (owner === null) return <Fragment key="all">{body}</Fragment>;
        return (
          <section className="flex flex-col gap-4" key={owner}>
            <h2 className="border-border border-b pb-2 font-bold font-mono text-2xl">
              {owner || l.trans(docText.unknownOrigin)}
            </h2>
            {body}
          </section>
        );
      })}
    </div>
  );
};

interface SchemaTablesProps {
  databases: DatabaseSchema[];
  scalars: ScalarSchema[];
  enums: EnumSchema[];
  openAll?: boolean;
  showEmpty: boolean;
}
const SchemaTables = ({ databases, scalars, enums, openAll, showEmpty }: SchemaTablesProps) => {
  const { l } = usePage();
  return (
    <div className="flex flex-col gap-6">
      {databases.length || showEmpty ? (
        <Section title={l.trans(docText.databaseModels)}>
          {databases.length ? (
            <div className="flex flex-col gap-2">
              {databases.map((database) => (
                <Model key={database.refName} database={database} openAll={openAll} />
              ))}
            </div>
          ) : (
            <div className={docUi.emptyPanel}>{l.trans(docText.noDatabaseMatch)}</div>
          )}
        </Section>
      ) : null}
      {scalars.length ? (
        <Section title={l.trans(docText.scalarModels)}>
          <div className="flex flex-col gap-2">
            {scalars.map((scalar) => (
              <Scalar key={scalar.refName} scalar={scalar} openAll={openAll} />
            ))}
          </div>
        </Section>
      ) : null}
      {enums.length ? (
        <Section title={l.trans(docText.enums)}>
          <EnumList enums={enums} />
        </Section>
      ) : null}
    </div>
  );
};

export const Print = ({ models, scalars, enums, include, exclude, libs }: ZoneProps) => {
  const { l } = usePage();
  const schemaDoc = useMemo(
    () => getConstantSchemaDoc({ models, scalars, enums, include, exclude, libs }),
    [models, scalars, enums, include, exclude, libs],
  );
  return (
    <div className="flex flex-col gap-10 bg-background text-foreground print:bg-white print:text-black">
      <div className="break-after-page">
        <div className="font-bold text-4xl">{l.trans(docText.printTitle)}</div>
        <div className="mt-2 text-foreground/70 print:text-black">{l.trans(docText.summary)}</div>
        <SummaryGrid className="mt-6">
          <SummaryCard label={l.trans(docText.databaseModels)} value={schemaDoc.databases.length} />
          <SummaryCard label={l.trans(docText.scalarModels)} value={schemaDoc.scalars.length} />
          <SummaryCard label={l.trans(docText.enums)} value={schemaDoc.enums.length} />
          <SummaryCard label={l.trans(docText.relations)} value={schemaDoc.relations.length} />
        </SummaryGrid>
      </div>
      {schemaDoc.databases.map((database) => (
        <PrintDatabase key={database.refName} database={database} />
      ))}
      {schemaDoc.scalars.length ? (
        <section className="flex break-before-page flex-col gap-4">
          <PrintSectionTitle title={l.trans(docText.scalarModels)} />
          {schemaDoc.scalars.map((scalar) => (
            <PrintScalar key={scalar.refName} scalar={scalar} />
          ))}
        </section>
      ) : null}
      {schemaDoc.enums.length ? (
        <section className="flex break-before-page flex-col gap-4">
          <PrintSectionTitle title={l.trans(docText.enums)} />
          <PrintEnumTable enums={schemaDoc.enums} />
        </section>
      ) : null}
    </div>
  );
};
interface ModelProps {
  refName?: string;
  database?: DatabaseSchema;
  openAll?: boolean;
}

export const Model = ({ refName, database: databaseProp, openAll }: ModelProps) => {
  const database = useMemo(
    () =>
      databaseProp ??
      getConstantSchemaDoc({ models: refName ? [refName] : [], scalars: [], enums: [] }).databases.at(0),
    [databaseProp, refName],
  );
  const [variant, setVariant] = useState<DatabaseModelVariant>("full");
  const { l } = usePage();
  if (!database) return null;
  const activeVariant = database.variants[variant] ?? getDefaultVariant(database);
  return (
    <Collapse
      open={openAll}
      summary={
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-lg">{database.modelName}</span>
            <span className={docPill("info", "font-mono")}>{database.refName}</span>
            {database.origin.length ? (
              <span className={docPill("muted", "font-mono")}>{l.trans(originText(database.origin))}</span>
            ) : null}
          </div>
          <div className="text-foreground/55 text-sm">{l._(`${database.refName}.modelDesc`)}</div>
        </div>
      }
    >
      <Segmented items={variantItems} onChange={setVariant} value={variant} />
      <ModelVariantTable variant={activeVariant} />
    </Collapse>
  );
};
interface ScalarProps {
  refName?: string;
  scalar?: ScalarSchema;
  openAll?: boolean;
}

export const Scalar = ({ refName, scalar: scalarProp, openAll }: ScalarProps) => {
  const scalar = useMemo(
    () =>
      scalarProp ?? getConstantSchemaDoc({ models: [], scalars: refName ? [refName] : [], enums: [] }).scalars.at(0),
    [scalarProp, refName],
  );
  const { l } = usePage();
  if (!scalar) return null;
  return (
    <Collapse
      open={openAll}
      summary={
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-lg">{scalar.modelName}</span>
            <span className={docPill("muted", "font-mono")}>{scalar.refName}</span>
            {scalar.origin.length ? (
              <span className={docPill("muted", "font-mono")}>{l.trans(originText(scalar.origin))}</span>
            ) : null}
          </div>
          <div className="text-foreground/55 text-sm">{l._(`${scalar.refName}.modelDesc`)}</div>
        </div>
      }
    >
      <FieldTable refName={scalar.refName} fields={scalar.fields} />
    </Collapse>
  );
};
interface EnumProps {
  enums?: ReturnType<typeof getConstantSchemaDoc>["enums"];
}

export const EnumList = ({ enums = getConstantSchemaDoc().enums }: EnumProps) => {
  const { l } = usePage();
  return (
    <DocTable head={headsOf(l, ["enum", "type", "values", "usedBy"])}>
      {enums.map((enumSchema) => (
        <tr key={enumSchema.key}>
          <td>
            <div className={docUi.key}>{enumSchema.key}</div>
            <div className={docUi.subLabel}>{enumSchema.refName}</div>
          </td>
          <td>
            <span className={docPill("muted", "font-mono")}>{enumSchema.typeName}</span>
          </td>
          <td>
            <div className="flex max-w-72 flex-wrap gap-1">
              {enumSchema.values.map((value) => (
                <span
                  className={buttonRecipe({ variant: "outline", size: "xs" }, "font-mono")}
                  key={String(value)}
                  title={l._(`${enumSchema.refName}.${value}`)}
                >
                  {String(value)}
                </span>
              ))}
            </div>
          </td>
          <td>
            <div className="flex flex-wrap gap-1">
              {enumSchema.usedBy.length ? (
                enumSchema.usedBy.map((usage) => (
                  <span
                    className={docPill("muted", "font-mono")}
                    key={`${usage.refName}-${usage.variant}-${usage.fieldKey}`}
                  >
                    {usage.refName}.{usage.fieldKey}
                  </span>
                ))
              ) : (
                <span className={docDash}>—</span>
              )}
            </div>
          </td>
        </tr>
      ))}
    </DocTable>
  );
};

const ModelVariantTable = ({ variant }: { variant: ReturnType<typeof getDefaultVariant> }) => {
  const { l } = usePage();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-base">{variant.modelName}</span>
        <span className={docPill("muted")}>{getVariantTitle(variant.variant)}</span>
        <span className="text-foreground/45 text-sm">{l.trans(fieldCountText(variant.fields.length))}</span>
      </div>
      <FieldTable refName={variant.refName} fields={variant.fields} />
    </div>
  );
};

const PrintDatabase = ({ database }: { database: DatabaseSchema }) => {
  const { l } = usePage();
  return (
    <section className="flex break-after-page flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-bold text-3xl">{database.modelName}</div>
          <div className={docPill("info", "font-mono print:border print:border-black print:bg-white print:text-black")}>
            {database.refName}
          </div>
        </div>
        <div className="mt-2 text-foreground/70 print:text-black">{l._(`${database.refName}.modelDesc`)}</div>
      </div>
      {databaseModelVariants.map((variantKey) => {
        const variant = database.variants[variantKey];
        return (
          <div key={variantKey} className="flex flex-col gap-2">
            <PrintVariantHeader
              title={variant.modelName}
              badge={getVariantTitle(variant.variant)}
              fields={variant.fields.length}
            />
            <PrintFieldTable refName={variant.refName} fields={variant.fields} />
          </div>
        );
      })}
    </section>
  );
};

const PrintScalar = ({ scalar }: { scalar: ScalarSchema }) => {
  const { l } = usePage();
  return (
    <section className="flex break-inside-avoid flex-col gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-bold text-2xl">{scalar.modelName}</div>
          <div
            className={docPill("muted", "font-mono print:border print:border-black print:bg-white print:text-black")}
          >
            {scalar.refName}
          </div>
        </div>
        <div className="mt-1 text-foreground/70 print:text-black">{l._(`${scalar.refName}.modelDesc`)}</div>
      </div>
      <PrintFieldTable refName={scalar.refName} fields={scalar.fields} />
    </section>
  );
};

const PrintSectionTitle = ({ title }: { title: string }) => <div className="font-bold text-3xl">{title}</div>;

const PrintVariantHeader = ({ title, badge, fields }: { title: string; badge: string; fields: number }) => {
  const { l } = usePage();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="font-extrabold text-xl">{title}</div>
      <div className={docPill("muted", "print:border print:border-black")}>{badge}</div>
      <div className="text-foreground/60 text-sm print:text-black">{l.trans(fieldCountText(fields))}</div>
    </div>
  );
};

const FieldTable = ({ refName, fields }: { refName: string; fields: FieldSchema[] }) => {
  const { l } = usePage();
  const [selectedField, setSelectedField] = useState<FieldSchema | null>(null);
  return (
    <>
      <DocTable
        head={
          <>
            {headsOf(l, ["field", "type", "kind", "default", "constraints", "values"])}
            <th className="w-1/4">{l.trans(docText.description)}</th>
            <th />
          </>
        }
      >
        {fields.map((field) => (
          <tr key={field.key}>
            <td>
              <div className={docUi.key}>{field.key}</div>
              <div className={docUi.subLabel}>{l._(`${refName}.${field.key}`)}</div>
            </td>
            <td>
              <div className="flex flex-col items-start gap-1">
                <span className={docPill(typeTone(field), "font-mono")}>{typeLabelOf(field)}</span>
                {field.relationLabel ? <span className={docUi.subLabel}>{field.relationLabel}</span> : null}
              </div>
            </td>
            <td>
              <div className="flex flex-col items-start gap-1">
                <span className={docPill("muted")}>{field.fieldType}</span>
                {field.select ? null : <span className={docPill("warning")}>select:false</span>}
                {field.immutable ? <span className={docPill("muted")}>immutable</span> : null}
              </div>
            </td>
            <td className="max-w-40 truncate font-mono text-xs">
              {defaultLabelOf(field) ?? <span className={docDash}>—</span>}
            </td>
            <td>
              <div className="flex flex-wrap gap-1">
                {field.constraints.length ? (
                  field.constraints.map((constraint) => (
                    <span className={docPill("muted", "font-mono")} key={constraint}>
                      {constraint}
                    </span>
                  ))
                ) : (
                  <span className={docDash}>—</span>
                )}
              </div>
            </td>
            <td>
              <div className="flex max-w-56 flex-wrap gap-1">
                {field.enumValues ? (
                  field.enumValues.map((value) => (
                    <span className={buttonRecipe({ variant: "outline", size: "xs" }, "font-mono")} key={String(value)}>
                      {String(value)}
                    </span>
                  ))
                ) : (
                  <span className={docDash}>—</span>
                )}
              </div>
            </td>
            <td className="text-foreground/70">{l._(`${refName}.${field.key}.desc`)}</td>
            <td>
              <button
                className={buttonRecipe({ variant: "ghost", size: "xs" }, "text-foreground/50")}
                onClick={() => setSelectedField(field)}
                type="button"
              >
                <AiOutlineInfoCircle /> {l.trans(docText.detail)}
              </button>
            </td>
          </tr>
        ))}
      </DocTable>
      <FieldDetailModal refName={refName} field={selectedField} onClose={() => setSelectedField(null)} />
    </>
  );
};

const PrintFieldTable = ({ refName, fields }: { refName: string; fields: FieldSchema[] }) => {
  const { l } = usePage();
  return (
    <DocTable
      className={printTable}
      head={headsOf(l, [
        "key",
        "type",
        "required",
        "fieldType",
        "relation",
        "default",
        "constraints",
        "enum",
        "description",
        "detail",
      ])}
    >
      {fields.map((field) => (
        <tr key={field.key} className="break-inside-avoid">
          <td>
            <div className="font-bold">{field.key}</div>
            <div className="text-foreground/60 text-xs print:text-black">{l._(`${refName}.${field.key}`)}</div>
          </td>
          <td>{field.typeLabel}</td>
          <td>{l.trans(field.required ? docText.required : docText.optional)}</td>
          <td>
            <div>{field.fieldType}</div>
            {!field.select ? <div>select:false</div> : null}
            {field.immutable ? <div>immutable</div> : null}
          </td>
          <td>{getPrintRelation(field)}</td>
          <td>{field.defaultLabel ?? "-"}</td>
          <td>{field.constraints.length ? field.constraints.join(", ") : "-"}</td>
          <td>{field.enumValues ? `${field.enumRefName ?? "enum"}: ${field.enumValues.join(", ")}` : "-"}</td>
          <td>{l._(`${refName}.${field.key}.desc`)}</td>
          <td>
            <PrintFieldDetail field={field} />
          </td>
        </tr>
      ))}
    </DocTable>
  );
};

const PrintFieldDetail = ({ field }: { field: FieldSchema }) => {
  const details = [
    field.ref ? `ref: ${field.ref}` : null,
    field.refPath ? `refPath: ${field.refPath}` : null,
    field.refType ? `refType: ${field.refType}` : null,
    field.exampleLabel ? `example: ${field.exampleLabel}` : null,
    Object.keys(field.meta).length ? `meta: ${JSON.stringify(field.meta)}` : null,
  ].filter((detail): detail is string => !!detail);
  return details.length ? <div className="whitespace-pre-wrap text-xs">{details.join("\n")}</div> : "-";
};

const PrintEnumTable = ({ enums }: { enums: ReturnType<typeof getConstantSchemaDoc>["enums"] }) => {
  const { l } = usePage();
  return (
    <DocTable className={printTable} head={headsOf(l, ["key", "refName", "type", "values", "descriptions", "usedBy"])}>
      {enums.map((enumSchema) => (
        <tr key={enumSchema.key} className="break-inside-avoid">
          <td>{enumSchema.key}</td>
          <td>{enumSchema.refName}</td>
          <td>{enumSchema.typeName}</td>
          <td>{enumSchema.values.join(", ")}</td>
          <td>
            {enumSchema.values.map((value) => (
              <div key={String(value)}>
                {String(value)}: {l._(`${enumSchema.refName}.${value}`)}
              </div>
            ))}
          </td>
          <td>
            {enumSchema.usedBy.length
              ? enumSchema.usedBy
                  .map((usage) => `${usage.refName}.${usage.fieldKey} (${getVariantTitle(usage.variant)})`)
                  .join(", ")
              : "-"}
          </td>
        </tr>
      ))}
    </DocTable>
  );
};

const FieldDetailModal = ({
  refName,
  field,
  onClose,
}: {
  refName: string;
  field: FieldSchema | null;
  onClose: () => void;
}) => {
  const { l } = usePage();
  if (!field) return null;
  const detail = {
    key: field.key,
    type: field.typeLabel,
    required: field.required,
    fieldType: field.fieldType,
    select: field.select,
    immutable: field.immutable,
    ref: field.ref,
    refPath: field.refPath,
    refType: field.refType,
    default: field.defaultLabel,
    example: field.exampleLabel,
    constraints: field.constraints,
    enum: field.enumValues,
    meta: field.meta,
  };
  return (
    // Anything narrower than the dialog body's own `xl:min-w-[768px]` overflows the card and clips its content.
    <Modal
      title={`${refName}.${field.key}`}
      open={!!field}
      onCancel={onClose}
      className="max-w-4xl"
      bodyClassName="flex flex-col gap-4"
    >
      <div>
        <div className="font-bold text-lg">{l._(`${refName}.${field.key}`)}</div>
        <div className={docUi.sectionDescription}>{l._(`${refName}.${field.key}.desc`)}</div>
      </div>
      <Code code={JSON.stringify(detail, null, 2)} label={l.trans(docText.field)} />
    </Modal>
  );
};

const getPrintRelation = (field: FieldSchema) => {
  const parts = [
    field.relationLabel,
    field.typeRefName ? `target: ${field.typeRefName}` : null,
    field.ref ? `ref: ${field.ref}` : null,
    field.refPath ? `path: ${field.refPath}` : null,
  ].filter((part): part is string => !!part);
  return parts.length ? parts.join("\n") : "-";
};

const Diagram = ({ databases, scalars }: { databases: DatabaseSchema[]; scalars: ScalarSchema[] }) => {
  const { l } = usePage();
  const graph = useMemo(() => makeSchemaGraph(databases, scalars), [databases, scalars]);
  const [selectedNode, setSelectedNode] = useState<string | null>(graph.nodes.at(0)?.id ?? null);
  const selectedRefName = selectedNode ? graph.nodeRefNames.get(selectedNode) : undefined;
  const selectedDatabase = selectedRefName
    ? databases.find((database) => database.refName === selectedRefName)
    : undefined;
  const selectedScalar = selectedRefName ? scalars.find((scalar) => scalar.refName === selectedRefName) : undefined;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <Graph
        edges={graph.edges}
        nodes={graph.nodes}
        onSelect={setSelectedNode}
        selectedId={selectedNode}
        title={l.trans(docText.diagramTitle)}
      />
      <Panel bodyClassName="max-h-none" label={l.trans(docText.selectedModel)}>
        {selectedDatabase ? (
          <DiagramDetail
            fields={getDefaultVariant(selectedDatabase).fields}
            modelName={selectedDatabase.modelName}
            refName={selectedDatabase.refName}
          />
        ) : selectedScalar ? (
          <DiagramDetail
            fields={selectedScalar.fields}
            modelName={selectedScalar.modelName}
            refName={selectedScalar.refName}
          />
        ) : selectedRefName ? (
          <div className="flex flex-col items-start gap-2">
            <span className={docPill("muted")}>{l.trans(docText.external)}</span>
            <span className="font-bold">{selectedRefName}</span>
          </div>
        ) : (
          <div className="text-foreground/40 text-sm">{l.trans(docText.selectNode)}</div>
        )}
      </Panel>
    </div>
  );
};

interface DiagramDetailProps {
  refName: string;
  modelName: string;
  fields: FieldSchema[];
}

const DiagramDetail = ({ refName, modelName, fields }: DiagramDetailProps) => {
  const { l } = usePage();
  const desc = dictText(l, `${refName}.modelDesc`);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-lg">{modelName}</span>
          <span className={docPill("info", "font-mono")}>{refName}</span>
        </div>
        {desc ? <div className={docUi.sectionDescription}>{desc}</div> : null}
      </div>
      <div className="flex flex-col divide-y divide-border/60">
        {fields.map((field) => (
          <div className="flex items-center justify-between gap-2 py-1.5" key={field.key}>
            <span className="truncate font-medium font-mono text-sm">{field.key}</span>
            <span className={docPill(typeTone(field), "shrink-0 font-mono")}>{typeLabelOf(field)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const makeSchemaGraph = (databases: DatabaseSchema[], scalars: ScalarSchema[]) => {
  const schemaDoc = getConstantSchemaDoc({
    models: databases.map((database) => database.refName),
    scalars: scalars.map((scalar) => scalar.refName),
  });
  const nodes = new Map<string, SchemaGraphNode>();
  const addNode = (refName: string, title: string, subtitle: string, kind: SchemaNodeKind) => {
    const id = toNodeId(refName);
    if (nodes.has(id)) return;
    nodes.set(id, { id, refName, title, subtitle, kind });
  };
  databases.forEach((database) => {
    addNode(database.refName, database.modelName, database.refName, "database");
  });
  scalars.forEach((scalar) => {
    addNode(scalar.refName, scalar.modelName, scalar.refName, "scalar");
  });
  schemaDoc.relations.forEach((relation) => {
    addNode(relation.targetRefName, capitalize(relation.targetRefName), "external", "external");
  });
  const edges = new Map<string, SchemaGraphEdge>();
  schemaDoc.relations.forEach((relation) => {
    const from = toNodeId(relation.sourceRefName);
    const to = toNodeId(relation.targetRefName);
    const existing = edges.get(`${from}>${to}`);
    // One arrow per pair, its label joining every field that reaches the same target.
    edges.set(
      `${from}>${to}`,
      existing
        ? { ...existing, label: `${existing.label}, ${relation.fieldKey}` }
        : { from, to, label: relation.fieldKey },
    );
  });
  const nodeRefNames = new Map([...nodes.values()].map((node) => [node.id, node.refName]));
  return { nodes: [...nodes.values()], edges: [...edges.values()], nodeRefNames };
};

const toNodeId = (refName: string) => `schema_${refName.replace(/[^a-zA-Z0-9_]/g, "_")}`;

const matchesQuery = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase());
