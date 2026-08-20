/**
 * Cherry, drawn.
 *
 * Ported from the sibling `virtual-lab-assistant` project, same author, so the
 * two apps' assistants are recognisably the same hand. Everything below is
 * that project's figure and rig; only this note and the accent colours differ.
 *
 * A hand-built SVG figure who stands at the corner of the experiment page and
 * talks to the student. 2D geometry, but lit like a 3D object: every volume
 * gets a light side and a shadow side from a single top-left key light, a warm
 * rim light on the right edge, and a soft contact shadow on the ground. That
 * combination is what makes flat vector shapes read as a person standing in
 * the room rather than a sticker.
 *
 * Why SVG and not a rendered 3D model or a PNG sprite sheet: this ships to ~200
 * lab sites and has to stay a few tens of kilobytes, stay crisp on every
 * display, and re-colour itself for light and dark pages. A character that
 * costs a megabyte would simply not be allowed onto a page it does not own.
 *
 * The figure is rigged: head, both arms and the torso are separate groups with
 * their own transform origins, so poses are set by rotating joints rather than
 * by swapping artwork.
 */

export type Pose = 'idle' | 'thinking' | 'talking' | 'pointing' | 'pleased' | 'concerned';
/** The two figures, same rig. Chosen in Settings; Cherry is the default. */
export type Avatar = 'cherry' | 'swathi';

const SKIN = { light: '#F3C9A6', mid: '#E0A87E', dark: '#C4885F' };
const HAIR_TONE = { light: '#3A2E2A', dark: '#241B18' };

/*
 * Hair is the only thing that differs between the two assistants -- the rig,
 * proportions, lighting and every pose are shared, so adding a third is one
 * pair of paths rather than a second character.
 *
 * Cherry wears her hair short, Swathi long. Nothing else about them differs,
 * which is deliberate: they are two people doing the same job, not a
 * "default" and a variant.
 *
 * Two layers, because a single path cannot do both jobs: `back` renders behind
 * the head so long hair falls behind the shoulders, and `front` renders on top
 * as the hairline. Drawing long hair only on top makes it cover the face.
 */
const HAIR: Record<Avatar, { back: string | null; front: string }> = {
  cherry: {
    back: null,
    front:
      'M76 44c0-16 11-26 24-26s24 10 24 26c0 4-1 8-2 11 0-8-3-12-8-13-6-1-9 2-14 2s-8-3-14-2c-5 1-8 5-8 13-1-3-2-7-2-11z',
  },
  swathi: {
    // Falls from the crown to just below the shoulder line, tucked behind
    // the coat collar.
    back:
      'M71 48c0-19 13-31 29-31s29 12 29 31c0 12-2 22-3 32-1 12-2 22-5 30-3-9-5-19-6-30-1-9-1-19-1-27h-28c0 8 0 18-1 27-1 11-3 21-6 30-3-8-4-18-5-30-1-10-3-20-3-32z',
    front:
      'M75 46c0-17 11-28 25-28s25 11 25 28c0 4-1 8-2 12-1-9-4-14-10-16-5-2-9 1-13 1s-8-3-13-1c-6 2-9 7-10 16-1-4-2-8-2-12z',
  },
};

/**
 * A stored preference can name a figure that no longer exists - avatars were
 * renamed once already, and the choice lives in localStorage, which outlives
 * any rename. Falling back beats throwing: an unknown name should give you the
 * default assistant, not a blank application.
 */
const figureFor = (avatar: Avatar) => HAIR[avatar] ?? HAIR.cherry;

