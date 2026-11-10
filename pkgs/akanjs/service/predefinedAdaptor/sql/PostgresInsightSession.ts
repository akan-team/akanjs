import type { Options, PostgresType, Sql, UnsafeQueryOptions } from "postgres";
import { InsightQueryError } from "../../insightQueryError";
import type { InsightSession } from "./types";
import { quoteIdent } from "./values";

interface PostgresInsightSessionProps {
  url: string;
  schema: string;
  options: Options<Record<string, PostgresType>>;
}

interface InsightRole {
  role: string;
  superuser: boolean;
  memberOf: string[];
  reads: string[];
}

/**
 * Its own login as a role with SELECT on base columns only, so Postgres refuses `_doc` however it is reached (`*`, a
 * whole-row value, `query_to_xml`). Not `SET ROLE`: a statement could `set_config('role', 'none', true)` its way back
 * to the app's role. A role that can read `_doc` anywhere is refused on open.
 */
export class PostgresInsightSession implements InsightSession {
  // postgres.js runs a parameterless `unsafe()` over the simple protocol, every statement in it; types omit `simple`.
  static readonly #extendedProtocol = { simple: false } as unknown as UnsafeQueryOptions;
  readonly #sql: Sql;
  readonly #schema: string;

  private constructor(sql: Sql, schema: string) {
    this.#sql = sql;
    this.#schema = schema;
  }

  static async open({ url, schema, options }: PostgresInsightSessionProps) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { ...options, max: 1, connection: { application_name: "akan-insight" } });
    const session = new PostgresInsightSession(sql, schema);
    try {
      await session.#assertRestricted();
      await session.#shadowDocuments();
    } catch (error) {
      await session.close();
      throw error;
    }
    return session;
  }

  async #assertRestricted() {
    const [role] = (await this.#sql.unsafe(
      `SELECT r.rolname AS "role", r.rolsuper AS "superuser",
        ARRAY(SELECT m.rolname::text FROM pg_roles m WHERE m.oid <> r.oid AND pg_has_role(r.oid, m.oid, 'MEMBER') ORDER BY 1) AS "memberOf",
        ARRAY(SELECT c.oid::regclass::text FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE a.attname = '_doc' AND a.attnum > 0 AND NOT a.attisdropped AND has_column_privilege(c.oid, a.attnum, 'SELECT') ORDER BY 1) AS "reads"
      FROM pg_roles r WHERE r.rolname = current_user`,
    )) as unknown as InsightRole[];
    const refusal = !role
      ? "cannot see its own role"
      : role.superuser
        ? `logs in as "${role.role}", a superuser`
        : role.memberOf.length
          ? `logs in as "${role.role}", a member of ${role.memberOf.join(", ")}, whose privileges it can take on`
          : role.reads.length
            ? `logs in as "${role.role}", which can read \`_doc\` of ${role.reads.join(", ")}`
            : null;
    if (refusal)
      throw new InsightQueryError(
        "insightUnavailable",
        `The insight connection ${refusal}. It must be a login role of its own that can read base columns and nothing else.`,
      );
  }

  // `SELECT *` over a model table reads the view, which holds what the role may read; the table itself refuses it.
  async #shadowDocuments() {
    const tables = (await this.#sql.unsafe(
      `SELECT c.relname AS "table", array_agg(a.attname::text ORDER BY a.attnum) AS "columns"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND a.attname <> '_doc'
        AND has_column_privilege(c.oid, a.attnum, 'SELECT')
        AND EXISTS (SELECT 1 FROM pg_attribute d WHERE d.attrelid = c.oid AND d.attname = '_doc' AND NOT d.attisdropped)
      GROUP BY c.relname`,
      [this.#schema],
    )) as unknown as { table: string; columns: string[] }[];
    if (!tables.length) return;
    await this.#sql.unsafe(
      tables
        .map(
          ({ table, columns }) =>
            `CREATE TEMP VIEW ${quoteIdent(table)} AS SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(this.#schema)}.${quoteIdent(table)}`,
        )
        .join(";\n"),
    );
  }

  async read(statement: string, timeoutMs: number) {
    try {
      return await this.#sql.begin("read only", async (transaction) => {
        await transaction.unsafe(`SET LOCAL search_path = ${quoteIdent(this.#schema)}`);
        await transaction.unsafe(`SET LOCAL statement_timeout = ${Math.max(1, Math.floor(timeoutMs))}`);
        const rows = await transaction.unsafe(statement, [], PostgresInsightSession.#extendedProtocol);
        return [...rows] as Record<string, unknown>[];
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      //? Security: the driver's text names the table, schema or function the statement reached for; it stays the cause.
      if (code === "42501")
        throw new InsightQueryError(
          "invalidInsightQuery",
          "An insight query reads base columns, and the role it runs as may read nothing else.",
          { cause: error },
        );
      //? 57014 is the `statement_timeout` above cancelling it: the deadline `InsightQuery` races, reached here first.
      if (code === "57014")
        throw new InsightQueryError("insightTimeout", `Insight query exceeded ${timeoutMs}ms.`, { cause: error });
      throw error;
    }
  }

  async close() {
    await this.#sql.end({ timeout: 1 });
  }
}
