import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  animate, motion, useMotionValue, useTransform, useReducedMotion,
  type MotionValue, type PanInfo,
} from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BookLeaf } from '@/components/book/BookPage';
import { BookPage } from '@/components/book/BookPage';

/**
 * The book reader.
 *
 * The product's claim is that a year of your work becomes a book, so the turn
 * has to behave like paper rather than like a slideshow. Three things make the
 * difference, and a crossfade has none of them:
 *
 *  1. The sheet pivots on the spine (`transform-origin: left`), not on its own
 *     centre. A page hinges where it is bound.
 *  2. The sheet has two printed faces. Turning forward you watch day N swing
 *     away and day N+1 arrive on its back, because that is one physical sheet
 *     of paper with a page on each side.
 *  3. It loses light as it lifts. A sheet standing at 90 degrees to the board
 *     catches almost none, and casts a shadow on whatever it passes over.
 *
 * On a wide screen the book is open as a spread - page 2s-1 on the left, 2s on
 * the right - so a turn advances two pages the way a real one does. Below that
 * there is no room for a spread, so it becomes a single leaf hinged at the
 * left and the swing is clipped by the covers.
 *
 * Pages are also draggable: grab one and it follows your hand, and finishes on
 * its own if you let go past halfway or flick it.
 *
 * Layering note: `overflow` on a `transform-style: preserve-3d` element forces
 * it flat, which would quietly turn all of this back into a 2D slide. The clip
 * therefore lives on an ancestor of the perspective, never on the sheet.
 */
