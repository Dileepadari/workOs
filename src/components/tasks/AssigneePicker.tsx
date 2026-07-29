import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { Member } from './types';

interface Props {
  members: Member[];
  value: string | null;
  onChange: (userId: string | null) => void;
  className?: string;
}

export function memberLabel(m: Member) {
  return m.users.display_name || m.users.username;
}

export function AssigneePicker({ members, value, onChange, className }: Props) {
  return (
    <Select value={value ?? 'unassigned'} onValueChange={(v) => onChange(v === 'unassigned' ? null : v)}>
      <SelectTrigger className={className ?? 'h-8 text-xs'}>
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.users.id} value={m.users.id}>
            <span className="flex items-center gap-2">
              <Avatar className="h-4 w-4"><AvatarFallback className="text-[9px]">{memberLabel(m)[0]?.toUpperCase()}</AvatarFallback></Avatar>
              {memberLabel(m)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
