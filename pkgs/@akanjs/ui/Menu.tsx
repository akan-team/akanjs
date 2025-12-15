"use client";
import { clsx } from "@akanjs/client";
import { st } from "@akanjs/store";
import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AiFillCaretDown, AiOutlineEllipsis } from "react-icons/ai";

interface MenuItem {
  label: ReactNode;
  key: string;
  children?: MenuItem[];
  icon?: ReactNode;
  type?: string;
}

interface MenuProps {
  className?: string;
  ulClassName?: string;
  liClassName?: string;
  labelClassName?: (isActive: boolean) => string;
  style?: React.CSSProperties;
  selectedKeys?: string[];
  defaultSelectedKeys?: string[];
  mode?: "horizontal" | "inline";
  items: MenuItem[];
  onClick?: (item: MenuItem) => void;
  activeStyle?: string;
  inlineCollapsed?: boolean;
  onMouseOver?: () => void;
  onMouseLeave?: () => void;
}

export const Menu = ({
  items,
  onClick,
  selectedKeys,
  labelClassName,
  defaultSelectedKeys,
  className = "",
  ulClassName = "",
  liClassName,
  style,
  mode = "inline",
  activeStyle = "bordered",
  inlineCollapsed,
  onMouseOver,
  onMouseLeave,
}: MenuProps) => {
  const [expandedKey, setExpandedKey] = useState<string>(); // 서브메뉴
  const [currentKey, setCurrentKey] = useState<string | null>(defaultSelectedKeys?.[0] ?? null); // 선택된 메뉴
  const modeClassName = mode === "horizontal" ? "menu-horizontal flex-row " : "bg-base-200";
  const menuRef = useRef<HTMLDivElement | null>(null);
  const LiRefs = useRef<HTMLLIElement[]>([]);
  const overflowLiRef = useRef<HTMLLIElement | null>(null);
  const itemWidthsRef = useRef<number[]>([]);
  const innerWidth = st.use.innerWidth();

  const subMenuClassName =
    mode === "horizontal"
      ? `fixed menu-title bottom-0 translate-y-[98%] border-0 rounded-xs shadow-lg bg-base-100 hover:bg-base-100 flex flex-col`
      : "flex flex-col gap-0 p-0 bg-primary/10 hover:bg-primary/10 overflow-hidden";

  const subMenuItemClassName =
    mode === "inline"
      ? "w-full h-full bg-red-500 btn btn-ghost px-2 m-0 hover:bg-primary/20 btn btn-ghost text-primary-focus font-normal"
      : "w-full text-center duration-300 whitespace-nowrap btn btn-ghost text-primary-focus font-normal";

  // const activeClassName = activeStyle === "active" ? "[&>div]:bg-primary/20 [&>div]:text-primary-focus" : "bordered";
  const activeClassName =
    activeStyle === "active"
      ? "bg-primary text-primary-focus"
      : activeStyle === "bordered"
        ? " border-b-2 border-white"
        : activeStyle;

  const [overflowMenuItems, setOverflowMenuItems] = useState<MenuItem[]>([]);

  // 초기화. 각각 아이템의 너비를 구함
  useLayoutEffect(() => {
    if (mode !== "horizontal") return;
    const menu = menuRef.current;
    if (!menu) return;
    const liList = LiRefs.current;
    const widths: number[] = [];
    liList.forEach((li) => {
      widths.push(li.getBoundingClientRect().width);
    });
    itemWidthsRef.current = widths;
    checkOverflow();
  }, []);

  // 브라우저 너비가 줄어들면, overflowMenuItems에 추가
  useEffect(() => {
    checkOverflow();
  }, [innerWidth]);

  const checkOverflow = useCallback(() => {
    if (mode !== "horizontal" || !itemWidthsRef.current.length) return;
    const menu = menuRef.current;
    if (!menu) return;
    // const overflowLiWidth = overflowLiRef?.current?.getBoundingClientRect().width || 0;
    const totalWidth = menu.getBoundingClientRect().width;
    const widths = itemWidthsRef.current;
    const overflowItems: MenuItem[] = [];
    let accumulatedWidth = 0;
    for (let i = 0; i < widths.length; i++) {
      accumulatedWidth += widths[i];
      if (accumulatedWidth > totalWidth) {
        if (overflowItems.length === 0 && i - 1 >= 0) overflowItems.push(items[i - 1]);
        overflowItems.push(items[i]);
      }
    }
    setOverflowMenuItems(overflowItems);
  }, [items, mode]);

  const handleOnClick = (item: MenuItem) => {
    setCurrentKey(item.key);
    if (mode === "inline" && item.children) setExpandedKey(item.key === expandedKey ? undefined : item.key);
    else onClick?.(item);
  };

  const checkIsActive = (key: string) => {
    if (selectedKeys) return selectedKeys.includes(key);
    return key === currentKey;
  };
  return (
    <div
      ref={menuRef}
      id="menu"
      className={clsx(mode === "horizontal" ? "w-full shrink overflow-hidden" : "w-fit", className)}
    >
      <ul
        className={clsx("menu size-full flex-nowrap overflow-y-auto p-0", modeClassName, ulClassName)}
        style={{ ...style }}
        onMouseOver={onMouseOver}
        onMouseLeave={onMouseLeave}
      >
        {items
          .filter((item) => !overflowMenuItems.some((overflowItem) => overflowItem.key === item.key))
          .map((item, idx) => {
            const isOverflowItem = overflowMenuItems.some((overflowItem) => overflowItem.key === item.key);
            const overflowClassName = isOverflowItem ? "opacity-50" : "";
            return (
              <li
                ref={(el) => {
                  if (el) LiRefs.current[idx] = el;
                }}
                id={item.key}
                key={item.key}
                className={clsx("relative m-0 duration-200 hover:opacity-70", overflowClassName, liClassName, {
                  "bg-base-300": activeStyle === "active" && checkIsActive(item.key),
                  "border-base-100 border-b-2": activeStyle === "bordered" && checkIsActive(item.key),
                })}
                onClick={() => {
                  if (!isOverflowItem) handleOnClick(item);
                }}
                onMouseEnter={() => {
                  if (mode === "horizontal" && !isOverflowItem && item.children && expandedKey !== item.key)
                    setExpandedKey(item.key);
                }}
                onMouseLeave={() => {
                  if (mode === "horizontal" && !isOverflowItem) setExpandedKey(undefined);
                }}
              >
                <div className="flex h-full justify-between rounded-none">
                  <div className={clsx("flex items-center gap-1", labelClassName?.(checkIsActive(item.key)))}>
                    {item.icon}

                    {!inlineCollapsed && <div className="text-base-content whitespace-nowrap">{item.label}</div>}
                    {/* <div
                      className={clsx(
                        "whitespace-nowrap  truncate ",
                        mode === "horizontal" && !isOverflowItem && item.children
                          ? "flex justify-start animate-menuOpen"
                          : "flex justify-start animate-menuClose"
                      )}
                    >
                      {item.label}
                    </div> */}
                  </div>
                  {item.children && mode === "inline" && (
                    <AiFillCaretDown
                      className={clsx(
                        "text-xs transition-transform duration-400",
                        expandedKey === item.key ? "rotate-180" : ""
                      )}
                    />
                  )}
                </div>
                {/* 서브메뉴 */}
                {item.children && expandedKey === item.key && (
                  <div className={subMenuClassName}>
                    {item.children.map((child) => (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onClick?.(child);
                          setExpandedKey(undefined);
                        }}
                        key={child.key}
                        className={subMenuItemClassName}
                      >
                        {child.label}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        {overflowMenuItems.length > 0 && mode === "horizontal" && (
          <OverflowMenu overflowItems={overflowMenuItems} onClick={onClick} />
        )}
      </ul>
    </div>
  );
};

interface OverflowMenuProps {
  overflowItems: MenuItem[];
  onClick?: (item: MenuItem) => void;
}

const OverflowMenu = ({ overflowItems, onClick }: OverflowMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string>(); // 서브메뉴
  const handleMouseEnter = () => {
    setIsOpen(true);
  };
  const handleMouseLeave = () => {
    setIsOpen(false);
  };
  return (
    <li className="relative h-full" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div className="flex h-full items-center justify-center rounded-none">
        <AiOutlineEllipsis />
      </div>
      {isOpen && (
        <div className="bg-base-100 hover:bg-base-100 fixed -bottom-0 flex translate-y-[98%] flex-col rounded-xs border-0 p-2 shadow-lg">
          {overflowItems.map((item) => (
            <div
              key={item.key}
              onClick={() => onClick?.(item)}
              className="btn btn-ghost text-primary-focus relative font-normal whitespace-nowrap"
              onMouseEnter={() => {
                if (item.children && expandedKey !== item.key) setExpandedKey(item.key);
              }}
              onMouseLeave={() => {
                setExpandedKey(undefined);
              }}
            >
              {item.label}
              {item.children && expandedKey === item.key && (
                <div className="bg-base-100 absolute top-0 left-0 -translate-x-full p-4 drop-shadow-sm">
                  {item.children.map((child) => (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onClick?.(child);
                        setExpandedKey(undefined);
                      }}
                      key={child.key}
                      className="btn btn-ghost text-primary-focus flex items-center justify-center text-center font-normal"
                      // className="block font-normal text-center btn-sm text-primary-focus h-fit btn btn-ghost "
                    >
                      {child.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
};
