"use client";
import { Any, Int } from "akanjs/base";
import { st } from "akanjs/store";

interface PageToolOptions {
  /** The slice's own `setPageOf<Model>`, or null while the screen draws no pager — one page needs no control. */
  name: string | null;
  /** The model's refName, for the description an agent picks the tool by. */
  model: string;
  page: number;
  lastPage: number;
  total: number;
  onSelect: (page: number) => void;
}

/**
 * Publishes one pager: the `setPageOf<Model>` its control already dispatches, plus the counts an agent needs to
 * aim it. Shared by the three components that draw a pager so all three speak the slice's one name.
 *
 * The page count rides the guard and the resource rather than the description, which is mount-static and would
 * keep quoting whatever the list held on its first render.
 */
export const usePageTool = ({ name, model, page, lastPage, total, onSelect }: PageToolOptions) => {
  st.expose(name ? `pagesOf${model.charAt(0).toUpperCase()}${model.slice(1)}` : null, Any)
    .desc(`Where the ${model} list is paged to.`)
    .value({ page, lastPage, total });
  return st
    .tool(name, {
      guard: ({ page }) =>
        Number(page) >= 1 && Number(page) <= lastPage
          ? true
          : `The ${model} list has ${lastPage} page${lastPage === 1 ? "" : "s"}.`,
    })
    .desc(`Turn the ${model} list to one page.`)
    .arg("page", Int)
    .exec(onSelect);
};
