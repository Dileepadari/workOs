import { useColorTheme, colorPalettes, ColorPalette } from '@/contexts/ColorThemeContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

const paletteNames: Record<ColorPalette, string> = {
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
  const { colorPalette, setColorPalette } = useColorTheme();

  const palettes: ColorPalette[] = ['common', 'monokai', 'github', 'material', 'original', 'dracula', 'nord', 'solarized', 'catppuccin'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">Color Palette</CardTitle>
        <CardDescription>
          Choose your preferred primary color. Works perfectly in both light and dark modes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {palettes.map((palette) => {
            const colors = colorPalettes[palette];
            const primaryColor = colors.primary;
            
            return (
              <Button
                key={palette}
                onClick={() => setColorPalette(palette)}
                variant={colorPalette === palette ? 'default' : 'outline'}
                className={`relative h-20 flex-col items-center justify-center gap-2 transition-all ${
                  colorPalette === palette ? 'ring-2 ring-offset-2 ring-primary' : ''
                }`}
              >
                <div
                  className="h-6 w-6 rounded-full border border-current"
                  style={{
                    backgroundColor: `hsl(${primaryColor})`,
                  }}
                />
                <span className="text-xs font-medium text-center">{paletteNames[palette]}</span>
                {colorPalette === palette && (
                  <Check className="absolute top-1 right-1 h-4 w-4" />
                )}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
