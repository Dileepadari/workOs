import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sparkles } from 'lucide-react';
import { CHARACTER_SVG, type Avatar } from './character';
import { speechSupported, useCherryPrefs, usePreferences, useUpdatePreferences } from '@/hooks/useCherryPrefs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { cherry as cherryApi } from '@/lib/api';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const FIGURES: { id: Avatar; name: string }[] = [
  { id: 'cherry', name: 'Cherry' },
  { id: 'swathi', name: 'Swathi' },
];

/** Who you talk to, and whether you can talk to them out loud. */
export function CherrySettings() {
  const { avatar, setAvatar, voiceEnabled, setVoiceEnabled } = useCherryPrefs();
  const { data: prefs } = usePreferences();
  const update = useUpdatePreferences();
  const canSpeak = speechSupported();
  const [anthropic, setAnthropic] = useState('');
  const [gemini, setGemini] = useState('');
  const [testing, setTesting] = useState(false);

  const saveKey = async (which: 'anthropic' | 'gemini', value: string) => {
    await update.mutateAsync(which === 'anthropic' ? { anthropic_key: value } : { gemini_key: value });
    if (which === 'anthropic') setAnthropic(''); else setGemini('');
    toast.success(value ? 'Key saved and encrypted' : 'Key removed');
  };

  const test = async () => {
    setTesting(true);
    try {
      const res = await cherryApi.test();
      if (res.ok) toast.success(`Cherry is on ${res.provider}${res.model ? ` (${res.model})` : ''}`);
      else toast.error('That did not work', { description: res.error });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reach the provider.');
    } finally {
      setTesting(false);
    }
  };

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

        {/* Keys are write-only: they go up once, get encrypted at rest, and
            only ever come back as "set, ending 4f2a". */}
        <div className="space-y-3 border-t border-border pt-5">
          <div>
            <Label>Your own AI keys</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Stored encrypted against your account, never in this browser and never sent back to it.
              Yours are used before the server's. Leave both empty and Cherry falls back to her
              built-in parser, which still works.
            </p>
          </div>

          {([
            { id: 'anthropic', label: 'Anthropic', value: anthropic, set: setAnthropic, has: prefs?.has_anthropic_key, hint: prefs?.anthropic_key_hint, placeholder: 'sk-ant-...' },
            { id: 'gemini', label: 'Gemini', value: gemini, set: setGemini, has: prefs?.has_gemini_key, hint: prefs?.gemini_key_hint, placeholder: 'AIza...' },
          ] as const).map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-2">
              <span className="w-20 text-sm">{k.label}</span>
              <Input
                type="password"
                autoComplete="off"
                className="h-8 max-w-xs flex-1 text-xs"
                placeholder={k.has ? `Set, ending ${k.hint}` : k.placeholder}
                value={k.value}
                onChange={(e) => k.set(e.target.value)}
              />
              <Button
                size="sm" variant="outline" className="h-8"
                disabled={!k.value.trim() || update.isPending}
                onClick={() => saveKey(k.id, k.value.trim())}
              >
                Save
              </Button>
              {k.has && (
                <Button
                  size="sm" variant="ghost" className="h-8"
                  disabled={update.isPending}
                  onClick={() => saveKey(k.id, '')}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}

          <Button size="sm" variant="secondary" onClick={test} disabled={testing}>
            {testing ? 'Checking...' : 'Test connection'}
          </Button>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-5">
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
