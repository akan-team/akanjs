export const studioRuntime = () => {
  const select = document.querySelector<HTMLSelectElement>("select[data-studio-module]");
  select?.addEventListener("change", () => select.form?.submit());
  const svg = document.querySelector<SVGSVGElement>("svg[data-studio]");
  if (!svg) return;
  const links = [...svg.querySelectorAll<SVGPathElement>("path[data-from]")];
  const boxes = new Map(
    [...svg.querySelectorAll<SVGGElement>("g[data-node]")].map((box) => [box.dataset.node ?? "", box] as const),
  );
  let pinned: string | null = null;
  const focus = (id: string | null) => {
    svg.classList.toggle("focused", id !== null);
    const near = new Set(id ? [id] : []);
    for (const link of links) {
      const isHot = id !== null && (link.dataset.from === id || link.dataset.to === id);
      link.classList.toggle("hot", isHot);
      if (isHot) for (const end of [link.dataset.from, link.dataset.to]) if (end) near.add(end);
    }
    for (const [key, box] of boxes) box.classList.toggle("hot", near.has(key));
  };
  for (const [id, box] of boxes) {
    box.addEventListener("mouseenter", () => {
      if (!pinned) focus(id);
    });
    box.addEventListener("mouseleave", () => {
      if (!pinned) focus(null);
    });
    box.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a[href]")) return;
      pinned = pinned === id ? null : id;
      focus(pinned ?? id);
    });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    pinned = null;
    focus(null);
  });
  const filter = document.querySelector<HTMLInputElement>("input[data-studio-filter]");
  filter?.addEventListener("input", () => {
    const query = filter.value.trim().toLowerCase();
    for (const box of boxes.values())
      box.classList.toggle("muted", query !== "" && !(box.dataset.label ?? "").toLowerCase().includes(query));
  });
};
