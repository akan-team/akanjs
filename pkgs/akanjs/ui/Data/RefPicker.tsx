"use client";
import { cn, fetch, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { ConstantRegistry, labelOf } from "akanjs/constant";
import { useEffect, useState } from "react";
import { AiOutlineClose, AiOutlineSearch } from "react-icons/ai";
import { buttonRecipe } from "../Button";
import { Empty } from "../Empty";
import { Loading } from "../Loading";
import { Modal } from "../Modal";
import { dictLabel } from "./dataText";
import { isReadyQuery, QueryMakerArgs, QueryMakerKey, type ResolvedQuerySetting, useQueryMaker } from "./QueryMaker";

interface RefPickerProps {
  className?: string;
  /** The model this id points at, named by the filter arg's `ref`. */
  refName: string;
  value: string | null;
  onChange: (id: string | null) => void;
}
interface RefRow {
  id: string;
  label?: string;
}

const pageSize = 20;

/**
 * Picks one row of a referenced model instead of asking for its hex id. Rows are held here rather than in the
 * ref model's store: that store is a singleton, so a picker loading into it would overwrite whatever listing of
 * the same model is already on the screen — and a picker opened from inside a picker would overwrite itself.
 *
 * The search is the ref model's own root slice, which is Admin-guarded, so this belongs to admin surfaces.
 */
export default function RefPicker({ className, refName, value, onChange }: RefPickerProps) {
  const { l } = usePage();
  const slice = fetch.slice[refName];
  const filterQuery = fetch.filterQueryMap?.get(refName) ?? {};
  // The conventional name for a model's text search. Opening on it puts the one control a picker wants in front
  // of the user; a model without one opens on the newest rows.
  const initialKey = filterQuery.bySearch ? "bySearch" : "any";
  const initialQuery: ResolvedQuerySetting = { queryKey: initialKey, args: [] };

  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<ResolvedQuerySetting>(initialQuery);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<RefRow[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<RefRow | null>(null);

  const state = useQueryMaker({
    slice,
    query: initialQuery,
    onApply: (setting) => {
      setPage(1);
      setApplied(setting);
    },
  });

  useEffect(() => {
    if (!open) return;
    if (!isReadyQuery(filterQuery[applied.queryKey] ?? [], applied.args)) {
      setRows([]);
      return;
    }
    const listFn = fetch[`${refName}List`] as (...args: unknown[]) => Promise<Record<string, unknown>[]>;
    const cnst = ConstantRegistry.getDatabase(refName);
    let cancelled = false;
    setLoading(true);
    setError(null);
    // One row past the page, so "next" is known without a second request for the count.
    void listFn(applied.queryKey, applied.args, (page - 1) * pageSize, pageSize + 1, "latest")
      .then((list) => {
        if (cancelled) return;
        setHasNext(list.length > pageSize);
        setRows(list.slice(0, pageSize).map((row) => ({ id: String(row.id), label: labelOf(cnst.full, row) })));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, applied, page, refName]);

  const modelLabel = dictLabel(l._, `${refName}.modelName`, refName);
  const selectLabel = l.trans({ en: `Select ${modelLabel}`, ko: `${modelLabel} 선택` });
  const selected = picked?.id === value ? picked.label : undefined;
  const unlabeled = !!rows.length && rows.every((row) => !row.label);

  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <button
        className={buttonRecipe({ variant: "outline", size: "sm" }, "min-w-0 flex-1 justify-start")}
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        <AiOutlineSearch className="shrink-0 text-foreground/50" />
        <span className={cn("truncate", value ? (selected ? "" : "font-mono") : "text-foreground/45")}>
          {selected ?? value ?? selectLabel}
        </span>
      </button>
      {value ? (
        <button
          className={buttonRecipe({ variant: "ghost", size: "icon" }, "size-8 shrink-0 text-foreground/50")}
          onClick={() => {
            setPicked(null);
            onChange(null);
          }}
          type="button"
        >
          <AiOutlineClose />
        </button>
      ) : null}
      <Modal
        className="max-w-xl"
        open={open}
        onCancel={() => {
          setOpen(false);
        }}
        title={selectLabel}
      >
        <div className="flex flex-col gap-2">
          <QueryMakerKey slice={slice} state={state} />
          <QueryMakerArgs className="mb-0" slice={slice} state={state} />
          {error ? (
            <div className="rounded-box border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-xs">
              {error}
            </div>
          ) : null}
          {unlabeled ? (
            <div className="rounded-box border border-warning/30 bg-warning/10 px-3 py-2 text-foreground/70 text-xs">
              {l.trans({
                en: `These rows show their id because "${refName}" has no label. Add a label() method to Light${capitalize(refName)}, or mark one field with { text: "title" }.`,
                ko: `"${refName}"에 라벨이 없어 id를 표시합니다. Light${capitalize(refName)}에 label() 메서드를 추가하거나 필드 하나에 { text: "title" }을 지정하세요.`,
              })}
            </div>
          ) : null}
          {loading ? (
            <Loading.Skeleton active />
          ) : rows.length ? (
            <div className="flex flex-col divide-y divide-border">
              {rows.map((row) => (
                <button
                  className={cn(
                    "flex items-center justify-between gap-3 px-2 py-2.5 text-left hover:bg-muted",
                    row.id === value && "bg-primary/10",
                  )}
                  key={row.id}
                  onClick={() => {
                    setPicked(row);
                    onChange(row.id);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className={cn("min-w-0 truncate text-sm", row.label ? "" : "font-mono")}>
                    {row.label ?? row.id}
                  </span>
                  {row.label ? <span className="shrink-0 font-mono text-foreground/40 text-xs">{row.id}</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <Empty minHeight={160} />
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              className={buttonRecipe({ variant: "ghost", size: "sm" })}
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
              }}
              type="button"
            >
              {l.trans({ en: "Prev", ko: "이전" })}
            </button>
            <span className="text-foreground/45 text-xs">{page}</span>
            <button
              className={buttonRecipe({ variant: "ghost", size: "sm" })}
              disabled={!hasNext}
              onClick={() => {
                setPage(page + 1);
              }}
              type="button"
            >
              {l.trans({ en: "Next", ko: "다음" })}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
