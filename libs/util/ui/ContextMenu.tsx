"use client";
import { usePage } from "@libs/util/client";
import { Copy, Dropdown } from "akanjs/ui";
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { BiCopy, BiLinkExternal } from "react-icons/bi";
import { menuItemClass } from "./Recipe";

export const contextMenuItemClass = menuItemClass;

interface ContextMenuTarget {
  id: string;
  href: string | null;
  x: number;
  y: number;
}

interface ContextMenuProps {
  /** The data attribute each row carries its id in, such as `data-channel-id`. */
  attr: string;
  /** The right-clicked row's own items. Open in a new tab and copy link follow whenever the row holds a link. */
  renderMenu?: (id: string) => ReactNode;
  children: ReactNode;
}
export const ContextMenu = ({ attr, renderMenu, children }: ContextMenuProps) => {
  const { l } = usePage();
  const [target, setTarget] = useState<ContextMenuTarget | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // `Dropdown` has no open prop and positions against its trigger, so a zero-size trigger at the pointer is clicked.
  useEffect(() => {
    if (target) triggerRef.current?.click();
  }, [target]);
  const openAt = (event: MouseEvent<HTMLDivElement>) => {
    // A nested list with a menu of its own has already claimed the event.
    if (event.nativeEvent.defaultPrevented || !(event.target instanceof Element)) return;
    const row = event.target.closest(`[${attr}]`);
    const id = row?.getAttribute(attr);
    if (!row || !id || !event.currentTarget.contains(row)) return;
    event.preventDefault();
    const link = row.matches("a[href]") ? row : row.querySelector("a[href]");
    // The context-menu key fires at (0, 0); open under the row instead of the screen's corner.
    const isKeyboard = event.clientX === 0 && event.clientY === 0;
    const rect = row.getBoundingClientRect();
    setTarget({
      id,
      href: link instanceof HTMLAnchorElement ? link.href : null,
      x: isKeyboard ? rect.left : event.clientX,
      y: isKeyboard ? rect.bottom : event.clientY,
    });
  };
  return (
    <div className="contents" onContextMenu={openAt}>
      {children}
      <span className="pointer-events-none fixed size-0" style={{ left: target?.x ?? 0, top: target?.y ?? 0 }}>
        <Dropdown
          className="block size-0"
          align="start"
          trigger={<button ref={triggerRef} type="button" tabIndex={-1} aria-hidden className="block size-0" />}
          content={
            target ? (
              <>
                {renderMenu?.(target.id)}
                {target.href ? (
                  <>
                    <li className="grid">
                      <button
                        type="button"
                        className={contextMenuItemClass}
                        onClick={() => window.open(target.href ?? "", "_blank", "noopener")}
                      >
                        <BiLinkExternal /> {l.trans({ en: "Open in new tab", ko: "새 탭에서 열기" })}
                      </button>
                    </li>
                    <li className="grid">
                      <Copy text={target.href}>
                        <button type="button" className={contextMenuItemClass}>
                          <BiCopy /> {l.trans({ en: "Copy link", ko: "링크 복사" })}
                        </button>
                      </Copy>
                    </li>
                  </>
                ) : null}
              </>
            ) : null
          }
        />
      </span>
    </div>
  );
};
