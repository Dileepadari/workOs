import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { preferences, type Preferences } from '@/lib/api';
import type { Avatar } from '@/components/cherry/character';

/**
 * Personal preferences, stored per user in the database.
 *
 * These used to live in localStorage, which meant they followed the machine
 * rather than the person: signing in on a laptop reset who your assistant was
 * and what theme you had. The API keys are the sharper version of the same
 * problem - a credential in localStorage is readable by anything that ever
 * runs on the page, so they now go to the server, get encrypted at rest, and
 * are never sent back.
 */
export function usePreferences() {
  return useQuery<Preferences, Error>({
    queryKey: ['preferences'],
    queryFn: async () => (await preferences.get()).preferences,
    staleTime: 60_000,
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Preferences> & { anthropic_key?: string; gemini_key?: string }) =>
      preferences.update(patch),
    onSuccess: (res) => qc.setQueryData(['preferences'], res.preferences),
  });
}

/** Convenience for the two Cherry-specific bits, with sane defaults while the
 *  first fetch is in flight. */
export function useCherryPrefs() {
  const { data } = usePreferences();
  const update = useUpdatePreferences();

  const stored = data?.cherry_avatar;
  const avatar: Avatar = stored === 'cherry' || stored === 'swathi' ? stored : 'cherry';

  return {
    avatar,
    setAvatar: (a: Avatar) => update.mutate({ cherry_avatar: a }),
    voiceEnabled: data?.cherry_voice ?? true,
    setVoiceEnabled: (v: boolean) => update.mutate({ cherry_voice: v }),
    saving: update.isPending,
  };
}

/** Whether this browser can transcribe at all. Chrome and Edge can; Firefox
 *  cannot, and the mic button hides itself there rather than sitting dead. */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' &&
    Boolean((window as unknown as Record<string, unknown>).SpeechRecognition ||
            (window as unknown as Record<string, unknown>).webkitSpeechRecognition);
}
