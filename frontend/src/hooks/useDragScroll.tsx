import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Makes an element scrollable by dragging with a MOUSE, in both directions.
 * Touch screens already scroll natively (see .drag-scroll in index.css), so only
 * mouse pointers are handled here, which keeps touch behaviour untouched.
 *
 * - Horizontal drag scrolls the element itself.
 * - Vertical drag scrolls the nearest `[data-vscroll]` ancestor of the pointer
 *   (a column inside a board), or the element itself when there is none.
 * - A drag never turns into a click on the card/button it started on.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let down = false;
    let moved = false;
    let sx = 0, sy = 0, startLeft = 0, startTop = 0;
    let vEl: HTMLElement | null = null;

    const swallowClick = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea')) return;
      down = true; moved = false;
      sx = e.clientX; sy = e.clientY;
      startLeft = el.scrollLeft;
      vEl = (target.closest('[data-vscroll]') as HTMLElement | null) ?? el;
      startTop = vEl.scrollTop;
    };

    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved) {
        if (Math.hypot(dx, dy) < 6) return;     // small jitter is still a click
        moved = true;
        el.classList.add('dragging');
      }
      el.scrollLeft = startLeft - dx;            // also correct in RTL
      if (vEl) vEl.scrollTop = startTop - dy;
    };

    const onUp = () => {
      if (!down) return;
      down = false;
      if (moved) {
        el.classList.remove('dragging');
        el.addEventListener('click', swallowClick, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', swallowClick, { capture: true }), 50);
      }
    };

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return ref;
}

/** A scroll container that works with touch, wheel and mouse-drag, both ways. */
export function DragScroll({ className = '', children, ...rest }:
  { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const ref = useDragScroll<HTMLDivElement>();
  return <div ref={ref} className={`drag-scroll ${className}`} {...rest}>{children}</div>;
}