export const CHARACTER_SVG = (avatar: Avatar): string => /* html */ `
<svg class="vl-figure" viewBox="0 0 200 330" width="128" height="211"
     xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <!-- Key light from the upper left; each gradient is the same light,
         wrapped around a different volume. -->
    <!-- A blazer, not a lab coat. This ships inside a work manager, and a
         figure in clinical white reads as the wrong building. Same key light
         from the upper left, same three stops, darker cloth. -->
    <linearGradient id="vl-coat" x1="0.15" y1="0" x2="0.95" y2="1">
      <stop offset="0%"   stop-color="#4A4358"/>
      <stop offset="52%"  stop-color="#3A3446"/>
      <stop offset="100%" stop-color="#272231"/>
    </linearGradient>
    <linearGradient id="vl-coat-shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#12101A" stop-opacity="0.40"/>
      <stop offset="45%"  stop-color="#12101A" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#12101A" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="vl-shirt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#F6F4FA"/>
      <stop offset="100%" stop-color="#DAD4E4"/>
    </linearGradient>
    <linearGradient id="vl-trousers" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0%"   stop-color="#4A5568"/>
      <stop offset="60%"  stop-color="#3A4457"/>
      <stop offset="100%" stop-color="#2A3140"/>
    </linearGradient>
    <radialGradient id="vl-face" cx="0.38" cy="0.3" r="0.85">
      <stop offset="0%"   stop-color="${SKIN.light}"/>
      <stop offset="62%"  stop-color="${SKIN.mid}"/>
      <stop offset="100%" stop-color="${SKIN.dark}"/>
    </radialGradient>
    <linearGradient id="vl-hair" x1="0.2" y1="0" x2="0.9" y2="1">
      <stop offset="0%"   stop-color="${HAIR_TONE.light}"/>
      <stop offset="100%" stop-color="${HAIR_TONE.dark}"/>
    </linearGradient>
    <radialGradient id="vl-ground" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%"   stop-color="#0F172A" stop-opacity="0.30"/>
      <stop offset="65%"  stop-color="#0F172A" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="0"/>
    </radialGradient>

    <!-- The contact shadow is blurred; everything else stays crisp so the
         figure keeps its vector edge at any zoom. -->
    <filter id="vl-soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3.2"/>
    </filter>
  </defs>

  <!-- Ground contact shadow. Anchors the figure to the page instead of
       leaving it floating. -->
  <ellipse class="vl-ground" cx="100" cy="314" rx="54" ry="10" fill="url(#vl-ground)"/>

  <g class="vl-body">
    <!-- ---------------------------------------------------------- legs -->
    <g class="vl-legs">
      <path d="M84 214h13l-2 74c0 4-3 6-6 6s-6-2-6-6z" fill="url(#vl-trousers)"/>
      <path d="M103 214h13l1 74c0 4-3 6-6 6s-6-2-6-6z" fill="url(#vl-trousers)"/>
      <!-- Shoes catch a little light on top and go dark underneath. -->
      <path d="M83 294h14c1 5 4 7 4 10 0 2-2 3-5 3H83c-2 0-3-1-3-3z" fill="#1F2937"/>
      <path d="M103 294h14c0 2 3 5 3 10 0 2-1 3-3 3h-14c-3 0-5-1-5-3 0-3 3-5 5-10z" fill="#1F2937"/>
      <path d="M83 294h14v3H83zM103 294h14v3h-14z" fill="#374151"/>
    </g>

    <!-- --------------------------------------------------------- torso -->
    <g class="vl-torso">
      <!-- Shirt behind the open coat -->
      <path d="M84 96h32v104H84z" fill="url(#vl-shirt)"/>
      <path d="M100 96l-9 16 9 10 9-10z" fill="#1E4470" opacity="0.5"/>

      <!-- Lab coat -->
      <path class="vl-coat"
            d="M78 100c-8 3-14 10-15 19l-6 62c-1 6 2 10 7 11l6 1 4 25c0 3 2 5 5 5h18V104c-6-3-12-4-19-4z"
            fill="url(#vl-coat)"/>
      <path class="vl-coat"
            d="M122 100c8 3 14 10 15 19l6 62c1 6-2 10-7 11l-6 1-4 25c0 3-2 5-5 5h-18V104c6-3 12-4 19-4z"
            fill="url(#vl-coat)"/>
      <!-- Shadow wrapping the left side of the coat -->
      <path d="M78 100c-8 3-14 10-15 19l-6 62c-1 6 2 10 7 11l6 1 4 25c0 3 2 5 5 5h9V100z"
            fill="url(#vl-coat-shade)"/>
      <!-- Lapels -->
      <path d="M97 102l-13 8 6 96h7z" fill="#E2E8F0"/>
      <path d="M103 102l13 8-6 96h-7z" fill="#F1F5F9"/>
      <!-- Pocket and a pen, because a lab coat without one looks unworn -->
      <rect x="118" y="168" width="18" height="22" rx="3" fill="#E2E8F0"/>
      <rect x="124" y="163" width="3" height="14" rx="1.5" fill="#EF4444"/>
      <!-- ID badge -->
      <rect x="66" y="150" width="16" height="21" rx="3" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1.2"/>
      <rect x="69" y="155" width="10" height="3" rx="1.5" fill="#3B82F6"/>
      <rect x="69" y="161" width="10" height="2" rx="1" fill="#CBD5E1"/>
      <rect x="69" y="165" width="7"  height="2" rx="1" fill="#CBD5E1"/>
    </g>

    <!-- ---------------------------------------------------------- arms -->
    <!-- Each arm rotates about its own shoulder, so poses are joint
         rotations rather than alternative artwork. -->
    <g class="vl-arm vl-arm-left">
      <path d="M78 108c-7 2-11 8-12 15l-7 48c-1 5 2 9 7 10s10-2 11-7l8-44z"
            fill="url(#vl-coat)"/>
      <path d="M78 108c-7 2-11 8-12 15l-7 48 7 1 9-49z" fill="#CBD5E1" opacity="0.55"/>
      <circle class="vl-hand" cx="65" cy="180" r="9.5" fill="url(#vl-face)"/>
      <path d="M56 170h18v6H56z" fill="#E2E8F0" opacity="0.9"/>
    </g>

    <g class="vl-arm vl-arm-right">
      <path d="M122 108c7 2 11 8 12 15l7 48c1 5-2 9-7 10s-10-2-11-7l-8-44z"
            fill="url(#vl-coat)"/>
      <circle class="vl-hand" cx="135" cy="180" r="9.5" fill="url(#vl-face)"/>
      <path d="M126 170h18v6h-18z" fill="#F1F5F9" opacity="0.9"/>
      <!-- A clipboard, shown only in the explaining pose -->
      <g class="vl-clipboard" opacity="0">
        <rect x="128" y="158" width="30" height="38" rx="3" fill="#8B5E3C"/>
        <rect x="131" y="163" width="24" height="30" rx="2" fill="#FDFDFD"/>
        <rect x="136" y="156" width="14" height="6" rx="2" fill="#9CA3AF"/>
        <rect x="134" y="169" width="18" height="2" rx="1" fill="#CBD5E1"/>
        <rect x="134" y="175" width="18" height="2" rx="1" fill="#CBD5E1"/>
        <rect x="134" y="181" width="12" height="2" rx="1" fill="#CBD5E1"/>
      </g>
    </g>

    <!-- ---------------------------------------------------------- head -->
    <g class="vl-head">
      ${figureFor(avatar).back ? `<path d="${figureFor(avatar).back}" fill="url(#vl-hair)"/>` : ''}
      <!-- Neck, with the shadow the jaw casts onto it -->
      <path d="M92 78h16v22H92z" fill="${SKIN.mid}"/>
      <path d="M92 78h16v9c-5 3-11 3-16 0z" fill="${SKIN.dark}" opacity="0.55"/>

      <!-- Ears -->
      <ellipse cx="72" cy="52" rx="5" ry="7" fill="${SKIN.mid}"/>
      <ellipse cx="128" cy="52" rx="5" ry="7" fill="${SKIN.mid}"/>

      <!-- Face -->
      <path d="M76 40c0-13 10-23 24-23s24 10 24 23v14c0 15-11 27-24 27S76 69 76 54z"
            fill="url(#vl-face)"/>
      <!-- Rim light down the right cheek: the single strongest 3D cue. -->
      <path d="M118 30c4 4 6 10 6 16v8c0 12-7 22-17 26 8-6 13-16 13-27z"
            fill="#FFE3C4" opacity="0.5"/>

      <!-- Brows -->
      <g class="vl-brows">
        <rect class="vl-brow-l" x="83"  y="43" width="14" height="3" rx="1.5" fill="${HAIR_TONE.dark}"/>
        <rect class="vl-brow-r" x="103" y="43" width="14" height="3" rx="1.5" fill="${HAIR_TONE.dark}"/>
      </g>

      <!-- Eyes. The lid is a rect that drops to blink. -->
      <g class="vl-eyes">
        <ellipse cx="90"  cy="53" rx="5.4" ry="5.8" fill="#FFFFFF"/>
        <ellipse cx="110" cy="53" rx="5.4" ry="5.8" fill="#FFFFFF"/>
        <circle class="vl-pupil" cx="90"  cy="54" r="3.1" fill="#2A1F1A"/>
        <circle class="vl-pupil" cx="110" cy="54" r="3.1" fill="#2A1F1A"/>
        <circle cx="91.4" cy="52.4" r="1.1" fill="#FFFFFF" opacity="0.9"/>
        <circle cx="111.4" cy="52.4" r="1.1" fill="#FFFFFF" opacity="0.9"/>
        <rect class="vl-lid" x="84"  y="46" width="12" height="0" fill="${SKIN.mid}"/>
        <rect class="vl-lid" x="104" y="46" width="12" height="0" fill="${SKIN.mid}"/>
      </g>

      <!-- Nose -->
      <path d="M100 56c-2 5-4 7-2 8 1 1 3 1 4 0" fill="none"
            stroke="${SKIN.dark}" stroke-width="1.6" stroke-linecap="round"/>

      <!-- Mouth. One path, reshaped per expression. -->
      <path class="vl-mouth" d="M93 69q7 5 14 0" fill="none"
            stroke="#8B4A38" stroke-width="2.2" stroke-linecap="round"/>

      <!-- Hairline, over the face -->
      <path d="${figureFor(avatar).front}" fill="url(#vl-hair)"/>

      <!-- The lab original wore safety goggles pushed up on the forehead,
           which read instantly as "lab" - exactly the wrong building for a
           work manager, and the one detail that survived re-clothing her and
           still gave the game away. Removed rather than restyled: the
           silhouette does not need a prop. -->
    </g>
  </g>
</svg>`;

