import type { PromiseOrObject } from "akanjs/base";
import type { FieldToValue, ParamFieldType } from "akanjs/constant";
import type { MigrationChanges } from "./migrationChanges";
import type { MigrationContext } from "./migrationContext";
import { type MigrationParamOption, MigrationParams, type MigrationParamValue } from "./migrationParams";
import { MigrationScope } from "./migrationScope";

export interface MigrationPlan<Item = unknown> {
  /** What a person approving the run reads before it writes anything. */
  summary: Record<string, unknown>;
  /** The decisions `apply` carries out; hashed with the params, so a changed one refuses an approved apply. */
  items?: Item[];
}

export interface MigrationSettings {
  /** `false` commits as it goes, each `rewrite` batch with where it got to: for runs too long for one transaction. */
  transaction: boolean;
  batchSize: number;
}

type MigrationStage<Params, Result> = (ctx: MigrationContext<Params>) => PromiseOrObject<Result>;

export class MigrationDefinition<Params = Record<never, never>, Plan extends MigrationPlan = MigrationPlan> {
  //* Interned: a definition from a migration chunk is recognised by a runner loaded from another module copy.
  static readonly #marker = Symbol.for("akan.migrationDefinition");
  static readonly defaultSettings: MigrationSettings = { transaction: true, batchSize: 500 };
  readonly title: string;
  readonly params = new MigrationParams();
  settings: MigrationSettings = { ...MigrationDefinition.defaultSettings };
  planStage: MigrationStage<Params, Plan> | null = null;
  applyStage: ((ctx: MigrationContext<Params>, plan: Plan) => PromiseOrObject<void>) | null = null;
  verifyStage: MigrationStage<Params, string[]> | null = null;
  rollbackStage: ((ctx: MigrationContext<Params>, changes: MigrationChanges) => PromiseOrObject<void>) | null = null;

  constructor(title: string) {
    this.title = title;
    Object.defineProperty(this, MigrationDefinition.#marker, { value: true });
  }

  static is(value: unknown): value is MigrationDefinition<Record<string, unknown>> {
    return (
      !!value && typeof value === "object" && (value as Record<symbol, unknown>)[MigrationDefinition.#marker] === true
    );
  }

  param<
    Name extends string,
    Type extends ParamFieldType,
    const Option extends MigrationParamOption<FieldToValue<Type>> = Record<never, never>,
  >(name: Name, type: Type, option?: Option) {
    this.params.declare({ ...option, name, type });
    return this as unknown as MigrationDefinition<Params & { [K in Name]: MigrationParamValue<Type, Option> }, Plan>;
  }

  /** Reads only, and returns the report a person approves; `apply` recomputes it inside its own transaction. */
  plan<NextPlan extends MigrationPlan>(fn: MigrationStage<Params, NextPlan>) {
    const next = this as unknown as MigrationDefinition<Params, NextPlan>;
    next.planStage = fn;
    return next;
  }

  apply(fn: (ctx: MigrationContext<Params>, plan: Plan) => PromiseOrObject<void>) {
    this.applyStage = fn;
    return this;
  }

  /** Runs right after apply commits; each string is one problem, and none means the data is as intended. */
  verify(fn: MigrationStage<Params, string[]>) {
    this.verifyStage = fn;
    return this;
  }

  /** Replaces the default rollback, which reverts every logged change whose row still holds what it wrote. */
  rollback(fn: (ctx: MigrationContext<Params>, changes: MigrationChanges) => PromiseOrObject<void>) {
    this.rollbackStage = fn;
    return this;
  }

  config(settings: Partial<MigrationSettings>) {
    if (settings.batchSize !== undefined) MigrationScope.assertBatchSize(settings.batchSize);
    this.settings = { ...this.settings, ...settings };
    return this;
  }
}

/** A data migration in `script/migration/<yyyyMMddHHmm>_<name>.ts`, exported as the file's default. */
export const migration = (title: string) => new MigrationDefinition(title);
