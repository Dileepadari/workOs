import { useEffect, useRef, useState } from 'react';
import { CHARACTER_SVG, POSES, type Avatar, type Pose } from './character';
import { cn } from '@/lib/utils';

/**
 * Cherry, standing in the corner.
 *
 * Same opening method as the sibling virtual-lab-assistant: a drawn person
 * rather than a chat bubble icon, who arrives, breathes, blinks, and gives one
 * small nudge when there is something to say. Clicking her opens the panel
 * beside her, with a tail so it reads as her speaking rather than as a dialog
 * that happened to appear.
 *
 * Note on the idle motion: the figure does not bob as a whole. A whole-body
 * bounce reads as a sticker being animated; a four-second chest rise reads as
 * a person standing still. That distinction is the entire difference between
 * this feeling alive and feeling like a mascot gif, and it is why the
 * breathing transform is on the torso group alone.
 */
export function CherryLauncher({
  open, onOpen, alerting, pose = 'idle', avatar = 'cherry',
}: {
  open: boolean;
  onOpen: () => void;
  /** One attention beat, when Cherry has something new. */
  alerting?: boolean;
  pose?: Pose;
  /** Which figure to draw. Chosen in Settings, stored per person. */
  avatar?: Avatar;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [nudging, setNudging] = useState(false);

  // Poses are joint rotations on the shared rig, applied as inline transforms
  // rather than by swapping artwork.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const p = POSES[pose];
    const set = (sel: string, transform: string) => {
      const el = root.querySelector<SVGElement>(sel);
      if (el) el.style.transform = transform;
    };
    set('.vl-arm-left', `rotate(${p.armL}deg)`);
    set('.vl-arm-right', `rotate(${p.armR}deg)`);
    set('.vl-head', `rotate(${p.headTilt}deg) translateY(${p.headNod}px)`);
    set('.vl-brows', `translateY(${p.browY}px)`);
    const mouth = root.querySelector<SVGPathElement>('.vl-mouth');
    if (mouth) mouth.setAttribute('d', p.mouth);
    const clip = root.querySelector<SVGElement>('.vl-clipboard');
    if (clip) clip.style.opacity = String(p.clipboard);
  }, [pose, avatar]);

  // The nudge is a single beat, not a loop. Something that moves forever in
  // the corner of the screen stops being a signal and becomes a distraction.
  useEffect(() => {
    if (!alerting) return;
    setNudging(true);
    const t = setTimeout(() => setNudging(false), 700);
    return () => clearTimeout(t);
  }, [alerting]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label="Ask Cherry"
      aria-expanded={open}
      className={cn(
        // Present on a phone too, just smaller. Hiding her below lg meant the
        // one thing this app is built around simply did not exist on mobile.
        'cherry-stage fixed bottom-3 right-3 z-30 cursor-pointer border-0 bg-transparent p-0 sm:bottom-4 sm:right-5',
        nudging && 'is-alerting',
        // She steps aside rather than sitting under her own panel.
        open && 'pointer-events-none opacity-0',
      )}
      dangerouslySetInnerHTML={{ __html: CHARACTER_SVG(avatar) }}
    />
  );
}