export function BookReader({
  pages,
  index,
  onIndexChange,
}: {
  /** Oldest first - this is a book, and books start at the beginning. */
  pages: BookLeaf[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const spreadMode = useSpreadMode();
  const frameRef = useRef<HTMLDivElement>(null);

  // Angle of the sheet in the air: 0 lying on the right, -180 lying on the left.
  const angle = useMotionValue(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const dragging = useRef(false);
  // Bumped per turn so a superseded settle can identify itself and bow out.
  const turnSeq = useRef(0);

  // In spread mode two pages share a position, so we count spreads, not pages.
  const spread = spreadMode ? Math.max(0, Math.ceil(index / 2)) : index;
  const maxSpread = spreadMode ? Math.floor(pages.length / 2) : Math.max(0, pages.length - 1);
  const canForward = spread < maxSpread;
  const canBack = spread > 0;

  const at = (i: number) => (i >= 0 && i < pages.length ? pages[i] : null);

  // Derived rather than stored, so the resting state and the animating state
  // cannot drift apart.
  const layout = resolveLayout(spread, turn, spreadMode);
  const resting = resolveLayout(spread, null, spreadMode);

  const setTurnState = (t: Turn | null) => {
    turnRef.current = t;
    setTurn(t);
  };

  const land = useCallback(
    (dir: 1 | -1) => {
      const next = spread + dir;
      onIndexChange(spreadMode ? Math.max(0, next * 2) : next);
      setTurnState(null);
      angle.set(0);
    },
    [spread, spreadMode, onIndexChange, angle],
  );

  /**
   * Runs one turn and settles it exactly once.
   *
   * The settle is deliberately not left to the animation promise alone. A
   * browser pauses requestAnimationFrame in a background tab, which stalls the
   * animation and never resolves it - and since a turn in flight blocks the
   * next one, the reader would stay locked on whatever page it was on when you
   * switched away. The timer guarantees the book always ends up on a settled
   * page, so you come back to a page rather than to a raised sheet.
   */
  const runTurn = useCallback(
    (dir: 1 | -1, to: number, duration: number, complete: boolean) => {
      const seq = ++turnSeq.current;
      let settled = false;
      let timer = 0;
      const settle = () => {
        if (settled || turnSeq.current !== seq) return;
        settled = true;
        window.clearTimeout(timer);
        if (complete) land(dir);
        else setTurnState(null);
      };
      animate(angle, to, { duration, ease: TURN_EASE }).then(settle);
      timer = window.setTimeout(settle, duration * 1000 + 400);
    },
    [angle, land],
  );

  const go = useCallback(
    (dir: 1 | -1) => {
      if (turnRef.current || dragging.current) return;
      if (dir === 1 ? !canForward : !canBack) return;
      if (reduceMotion) {
        const next = spread + dir;
        onIndexChange(spreadMode ? Math.max(0, next * 2) : next);
        return;
      }
      setTurnState({ dir });
      angle.set(dir === 1 ? 0 : -180);
      // Paper has weight: it leaves slowly, falls quickly, and does not bounce
      // when it lands. That is an ease, not a spring.
      runTurn(dir, dir === 1 ? -180 : 0, 0.85, true);
    },
    [angle, canBack, canForward, onIndexChange, reduceMotion, runTurn, spread, spreadMode],
  );

  // Arrow keys read the book, in the direction the page physically travels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // ---- drag to turn ----------------------------------------------------
  // The sheet tracks the pointer one-to-one across its own width, so letting
  // go halfway leaves it standing upright exactly where you left it.
  const leafWidth = () => {
    const w = frameRef.current?.clientWidth ?? 900;
    return spreadMode ? w / 2 : w;
  };

  const onPan = (_: unknown, info: PanInfo) => {
    if (reduceMotion) return;
    let t = turnRef.current;
    if (!t) {
      if (Math.abs(info.offset.x) < 10) return;
      const dir: 1 | -1 = info.offset.x < 0 ? 1 : -1;
      if (dir === 1 ? !canForward : !canBack) return;
      t = { dir };
      setTurnState(t);
    }
    dragging.current = true;
    const progress = clamp(
      t.dir === 1 ? -info.offset.x / leafWidth() : 1 - info.offset.x / leafWidth(),
      0,
      1,
    );
    angle.set(-180 * progress);
  };

  const onPanEnd = (_: unknown, info: PanInfo) => {
    const t = turnRef.current;
    dragging.current = false;
    if (!t) return;
    // A flick finishes the turn even from a shallow angle - that is what a
    // page does once it has momentum.
    const flick = t.dir === 1 ? info.velocity.x < -320 : info.velocity.x > 320;
    const complete = flick || Math.abs(angle.get()) / 180 > 0.5;
    const target = t.dir === 1 ? (complete ? -180 : 0) : complete ? 0 : -180;
    runTurn(t.dir, target, 0.4, complete);
  };

  // ---- light -----------------------------------------------------------
  // How much of the page is turned away from the light, which for a flat sheet
  // lit from the front is 1 - |cos t|. Using the cosine rather than a plain
  // sine matters: it keeps the page almost fully lit through the early part of
  // the turn and collapses to dark only near edge-on, which is what a real
  // sheet does. A sine curve greys the page out the moment it starts moving
  // and reads as a fade rather than as light.
  const lambert = useTransform(angle, (a) => 1 - Math.abs(Math.cos((a * Math.PI) / 180)));
  // Never fully black - the room still has ambient light in it.
  const sheetShade = useTransform(lambert, (v) => v * 0.72);
  const castShadow = useTransform(lambert, (v) => v * 0.55);
  // The free edge catches a highlight as it sweeps past the light.
  const sheen = useTransform(lambert, (v) => Math.max(0, Math.sin(v * Math.PI)) * 0.18);
  // p: 0 flat on one side, 1 flat on the other, 0.5 standing upright.
  const p = useTransform(angle, (a) => Math.abs(a) / 180);
  const frontOpacity = useTransform(p, (v) => (v < 0.5 ? 1 : 0));
  const backOpacity = useTransform(p, (v) => (v >= 0.5 ? 1 : 0));

  const half = spreadMode ? 'w-1/2' : 'w-full';

  return (
    <div className="select-none">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(-1)} disabled={!canBack} className={navClass} aria-label="Turn back">
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Earlier</span>
        </button>
        <p className="text-center text-sm text-muted-foreground">
          {describePosition(resting, pages.length, spreadMode)}
        </p>
        <button type="button" onClick={() => go(1)} disabled={!canForward} className={navClass} aria-label="Turn forward">
          <span className="hidden sm:inline">Later</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* The clip lives here, outside the perspective, so the swing never
          pushes the page sideways on a phone. */}
      <div className="overflow-hidden px-1 py-2">
        <div
          className="book-board relative mx-auto w-full max-w-5xl rounded-2xl p-3 sm:p-6"
          style={{ perspective: 2600, perspectiveOrigin: '50% 42%' }}
        >
          {/* The closed part of the book on either side. It thickens on the
              left as you read forward, which is the only progress indicator a
              real book has. */}
          <Edges side="left" count={spread} total={maxSpread} />
          <Edges side="right" count={maxSpread - spread} total={maxSpread} />

          {/* The pan gesture lives on the frame rather than on an overlay
              above the pages. An overlay would sit between the pointer and the
              leaves and swallow their wheel events, so a page taller than the
              book would scroll the whole document instead of itself. Pointer
              events from the leaves bubble up to here, so the drag still works
              and the pages stay scrollable and selectable. */}
          <motion.div
            ref={frameRef}
            className="relative w-full rounded-lg shadow-[0_26px_64px_-26px_hsl(264_40%_10%/0.5)]"
            style={{ height: 'min(76vh, 780px)', touchAction: 'pan-y' }}
            onPan={onPan}
            onPanEnd={onPanEnd}
          >
            {/* Board: whatever the sheet in the air is uncovering. */}
            {spreadMode && (
              <Leaf
                side="verso"
                className="left-0 w-1/2 rounded-l-lg"
                page={at(layout.baseLeft)}
                pageNumber={layout.baseLeft + 1}
              />
            )}
            <Leaf
              side="recto"
              className={cn('right-0 rounded-r-lg', half, !spreadMode && 'rounded-l-lg')}
              page={at(layout.baseRight)}
              pageNumber={layout.baseRight + 1}
            />

            {/* The shadow the standing sheet throws across the board: on the
                left while it is coming down there, on the right while it is
                still lifting off. */}
            {turn && (
              <motion.div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-y-0 z-10',
                  spreadMode ? (turn.dir === 1 ? 'left-0 w-1/2' : 'right-0 w-1/2') : 'inset-x-0',
                )}
                style={{
                  opacity: castShadow,
                  background:
                    turn.dir === 1
                      ? 'linear-gradient(to left, hsl(264 40% 8% / 0.9), transparent 62%)'
                      : 'linear-gradient(to right, hsl(264 40% 8% / 0.9), transparent 62%)',
                }}
              />
            )}

            {/* The sheet in the air. One element, two printed faces, hinged on
                the spine. */}
            <motion.div
              className={cn('absolute inset-y-0 right-0 z-20', half, turn ? 'block' : 'hidden')}
              style={{
                rotateY: angle,
                transformStyle: 'preserve-3d',
                transformOrigin: 'left center',
              }}
              onPan={onPan}
              onPanEnd={onPanEnd}
            >
              <Face
                side="recto" className="rounded-r-lg"
                page={at(layout.sheetFront)} pageNumber={layout.sheetFront + 1}
                opacity={frontOpacity} shade={sheetShade} sheen={sheen}
              />
              <Face
                side="verso" className="rounded-l-lg" back
                page={at(layout.sheetBack)} pageNumber={layout.sheetBack + 1}
                opacity={backOpacity} shade={sheetShade} sheen={sheen}
              />
            </motion.div>

            {/* The spine, drawn over the sheet's landing edge - that overlap is
                what keeps the two halves reading as one bound object. */}
            {spreadMode && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-10 -translate-x-1/2"
                style={{
                  background:
                    'linear-gradient(to right, transparent, hsl(30 30% 18% / 0.14) 40%, hsl(30 30% 18% / 0.24) 50%, hsl(30 30% 18% / 0.14) 60%, transparent)',
                }}
              />
            )}
          </motion.div>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Drag a page to turn it, or use the arrow keys.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface Turn { dir: 1 | -1 }

