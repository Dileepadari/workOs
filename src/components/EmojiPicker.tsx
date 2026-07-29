import { useState } from 'react';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SmilePlus } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface Props {
  onSelect: (emoji: string) => void;
  trigger?: React.ReactNode;
}

// Real emoji-mart picker (search, categories, recents) instead of `prompt()`
// — set="twitter" renders Twemoji icon images rather than relying on the
// viewer's OS emoji font, matching how already-picked reactions render
// elsewhere via `Emoji.tsx`.
export function EmojiPicker({ onSelect, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
            <SmilePlus className="h-3.5 w-3.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Picker
          data={emojiData}
          onEmojiSelect={(emoji: { native: string }) => { onSelect(emoji.native); setOpen(false); }}
          theme={theme}
          set="twitter"
          previewPosition="none"
          skinTonePosition="none"
          maxFrequentRows={2}
        />
      </PopoverContent>
    </Popover>
  );
}
