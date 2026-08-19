import { useCallback, useEffect, useState } from 'react';
import type { Avatar } from '@/components/cherry/character';

/**
 * Which figure Cherry wears, and whether she listens.
 *
 * Deliberately per-browser rather than per-workspace: this is a personal
 * preference about who you are talking to, and nobody else on the team should
 * inherit it. It is small enough that localStorage is the honest home for it
 * rather than a round trip.
 */
const AVATAR_KEY = 'workos_cherry_avatar';
const VOICE_KEY = 'workos_cherry_voice';

export function useCherryPrefs() {
  const [avatar, setAvatarState] = useState<Avatar>(() => {
    // Validated, not cast. The figures were renamed once, so a browser that
    // remembers an old name must land on the default rather than on a value
    // nothing can draw.
    const stored = localStorage.getItem(AVATAR_KEY);
    return stored === 'cherry' || stored === 'swathi' ? stored : 'cherry';
  });
  const [voiceEnabled, setVoiceState] = useState<boolean>(
    () => localStorage.getItem(VOICE_KEY) !== 'off',
  );

  useEffect(() => { localStorage.setItem(AVATAR_KEY, avatar); }, [avatar]);
  useEffect(() => { localStorage.setItem(VOICE_KEY, voiceEnabled ? 'on' : 'off'); }, [voiceEnabled]);

  const setAvatar = useCallback((a: Avatar) => setAvatarState(a), []);
  const setVoiceEnabled = useCallback((v: boolean) => setVoiceState(v), []);

  return { avatar, setAvatar, voiceEnabled, setVoiceEnabled };
}

/** Whether this browser can transcribe at all. Chrome and Edge can; Firefox
 *  cannot, and the mic button hides itself there rather than sitting dead. */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' &&
    Boolean((window as unknown as Record<string, unknown>).SpeechRecognition ||
            (window as unknown as Record<string, unknown>).webkitSpeechRecognition);
}