interface Layout {
  baseLeft: number;
  baseRight: number;
  sheetFront: number;
  sheetBack: number;
  /** Page indices on screen once the turn settles. */
  visible: number[];
}

/**
 * Where every page sits, for a position and an optional turn in progress.
 *
 * Turning forward from spread s: the sheet carrying page 2s lifts off the
 * right, page 2s+1 is printed on its back and lands on the left, and 2s+2 was
 * underneath all along. Turning back is the same sheet going the other way,
 * which is why one description covers both.
 */
function resolveLayout(spread: number, turn: Turn | null, spreadMode: boolean): Layout {
  if (!spreadMode) {
    const i = spread;
    if (!turn) return { baseLeft: -1, baseRight: i, sheetFront: -1, sheetBack: -1, visible: [i] };
    return turn.dir === 1
      ? { baseLeft: -1, baseRight: i + 1, sheetFront: i, sheetBack: i + 1, visible: [i + 1] }
      : { baseLeft: -1, baseRight: i, sheetFront: i - 1, sheetBack: i, visible: [i - 1] };
  }

  const left = spread * 2 - 1;
  const right = spread * 2;
  if (!turn) {
    return { baseLeft: left, baseRight: right, sheetFront: -1, sheetBack: -1, visible: [left, right] };
  }
  if (turn.dir === 1) {
    return {
      baseLeft: left, baseRight: right + 2,
      sheetFront: right, sheetBack: right + 1,
      visible: [right + 1, right + 2],
    };
  }
  return {
    baseLeft: left - 2, baseRight: right,
    sheetFront: left - 1, sheetBack: left,
    visible: [left - 2, left - 1],
  };
}

