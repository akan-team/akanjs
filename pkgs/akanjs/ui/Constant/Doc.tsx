"use client";

import { usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { useMemo, useState } from "react";
import { AiOutlineInfoCircle, AiOutlineSearch } from "react-icons/ai";
import { BiNetworkChart, BiTable } from "react-icons/bi";

import { Input } from "../Input";
import { Modal } from "../Modal";
import { Mermaid } from "./Mermaid";
import {
  type DatabaseModelVariant,
  type DatabaseSchema,
  databaseModelVariants,
  type FieldSchema,
  getConstantSchemaDoc,
  getDefaultVariant,
  getVariantTitle,
  type ScalarSchema,
} from "./schemaDoc";

export default function Doc() {
  return <div />;
}

interface ZoneProps {
  models?: string[];
  scalars?: string[];
  enums?: string[];
  openAll?: boolean;
}

const Zone = ({ models, scalars, enums, openAll }: ZoneProps) => {
  const schemaDoc = useMemo(() => getConstantSchemaDoc({ models, scalars, enums }), [models, scalars, enums]);
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
  return (
    <div className="flex break-after-page flex-col gap-4">
      <div>
        <div className="font-bold text-3xl">Constant Schema Docs</div>
        <div className="text-base-content/70">
          Database models, scalar models, enums, and relations from ConstantRegistry.
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryCard title="Database Models" value={filteredDatabases.length} />
        <SummaryCard title="Scalar Models" value={filteredScalars.length} />
        <SummaryCard title="Enums" value={filteredEnums.length} />
        <SummaryCard title="Relations" value={schemaDoc.relations.length} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-base-200 p-3">
        <Input
          nullable
          value={query}
          onChange={setQuery}
          inputClassName="w-72"
          icon={<AiOutlineSearch />}
          placeholder="Search models or enums"
        />
        <div className="join">
          <button
            className={`btn join-item btn-sm ${viewMode === "table" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setViewMode("table")}
          >
            <BiTable /> Table
          </button>
          <button
            className={`btn join-item btn-sm ${viewMode === "diagram" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setViewMode("diagram")}
          >
            <BiNetworkChart /> Diagram
          </button>
        </div>
      </div>
      {viewMode === "diagram" ? (
        <Diagram databases={filteredDatabases} scalars={filteredScalars} />
      ) : (
        <div className="flex flex-col gap-4">
          {filteredDatabases.map((database) => (
            <Model key={database.refName} database={database} openAll={openAll} />
          ))}
          {filteredScalars.length ? (
            <div className="flex flex-col gap-3">
              <div className="font-bold text-2xl">Scalar Models</div>
              {filteredScalars.map((scalar) => (
                <Scalar key={scalar.refName} scalar={scalar} openAll={openAll} />
              ))}
            </div>
          ) : null}
          {filteredEnums.length ? (
            <div className="flex flex-col gap-3">
              <div className="font-bold text-2xl">Enums</div>
              <EnumList enums={filteredEnums} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
Doc.Zone = Zone;

const Print = ({ models, scalars, enums }: ZoneProps) => {
  const schemaDoc = useMemo(() => getConstantSchemaDoc({ models, scalars, enums }), [models, scalars, enums]);
  return (
    <div className="flex flex-col gap-10 bg-base-100 text-base-content print:bg-white print:text-black">
      <div className="break-after-page">
        <div className="font-bold text-4xl">Constant Schema Definition</div>
        <div className="mt-2 text-base-content/70 print:text-black">
          Database models, scalar models, enums, and relations from ConstantRegistry.
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
          <SummaryCard title="Database Models" value={schemaDoc.databases.length} />
          <SummaryCard title="Scalar Models" value={schemaDoc.scalars.length} />
          <SummaryCard title="Enums" value={schemaDoc.enums.length} />
          <SummaryCard title="Relations" value={schemaDoc.relations.length} />
        </div>
      </div>
      {schemaDoc.databases.map((database) => (
        <PrintDatabase key={database.refName} database={database} />
      ))}
      {schemaDoc.scalars.length ? (
        <section className="flex break-before-page flex-col gap-4">
          <PrintSectionTitle title="Scalar Models" />
          {schemaDoc.scalars.map((scalar) => (
            <PrintScalar key={scalar.refName} scalar={scalar} />
          ))}
        </section>
      ) : null}
      {schemaDoc.enums.length ? (
        <section className="flex break-before-page flex-col gap-4">
          <PrintSectionTitle title="Enums" />
          <PrintEnumTable enums={schemaDoc.enums} />
        </section>
      ) : null}
    </div>
  );
};
Doc.Print = Print;

interface ModelProps {
  refName?: string;
  database?: DatabaseSchema;
  openAll?: boolean;
}

const Model = ({ refName, database: databaseProp, openAll }: ModelProps) => {
  const database = useMemo(
    () => databaseProp ?? getConstantSchemaDoc({ models: refName ? [refName] : [] }).databases.at(0),
    [databaseProp, refName],
  );
  const [variant, setVariant] = useState<DatabaseModelVariant>("full");
  const { l } = usePage();
  if (!database) return null;
  const activeVariant = database.variants[variant] ?? getDefaultVariant(database);
  return (
    <div className="collapse-arrow collapse bg-base-200">
      <input type="checkbox" defaultChecked={openAll} />
      <div className="collapse-title">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-bold text-xl">{database.modelName}</div>
          <div className="badge badge-primary">{database.refName}</div>
          <div className="text-base-content/70 text-sm">{l._(`${database.refName}.modelDesc`)}</div>
        </div>
      </div>
      <div className="collapse-content flex flex-col gap-3">
        <VariantTabs variant={variant} onChange={setVariant} />
        <ModelVariantTable variant={activeVariant} />
      </div>
    </div>
  );
};
Doc.Model = Model;

interface ScalarProps {
  refName?: string;
  scalar?: ScalarSchema;
  openAll?: boolean;
}

const Scalar = ({ refName, scalar: scalarProp, openAll }: ScalarProps) => {
  const scalar = useMemo(
    () => scalarProp ?? getConstantSchemaDoc({ scalars: refName ? [refName] : [] }).scalars.at(0),
    [scalarProp, refName],
  );
  const { l } = usePage();
  if (!scalar) return null;
  return (
    <div className="collapse-arrow collapse bg-base-200">
      <input type="checkbox" defaultChecked={openAll} />
      <div className="collapse-title">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-bold text-xl">{scalar.modelName}</div>
          <div className="badge badge-secondary">{scalar.refName}</div>
          <div className="text-base-content/70 text-sm">{l._(`${scalar.refName}.modelDesc`)}</div>
        </div>
      </div>
      <div className="collapse-content">
        <FieldTable refName={scalar.refName} fields={scalar.fields} />
      </div>
    </div>
  );
};
Doc.Scalar = Scalar;

interface EnumProps {
  enums?: ReturnType<typeof getConstantSchemaDoc>["enums"];
}

const EnumList = ({ enums = getConstantSchemaDoc().enums }: EnumProps) => {
  const { l } = usePage();
  return (
    <div className="overflow-x-auto rounded-xl bg-base-200 p-3">
      <table className="table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Ref Name</th>
            <th>Type</th>
            <th>Values</th>
            <th>Used By</th>
          </tr>
        </thead>
        <tbody>
          {enums.map((enumSchema) => (
            <tr key={enumSchema.key}>
              <td>{enumSchema.key}</td>
              <td>{enumSchema.refName}</td>
              <td>{enumSchema.typeName}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {enumSchema.values.map((value) => (
                    <div
                      key={String(value)}
                      className="tooltip tooltip-primary"
                      data-tip={l._(`${enumSchema.refName}.${value}`)}
                    >
                      <button className="btn btn-xs">{String(value)}</button>
                    </div>
                  ))}
                </div>
              </td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {enumSchema.usedBy.length
                    ? enumSchema.usedBy.map((usage) => (
                        <span
                          key={`${usage.refName}-${usage.variant}-${usage.fieldKey}`}
                          className="badge badge-outline"
                        >
                          {usage.refName}.{usage.fieldKey}
                        </span>
                      ))
                    : "-"}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
Doc.Enum = EnumList;

const VariantTabs = ({
  variant,
  onChange,
}: {
  variant: DatabaseModelVariant;
  onChange: (variant: DatabaseModelVariant) => void;
}) => (
  <div className="tabs tabs-box w-fit">
    {databaseModelVariants.map((item) => (
      <button key={item} className={`tab ${variant === item ? "tab-active" : ""}`} onClick={() => onChange(item)}>
        {getVariantTitle(item)}
      </button>
    ))}
  </div>
);

const ModelVariantTable = ({ variant }: { variant: ReturnType<typeof getDefaultVariant> }) => (
  <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <div className="font-extrabold text-lg">{variant.modelName}</div>
      <div className="badge badge-outline">{getVariantTitle(variant.variant)}</div>
      <div className="text-base-content/60 text-sm">{variant.fields.length} fields</div>
    </div>
    <FieldTable refName={variant.refName} fields={variant.fields} />
  </div>
);

const PrintDatabase = ({ database }: { database: DatabaseSchema }) => {
  const { l } = usePage();
  return (
    <section className="flex break-after-page flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-bold text-3xl">{database.modelName}</div>
          <div className="badge badge-primary print:border print:border-black print:bg-white print:text-black">
            {database.refName}
          </div>
        </div>
        <div className="mt-2 text-base-content/70 print:text-black">{l._(`${database.refName}.modelDesc`)}</div>
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
          <div className="badge badge-secondary print:border print:border-black print:bg-white print:text-black">
            {scalar.refName}
          </div>
        </div>
        <div className="mt-1 text-base-content/70 print:text-black">{l._(`${scalar.refName}.modelDesc`)}</div>
      </div>
      <PrintFieldTable refName={scalar.refName} fields={scalar.fields} />
    </section>
  );
};

const PrintSectionTitle = ({ title }: { title: string }) => <div className="font-bold text-3xl">{title}</div>;

const PrintVariantHeader = ({ title, badge, fields }: { title: string; badge: string; fields: number }) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="font-extrabold text-xl">{title}</div>
    <div className="badge badge-outline print:border print:border-black">{badge}</div>
    <div className="text-base-content/60 text-sm print:text-black">{fields} fields</div>
  </div>
);

const FieldTable = ({ refName, fields }: { refName: string; fields: FieldSchema[] }) => {
  const { l } = usePage();
  const [selectedField, setSelectedField] = useState<FieldSchema | null>(null);
  return (
    <>
      <div className="overflow-x-auto rounded-xl bg-base-100 p-3">
        <table className="table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Type</th>
              <th>Required</th>
              <th>Field Type</th>
              <th>Relation</th>
              <th>Default</th>
              <th>Constraints</th>
              <th>Enum</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.key}>
                <td>
                  <div className="font-bold">{field.key}</div>
                  <div className="text-base-content/60 text-xs">{l._(`${refName}.${field.key}`)}</div>
                </td>
                <td>
                  <span className={field.typeKind === "primitive" ? "" : "badge badge-primary badge-outline"}>
                    {field.typeLabel}
                  </span>
                </td>
                <td>
                  {field.required ? (
                    <span className="badge badge-error">Required</span>
                  ) : (
                    <span className="badge">Optional</span>
                  )}
                </td>
                <td>
                  <span className="badge badge-outline">{field.fieldType}</span>
                  {!field.select ? <span className="badge badge-warning ml-1">select:false</span> : null}
                </td>
                <td>
                  {field.relationLabel ? <span className="badge badge-secondary">{field.relationLabel}</span> : "-"}
                </td>
                <td className="max-w-48 truncate">{field.defaultLabel ?? "-"}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {field.constraints.length
                      ? field.constraints.map((constraint) => (
                          <span key={constraint} className="badge badge-outline">
                            {constraint}
                          </span>
                        ))
                      : "-"}
                  </div>
                </td>
                <td>
                  {field.enumValues ? (
                    <div className="flex flex-wrap gap-1">
                      {field.enumValues.map((value) => (
                        <span key={String(value)} className="badge">
                          {String(value)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="min-w-52">{l._(`${refName}.${field.key}.desc`)}</td>
                <td>
                  <button className="btn btn-ghost btn-xs" onClick={() => setSelectedField(field)}>
                    <AiOutlineInfoCircle /> Detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FieldDetailModal refName={refName} field={selectedField} onClose={() => setSelectedField(null)} />
    </>
  );
};

const PrintFieldTable = ({ refName, fields }: { refName: string; fields: FieldSchema[] }) => {
  const { l } = usePage();
  return (
    <div className="overflow-x-auto rounded-xl bg-base-100 p-3 print:overflow-visible print:rounded-none print:p-0">
      <table className="table-sm table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Type</th>
            <th>Required</th>
            <th>Field Type</th>
            <th>Relation</th>
            <th>Default</th>
            <th>Constraints</th>
            <th>Enum</th>
            <th>Description</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.key} className="break-inside-avoid">
              <td>
                <div className="font-bold">{field.key}</div>
                <div className="text-base-content/60 text-xs print:text-black">{l._(`${refName}.${field.key}`)}</div>
              </td>
              <td>{field.typeLabel}</td>
              <td>{field.required ? "Required" : "Optional"}</td>
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
        </tbody>
      </table>
    </div>
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
    <div className="overflow-x-auto rounded-xl bg-base-100 p-3 print:overflow-visible print:rounded-none print:p-0">
      <table className="table-sm table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Ref Name</th>
            <th>Type</th>
            <th>Values</th>
            <th>Descriptions</th>
            <th>Used By</th>
          </tr>
        </thead>
        <tbody>
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
        </tbody>
      </table>
    </div>
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
    <Modal
      title={`${refName}.${field.key}`}
      open={!!field}
      onCancel={onClose}
      className="max-w-3xl"
      bodyClassName="flex flex-col gap-4"
    >
      <div>
        <div className="font-bold text-lg">{l._(`${refName}.${field.key}`)}</div>
        <div className="text-base-content/70">{l._(`${refName}.${field.key}.desc`)}</div>
      </div>
      <pre className="max-h-[60vh] overflow-auto rounded-xl bg-base-200 p-4 text-sm">
        {JSON.stringify(detail, null, 2)}
      </pre>
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

const SummaryCard = ({ title, value }: { title: string; value: number }) => (
  <div className="rounded-xl bg-base-200 p-4">
    <div className="text-base-content/60 text-sm">{title}</div>
    <div className="font-bold text-2xl">{value}</div>
  </div>
);

const Diagram = ({ databases, scalars }: { databases: DatabaseSchema[]; scalars: ScalarSchema[] }) => {
  const [selectedNode, setSelectedNode] = useState<string | null>(
    databases.at(0)?.refName ?? scalars.at(0)?.refName ?? null,
  );
  const graph = useMemo(() => makeDiagram(databases, scalars), [databases, scalars]);
  const selectedRefName = selectedNode ? graph.nodeRefNames.get(selectedNode) : undefined;
  const selectedDatabase = selectedRefName
    ? databases.find((database) => database.refName === selectedRefName)
    : undefined;
  const selectedScalar = selectedRefName ? scalars.find((scalar) => scalar.refName === selectedRefName) : undefined;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Mermaid
        title="Schema Relationship Diagram"
        chart={graph.chart}
        highlightNodes={selectedNode ? [selectedNode] : []}
        onSelectNode={setSelectedNode}
      />
      <div className="rounded-xl bg-base-200 p-4">
        <div className="font-bold text-xl">Selected Model</div>
        {selectedDatabase ? (
          <Model database={selectedDatabase} openAll />
        ) : selectedScalar ? (
          <Scalar scalar={selectedScalar} openAll />
        ) : selectedRefName ? (
          <div className="mt-4">
            <div className="badge badge-outline">External</div>
            <div className="mt-2 font-bold">{selectedRefName}</div>
          </div>
        ) : (
          <div className="mt-4 text-base-content/60">Select a node in the diagram.</div>
        )}
      </div>
    </div>
  );
};

const makeDiagram = (databases: DatabaseSchema[], scalars: ScalarSchema[]) => {
  const schemaDoc = getConstantSchemaDoc({
    models: databases.map((database) => database.refName),
    scalars: scalars.map((scalar) => scalar.refName),
  });
  const nodeRefNames = new Map<string, string>();
  const nodeLines = new Map<string, string>();
  const addNode = (refName: string, label: string) => {
    const nodeId = toMermaidNodeId(refName);
    nodeRefNames.set(nodeId, refName);
    nodeLines.set(nodeId, `  ${nodeId}["${escapeMermaidLabel(label)}"]`);
  };
  databases.forEach((database) => {
    addNode(database.refName, `${database.modelName}\\n${database.refName}`);
  });
  scalars.forEach((scalar) => {
    addNode(scalar.refName, `${scalar.modelName}\\n${scalar.refName}`);
  });
  schemaDoc.relations.forEach((relation) => {
    if (!nodeLines.has(toMermaidNodeId(relation.targetRefName))) {
      addNode(relation.targetRefName, `${capitalize(relation.targetRefName)}\\nexternal`);
    }
  });
  const edgeLines = schemaDoc.relations.map((relation) => {
    const from = toMermaidNodeId(relation.sourceRefName);
    const to = toMermaidNodeId(relation.targetRefName);
    const label = escapeMermaidLabel(`${relation.fieldKey}: ${relation.relationType}`);
    return `  ${from} -->|"${label}"| ${to}`;
  });
  const chart = ["flowchart LR", ...nodeLines.values(), ...edgeLines].join("\n");
  return { chart, nodeRefNames };
};

const toMermaidNodeId = (refName: string) => `schema_${refName.replace(/[^a-zA-Z0-9_]/g, "_")}`;

const escapeMermaidLabel = (label: string) => label.replace(/"/g, '\\"');

const matchesQuery = (value: string, query: string) => value.toLowerCase().includes(query.trim().toLowerCase());
