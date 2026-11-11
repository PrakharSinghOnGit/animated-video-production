import { useEffect, useState } from "react";

/**
 * For a horizontal scroller: which edges still hide content. Returns a CSS mask that fades only those edges, so a strip
 * that runs off the side reads as "more this way" instead of as content cut off.
 */
/** `key`: anything that changes when the scroller mounts or its items change (the hook re-measures then). */
export function useEdgeFade(el: React.RefObject<HTMLElement | null>, key: unknown, px = 36): React.CSSProperties {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const n = el.current;
    if (!n) return;
    const on = () => {
      const left = n.scrollLeft > 2, right = n.scrollLeft + n.clientWidth < n.scrollWidth - 2;
      setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
    };
    on();
    n.addEventListener("scroll", on, { passive: true });
    const ro = new ResizeObserver(on);
    ro.observe(n);
    return () => { n.removeEventListener("scroll", on); ro.disconnect(); };
  }, [el, key]);
  if (!edges.left && !edges.right) return {};
  const mask = `linear-gradient(to right, ${edges.left ? `transparent, black ${px}px` : "black"}, ${edges.right ? `black calc(100% - ${px}px), transparent` : "black"})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}