/** A page lying flat on the board. */
function Leaf({
  side, className, page, pageNumber,
}: {
  side: 'recto' | 'verso';
  className?: string;
  page: BookLeaf | null;
  pageNumber: number;
}) {
  return (
    <div className={cn('book-leaf', side === 'recto' ? 'book-leaf-recto' : 'book-leaf-verso', className)}>
      <LeafContent page={page} pageNumber={pageNumber} />
    </div>
  );
}

/** One printed face of the sheet in the air. */
function Face({
  side, className, page, pageNumber, opacity, shade, sheen, back,
}: {
  side: 'recto' | 'verso';
  className?: string;
  page: BookLeaf | null;
  pageNumber: number;
  opacity: MotionValue<number>;
  shade: MotionValue<number>;
  sheen: MotionValue<number>;
  back?: boolean;
}) {
  return (
    <motion.div
      className={cn(
        'book-leaf inset-0',
        side === 'recto' ? 'book-leaf-recto' : 'book-leaf-verso',
        className,
      )}
      style={{
        opacity,
        // The far face is printed on the other side of the same sheet.
        transform: back ? 'rotateY(180deg)' : undefined,
        boxShadow: '0 18px 44px -18px hsl(264 40% 8% / 0.55)',
      }}
    >
      <LeafContent page={page} pageNumber={pageNumber} />
      {/* Light lost as the sheet stands up. */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-[3] bg-[hsl(264_40%_8%)]"
        style={{ opacity: shade }}
      />
      {/* The lit free edge, opposite the hinge. */}
      <motion.div
        className="pointer-events-none absolute inset-0 z-[4]"
        style={{
          opacity: sheen,
          background: 'linear-gradient(to left, hsl(40 60% 96% / 0.9), transparent 34%)',
        }}
      />
    </motion.div>
  );
}

function LeafContent({ page, pageNumber }: { page: BookLeaf | null; pageNumber: number }) {
  if (!page) {
    // Endpapers. A book has blank leaves at each end, and showing one is more
    // honest than pretending the book runs longer than it does.
    return (
      <div className="flex h-full flex-col items-center justify-center bg-paper p-8 text-center">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-paper-foreground/30">
          {pageNumber <= 0 ? 'WorkOS' : 'Unwritten'}
        </p>
      </div>
    );
  }
  return <ScrollableLeaf page={page} pageNumber={pageNumber} />;
}

/**
 * A page is a fixed box, but a day with a lot in it is taller than the box.
 * Cutting the day off would be worse than letting the page scroll, so it
 * scrolls, with a mask at the bottom edge so it does not read as a hard crop.
 *
 * The scroll position has to be reset when the page changes: these leaves are
 * recycled across turns, so without this you turn to a fresh day and land
 * half way down it, at whatever offset the previous day was left at.
 */
function ScrollableLeaf({ page, pageNumber }: { page: BookLeaf; pageNumber: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [page.id]);

  return (
    <div ref={ref} className="book-leaf-scroll h-full">
      <BookPage leaf={page} variant="book" />
      <p className="pb-5 text-center text-[0.65rem] tabular-nums text-paper-foreground/40">{pageNumber}</p>
    </div>
  );
}

/** The compressed stack of sheets on either side of the open spread. */
function Edges({ side, count, total }: { side: 'left' | 'right'; count: number; total: number }) {
  if (count <= 0 || total <= 0) return null;
  // Capped so a long book does not push the spread off centre.
  const width = Math.min(14, 2 + (count / Math.max(1, total)) * 12);
  const style: CSSProperties = { width };
  if (side === 'left') {
    style.left = 0;
    style.borderTopLeftRadius = 6;
    style.borderBottomLeftRadius = 6;
  } else {
    style.right = 0;
    style.borderTopRightRadius = 6;
    style.borderBottomRightRadius = 6;
  }
  return <div aria-hidden className="book-edges" style={style} />;
}

function describePosition(layout: Layout, total: number, spreadMode: boolean) {
  const shown = layout.visible.filter((i) => i >= 0 && i < total);
  if (!shown.length) return `${total} ${total === 1 ? 'page' : 'pages'}`;
  if (!spreadMode || shown.length === 1) return `Page ${shown[0] + 1} of ${total}`;
  return `Pages ${shown[0] + 1}-${shown[shown.length - 1] + 1} of ${total}`;
}

/** Slow to leave, quick to fall, no bounce on landing. */
const TURN_EASE: [number, number, number, number] = [0.32, 0.02, 0.2, 1];

const navClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm ' +
  'transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40';

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/** A spread needs roughly 1024px to leave each page a readable measure. */
function useSpreadMode() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}
