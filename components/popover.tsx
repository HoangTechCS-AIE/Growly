"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** A popover anchored to an element but rendered into `<body>`.
 *
 *  Menus used to sit inside the element they belonged to, which meant any
 *  scrolling ancestor — the page tree, a table's horizontal scroller — clipped
 *  them and grew a scrollbar instead of letting them overflow. Portalling side-
 *  steps that entirely; the trade is that the position has to be measured and
 *  kept in step with scrolling by hand.
 */
export function Popover({
  anchor,
  align = "start",
  width,
  className,
  children,
  ...rest
}: {
  anchor: HTMLElement | null;
  /** Which edge of the anchor the popover lines up with. */
  align?: "start" | "end";
  width?: number;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!mounted || !anchor) return;

    const place = () => {
      const element = ref.current;
      if (!element) return;
      const rect = anchor.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const margin = 8;

      let left = align === "end" ? rect.right - box.width : rect.left;
      left = Math.max(margin, Math.min(left, window.innerWidth - box.width - margin));

      // Below the anchor by default; above it when that would run off-screen.
      let top = rect.bottom + 4;
      if (top + box.height > window.innerHeight - margin) {
        const above = rect.top - box.height - 4;
        top = above >= margin ? above : Math.max(margin, window.innerHeight - box.height - margin);
      }
      setPosition({ top, left });
    };

    place();
    // `true` catches scrolling in any ancestor, not just the window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [mounted, anchor, align]);

  if (!mounted || !anchor) return null;

  return createPortal(
    <div
      ref={ref}
      className={className}
      style={{
        position: "fixed",
        // Parked off-screen until measured. `visibility: hidden` would be the
        // obvious choice, but a hidden element cannot take focus, and popovers
        // here autofocus their search box on mount.
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        width,
      }}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}
