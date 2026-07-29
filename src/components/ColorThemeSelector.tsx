import { useState } from 'react';
import { useTheme, colorPalettes, hexToHSL, ColorPalette } from '@/contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Palette } from 'lucide-react';

const paletteNames: Record<Exclude<ColorPalette, 'custom'>, string> = {
  common: 'Common',
  monokai: 'Monokai',
  github: 'GitHub',
  material: 'Material Design',
  original: 'Original',
  dracula: 'Dracula',
  nord: 'Nord',
  solarized: 'Solarized',
  catppuccin: 'Catppuccin',
};

export function ColorThemeSelector() {
  const { colorPalette, setColorPalette, customPrimaryHex, customAccentHex, setCustomColors } = useTheme();
  const [primaryDraft, setPrimaryDraft] = useState(customPrimaryHex);
  const [accentDraft, setAccentDraft] = useState(customAccentHex);

  const palettes = Object.keys(paletteNames) as Exclude<ColorPalette, 'custom'>[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">Color Palette</CardTitle>
        <CardDescription>
          Applies to everyone in this workspace. Works perfectly in both light and dark modes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {palettes.map((palette) => {
            const colors = colorPalettes[palette];
            const primaryColor = colors.primary;

            return (
              <Button
                key={palette}
                onClick={() => setColorPalette(palette)}
                variant="outline"
                className={`relative h-20 flex-col items-center justify-center gap-2 transition-all ${
                  colorPalette === palette ? 'ring-2 ring-offset-2 ring-primary border-primary' : ''
                }`}
              >
                <div
                  className="h-6 w-6 rounded-full border border-border"
                  style={{
                    backgroundColor: `hsl(${primaryColor})`,
                  }}
                />
                <span className="text-xs font-medium text-center">{paletteNames[palette]}</span>
                {colorPalette === palette && (
                  <Check className="absolute top-1 right-1 h-4 w-4 text-primary" />
                )}
              </Button>
            );
          })}
          <Button
            onClick={() => setCustomColors(primaryDraft, accentDraft)}
            variant="outline"
            className={`relative h-20 flex-col items-center justify-center gap-2 transition-all ${
              colorPalette === 'custom' ? 'ring-2 ring-offset-2 ring-primary border-primary' : ''
            }`}
          >
            <div className="h-6 w-6 rounded-full border border-border" style={{ backgroundColor: `hsl(${hexToHSL(primaryDraft)})` }} />
            <span className="text-xs font-medium text-center">Custom</span>
            {colorPalette === 'custom' && <Check className="absolute top-1 right-1 h-4 w-4 text-primary" />}
          </Button>
        </div>

        <div className="rounded-md border border-border p-3 space-y-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Palette className="h-3.5 w-3.5" />Custom brand color</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Primary</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryDraft} onChange={(e) => setPrimaryDraft(e.target.value)} className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent" />
                <Input value={primaryDraft} onChange={(e) => setPrimaryDraft(e.target.value)} className="h-8 text-xs font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Accent</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={accentDraft} onChange={(e) => setAccentDraft(e.target.value)} className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent" />
                <Input value={accentDraft} onChange={(e) => setAccentDraft(e.target.value)} className="h-8 text-xs font-mono" />
              </div>
            </div>
          </div>
          <Button size="sm" onClick={() => setCustomColors(primaryDraft, accentDraft)}>Apply custom colors</Button>
        </div>
      </CardContent>
    </Card>
  );
}
