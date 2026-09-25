"use client";

import { usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { useMemo, useState } from "react";
import { AiOutlineInfoCircle, AiOutlineSearch } from "react-icons/ai";
import { BiNetworkChart, BiTable } from "react-icons/bi";

import { buttonRecipe } from "../Button";
import { Input } from "../Input";
import { Modal } from "../Modal";
import {
  Code,
  Collapse,
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
import { Graph } from "./Graph";
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
import type { SchemaGraphEdge, SchemaGraphNode, SchemaNodeKind } from "./schemaGraph";

export default function Doc() {
  return <div />;
}

const viewItems = [
  { key: "table", label: "Table", icon: <BiTable /> },
  { key: "diagram", label: "Diagram", icon: <BiNetworkChart /> },
] as const;

const variantItems = databaseModelVariants.map((variant) => ({ key: variant, label: getVariantTitle(variant) }));

/** A model reference is the one type a reader may want to look up elsewhere, so only those carry colour. */
const typeTone = (field: FieldSchema) =>
  field.typeKind === "database" || field.typeKind === "scalar" ? "info" : "muted";

const typeLabelOf = (field: FieldSchema) => `${field.typeLabel}${field.required ? "!" : ""}`;

/** A declared `null` default is the same as none, and a column of them reads as data the field does not carry. */
const defaultLabelOf = (field: FieldSchema) => (field.defaultLabel === "null" ? undefined : field.defaultLabel);

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
    <div className="flex break-after-page flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className={docUi.pageTitle}>Constant Schema Docs</h1>
        <p className={docUi.sectionDescription}>
          Database models, scalar models, enums, and relations from ConstantRegistry.
        </p>
      </div>
      <SummaryGrid>
        <SummaryCard label="Database Models" value={filteredDatabases.length} />
        <SummaryCard label="Scalar Models" value={filteredScalars.length} />
        <SummaryCard label="Enums" value={filteredEnums.length} />
        <SummaryCard label="Relations" value={schemaDoc.relations.length} />
      </SummaryGrid>
      <Toolbar>
        <Input
          icon={<AiOutlineSearch className="text-foreground/40" />}
          iconClassName="-mr-8 z-10 pl-3"
          inputClassName="w-72 pl-9"
          nullable
          onChange={setQuery}
          placeholder="Search models or enums"
          value={query}
        />
        <Segmented className="ml-auto" items={viewItems} onChange={setViewMode} value={viewMode} />
      </Toolbar>
      {viewMode === "diagram" ? (
        <Diagram databases={filteredDatabases} scalars={filteredScalars} />
      ) : (
        <div className="flex flex-col gap-6">
          <Section title="Database Models">
            {filteredDatabases.length ? (
              <div className="flex flex-col gap-2">
                {filteredDatabases.map((database) => (
                  <Model key={database.refName} database={database} openAll={openAll} />
                ))}
              </div>
            ) : (
              <div className={docUi.emptyPanel}>No database model matches.</div>
            )}
          </Section>
          {filteredScalars.length ? (
            <Section title="Scalar Models">
              <div className="flex flex-col gap-2">
                {filteredScalars.map((scalar) => (
                  <Scalar key={scalar.refName} scalar={scalar} openAll={openAll} />
                ))}
              </div>
            </Section>
          ) : null}
          {filteredEnums.length ? (
            <Section title="Enums">
              <EnumList enums={filteredEnums} />
            </Section>
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
    <div className="flex flex-col gap-10 bg-background text-foreground print:bg-white print:text-black">
      <div className="break-after-page">
        <div className="font-bold text-4xl">Constant Schema Definition</div>
        <div className="mt-2 text-foreground/70 print:text-black">
          Database models, scalar models, enums, and relations from ConstantRegistry.
        </div>
        <SummaryGrid className="mt-6">
          <SummaryCard label="Database Models" value={schemaDoc.databases.length} />
          <SummaryCard label="Scalar Models" value={schemaDoc.scalars.length} />
          <SummaryCard label="Enums" value={schemaDoc.enums.length} />
          <SummaryCard label="Relations" value={schemaDoc.relations.length} />
        </SummaryGrid>
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
    <Collapse
      open={openAll}
      summary={
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-lg">{database.modelName}</span>
            <span className={docPill("info", "font-mono")}>{database.refName}</span>
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
    <Collapse
      open={openAll}
      summary={
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-lg">{scalar.modelName}</span>
            <span className={docPill("muted", "font-mono")}>{scalar.refName}</span>
          </div>
          <div className="text-foreground/55 text-sm">{l._(`${scalar.refName}.modelDesc`)}</div>
        </div>
      }
    >
      <FieldTable refName={scalar.refName} fields={scalar.fields} />
    </Collapse>
  );
};
Doc.Scalar = Scalar;

interface EnumProps {
  enums?: ReturnType<typeof getConstantSchemaDoc>["enums"];
}

const EnumList = ({ enums = getConstantSchemaDoc().enums }: EnumProps) => {
  const { l } = usePage();
  return (
    <div className={docUi.tablePanel}>
      <table className={docUi.tableClass}>
        <thead>
          <tr>
            <th>Enum</th>
            <th>Type</th>
            <th>Values</th>
            <th>Used By</th>
          </tr>
        </thead>
        <tbody>
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
        </tbody>
      </table>
    </div>
  );
};
Doc.Enum = EnumList;

const ModelVariantTable = ({ variant }: { variant: ReturnType<typeof getDefaultVariant> }) => (
  <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-base">{variant.modelName}</span>
      <span className={docPill("muted")}>{getVariantTitle(variant.variant)}</span>
      <span className="text-foreground/45 text-sm">{variant.fields.length} fields</span>
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

const PrintVariantHeader = ({ title, badge, fields }: { title: string; badge: string; fields: number }) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="font-extrabold text-xl">{title}</div>
    <div className={docPill("muted", "print:border print:border-black")}>{badge}</div>
    <div className="text-foreground/60 text-sm print:text-black">{fields} fields</div>
  </div>
);

const FieldTable = ({ refName, fields }: { refName: string; fields: FieldSchema[] }) => {
  const { l } = usePage();
  const [selectedField, setSelectedField] = useState<FieldSchema | null>(null);
  return (
    <>
      <div className={docUi.tablePanel}>
        <table className={docUi.tableClass}>
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Kind</th>
              <th>Default</th>
              <th>Constraints</th>
              <th>Values</th>
              <th className="w-1/4">Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
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
                        <span
                          className={buttonRecipe({ variant: "outline", size: "xs" }, "font-mono")}
                          key={String(value)}
                        >
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
    <div className="overflow-x-auto rounded-box border border-border bg-background print:overflow-visible print:rounded-none print:border-0">
      <table className={docUi.tableClass}>
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
                <div className="text-foreground/60 text-xs print:text-black">{l._(`${refName}.${field.key}`)}</div>
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
    <div className="overflow-x-auto rounded-box border border-border bg-background print:overflow-visible print:rounded-none print:border-0">
      <table className={docUi.tableClass}>
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
      <Code code={JSON.stringify(detail, null, 2)} label="Field" />
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
        title="Schema Relationship Diagram"
      />
      <Panel bodyClassName="max-h-none" label="Selected Model">
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
            <span className={docPill("muted")}>External</span>
            <span className="font-bold">{selectedRefName}</span>
          </div>
        ) : (
          <div className="text-foreground/40 text-sm">Select a node in the diagram.</div>
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
    // One arrow per pair: a model reaching the same target through several fields drew a bundle of identical
    // arrows, and the field names read better joined into that one arrow's label.
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
