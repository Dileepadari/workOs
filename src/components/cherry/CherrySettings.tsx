import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sparkles } from 'lucide-react';
import { CHARACTER_SVG, type Avatar } from './character';
import { speechSupported, useCherryPrefs } from '@/hooks/useCherryPrefs';
import { cn } from '@/lib/utils';

const FIGURES: { id: Avatar; name: string }[] = [
  { id: 'cherry', name: 'Cherry' },
  { id: 'swathi', name: 'Swathi' },
];

/** Who you talk to, and whether you can talk to them out loud. */
export function CherrySettings() {
  const { avatar, setAvatar, voiceEnabled, setVoiceEnabled } = useCherryPrefs();
  const canSpeak = speechSupported();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          Your assistant
        </CardTitle>
        <CardDescription>
          Personal to you - your teammates keep whichever they picked.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="mb-3 block">Who stands in the corner</Label>
          <div className="flex gap-3">
            {FIGURES.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setAvatar(f.id)}
                aria-pressed={avatar === f.id}
                className={cn(
                  'cherry-stage-preview flex w-32 flex-col items-center gap-2 rounded-xl border p-3 transition-colors',
                  avatar === f.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted',
                )}
              >
                <span
                  className="block h-24 overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: CHARACTER_SVG(f.id) }}
                />
                <span className="text-sm font-medium">{f.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="pr-4">
            <Label htmlFor="cherry-voice">Talk to her</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {canSpeak
                ? 'Adds a mic button. Your browser does the transcribing - in Chrome that means the audio goes to Google, so type instead if you would rather it did not.'
                : 'This browser has no speech recogniser, so the mic button stays hidden.'}
            </p>
          </div>
          <Switch
            id="cherry-voice"
            checked={voiceEnabled && canSpeak}
            disabled={!canSpeak}
            onCheckedChange={setVoiceEnabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
