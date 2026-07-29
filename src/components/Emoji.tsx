import twemoji from 'twemoji';

// Renders a unicode emoji as a real icon (Twemoji SVG), instead of relying
// on whatever emoji font (or lack thereof) happens to be installed on the
// viewer's OS - consistent look everywhere, not a raw pasted glyph.
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/';

interface Props {
  emoji: string;
  className?: string;
}

export function Emoji({ emoji, className }: Props) {
  const html = twemoji.parse(emoji, {
    folder: 'svg',
    ext: '.svg',
    base: TWEMOJI_BASE,
    className: `inline-block h-[1.1em] w-[1.1em] align-[-0.2em] ${className ?? ''}`,
  });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
