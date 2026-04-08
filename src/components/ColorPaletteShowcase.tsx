import { useColorTheme, colorPalettes, ColorPalette } from '@/contexts/ColorThemeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

interface ColorSwatchProps {
  label: string;
  colorValue: string;
}

function ColorSwatch({ label, colorValue }: ColorSwatchProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-24 h-24 rounded-lg border-2 border-border shadow-md transition-transform hover:scale-105"
        style={{ backgroundColor: `hsl(${colorValue})` }}
        title={colorValue}
      />
      <span className="text-xs font-medium text-center text-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground font-mono">{colorValue}</span>
    </div>
  );
}

export function ColorPaletteShowcase() {
  const { colorPalette } = useColorTheme();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const palette = colorPalettes[colorPalette];

  if (!palette) return null;

  const swatches = [
    { label: 'Primary', key: isDark ? 'darkPrimary' : 'primary' },
    { label: 'Primary Light', key: isDark ? 'darkPrimaryLight' : 'primaryLight' },
    { label: 'Accent', key: isDark ? 'darkAccent' : 'accent' },
    { label: 'Accent Light', key: isDark ? 'darkAccentLight' : 'accentLight' },
    { label: 'Background', key: isDark ? 'darkBackground' : 'background' },
    { label: 'Surface', key: isDark ? 'darkSurface' : 'surface' },
    { label: 'Border', key: isDark ? 'darkBorder' : 'border' },
    { label: 'Text', key: isDark ? 'darkText' : 'text' },
    { label: 'Text Muted', key: isDark ? 'darkTextMuted' : 'textMuted' },
    { label: 'Destructive', key: 'destructive' },
    { label: 'Destructive Light', key: 'destructiveLight' },
    { label: 'Success', key: 'success' },
    { label: 'Success Light', key: 'successLight' },
    { label: 'Warning', key: 'warning' },
    { label: 'Warning Light', key: 'warningLight' },
    { label: 'Info', key: 'info' },
    { label: 'Info Light', key: 'infoLight' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {paletteNames[colorPalette]} Color Palette ({isDark ? 'Dark' : 'Light'} Mode)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {swatches.map((swatch) => (
            <ColorSwatch
              key={swatch.key}
              label={swatch.label}
              colorValue={palette[swatch.key] || '#000000'}
            />
          ))}
        </div>

        {/* Contrast Examples */}
        <div className="mt-8 grid gap-4">
          <h3 className="text-lg font-semibold text-foreground">Contrast & Usage Examples</h3>

          {/* Primary combinations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className="p-4"
              style={{ backgroundColor: `hsl(${palette[isDark ? 'darkPrimary' : 'primary']})` }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: `hsl(0 0% 100%)` }}
              >
                Primary on White Text
              </p>
            </Card>
            <Card
              className="p-4"
              style={{
                backgroundColor: `hsl(${palette[isDark ? 'darkPrimaryLight' : 'primaryLight']})`,
              }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: `hsl(${palette[isDark ? 'darkPrimary' : 'primary']})` }}
              >
                Primary Light with Primary Text
              </p>
            </Card>
          </div>

          {/* Accent combinations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className="p-4"
              style={{ backgroundColor: `hsl(${palette[isDark ? 'darkAccent' : 'accent']})` }}
            >
              <p className="text-sm font-medium" style={{ color: `hsl(0 0% 100%)` }}>
                Accent on White Text
              </p>
            </Card>
            <Card
              className="p-4"
              style={{
                backgroundColor: `hsl(${palette[isDark ? 'darkAccentLight' : 'accentLight']})`,
              }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: `hsl(${palette[isDark ? 'darkAccent' : 'accent']})` }}
              >
                Accent Light with Accent Text
              </p>
            </Card>
          </div>

          {/* Semantic colors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className="p-4"
              style={{ backgroundColor: `hsl(${palette.destructive})` }}
            >
              <p className="text-sm font-medium text-white">Destructive Alert</p>
            </Card>
            <Card
              className="p-4"
              style={{ backgroundColor: `hsl(${palette.success})` }}
            >
              <p className="text-sm font-medium text-white">Success State</p>
            </Card>
            <Card
              className="p-4"
              style={{ backgroundColor: `hsl(${palette.warning})` }}
            >
              <p className="text-sm font-medium text-white">Warning State</p>
            </Card>
            <Card
              className="p-4"
              style={{ backgroundColor: `hsl(${palette.info})` }}
            >
              <p className="text-sm font-medium text-white">Info State</p>
            </Card>
          </div>

          {/* Light variants */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className="p-4"
              style={{ backgroundColor: `hsl(${palette.destructiveLight})` }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: `hsl(${palette.destructive})` }}
              >
                Destructive Light Background
              </p>
            </Card>
            <Card
              className="p-4"
              style={{ backgroundColor: `hsl(${palette.successLight})` }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: `hsl(${palette.success})` }}
              >
                Success Light Background
              </p>
            </Card>
            <Card
              className="p-4"
              style={{ backgroundColor: `hsl(${palette.warningLight})` }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: `hsl(${palette.warning})` }}
              >
                Warning Light Background
              </p>
            </Card>
            <Card
              className="p-4"
              style={{ backgroundColor: `hsl(${palette.infoLight})` }}
            >
              <p className="text-sm font-medium" style={{ color: `hsl(${palette.info})` }}>
                Info Light Background
              </p>
            </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