/**
 * Per-pose joint rotations and expression.
 *
 * Kept as data rather than as separate drawings: the same rig covers every
 * state, so adding a pose is a row here, not a new illustration.
 */
export const POSES: Record<
  Pose,
  {
    armL: number;
    armR: number;
    headTilt: number;
    headNod: number;
    mouth: string;
    browY: number;
    clipboard: number;
  }
> = {
  // The arm is one rigid segment, so it cannot fold to the chin -- any angle
  // large enough to raise the hand also swings it out past the body. These
  // angles stay inside what the rig can express convincingly; the head tilt,
  // brows and mouth carry most of the expression, and the bubble shape
  // (spoken vs thought) carries the rest.
  idle:      { armL: 0,   armR: 0,   headTilt: 0,  headNod: 0,  mouth: 'M93 69q7 4 14 0',   browY: 0,    clipboard: 0 },
  // Weight shifted, head tipped, brows up: considering.
  thinking:  { armL: 4,   armR: -20, headTilt: -8, headNod: 2,  mouth: 'M94 70q6 2 12 -1',  browY: -2,   clipboard: 0 },
  // Mid-explanation: open gesture, clipboard out.
  talking:   { armL: -12, armR: -34, headTilt: 2,  headNod: 0,  mouth: 'M92 68q8 7 16 0',   browY: 0,    clipboard: 1 },
  // The one pose where a fully extended arm is right. It has to be the *left*
  // arm: the assistant stands at the bottom-right of the page, so the
  // experiment is on their left, and pointing with the near arm would send the
  // student's eye off the edge of the screen. The head turns to follow.
  pointing:  { armL: 98,  armR: -6,  headTilt: -7, headNod: 1,  mouth: 'M93 69q7 5 14 0',   browY: -1,   clipboard: 0 },
  pleased:   { armL: -10, armR: -18, headTilt: -3, headNod: -1, mouth: 'M90 67q10 9 20 0',  browY: -2.5, clipboard: 0 },
  // Brows down, mouth flat, shoulders drawn in.
  concerned: { armL: 8,   armR: -8,  headTilt: -4, headNod: 3,  mouth: 'M93 71h14',         browY: 2.5,  clipboard: 0 },
};
