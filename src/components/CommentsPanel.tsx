import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pin, Edit2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { comments as commentsApi, reactions as reactionsApi, attachments as attachmentsApi, type Comment, type Reaction } from '@/lib/api';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { EmojiPicker } from '@/components/EmojiPicker';
import { Emoji } from '@/components/Emoji';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import type { Member } from '@/components/tasks/types';

interface Props {
  workspaceId: string;
  entityType: string;
  entityId: string;
  projectId?: string;
  currentUserId: string;
  members: Member[];
}

function memberFor(members: Member[], userId: string) {
  return members.find((m) => m.users.id === userId);
}

export function CommentsPanel({ workspaceId, entityType, entityId, projectId, currentUserId, members }: Props) {
  const [list, setList] = useState<Comment[]>([]);
  const [reactionRows, setReactionRows] = useState<Reaction[]>([]);
  const [composerDraftId, setComposerDraftId] = useState(crypto.randomUUID());
  const [pendingContent, setPendingContent] = useState<{ blocks: unknown[]; text: string } | null>(null);
  const [draftFileCount, setDraftFileCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    const [c, r] = await Promise.all([
      commentsApi.list(workspaceId, entityType, entityId),
      reactionsApi.list(workspaceId, 'comment'),
    ]);
    setList(c);
    setReactionRows(r);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId, entityType, entityId]);

  const handlePost = async () => {
    // A file-only message is legitimate ("here's the doc"), so allow posting
    // with empty text as long as something was attached.
    if (!pendingContent?.text.trim() && draftFileCount === 0) return;
    const comment = await commentsApi.create(
      workspaceId, entityType, entityId,
      pendingContent?.blocks ?? [], pendingContent?.text ?? '', projectId,
    );
    // The server mints the comment id, so files staged against the composer's
    // draft id have to be re-pointed at the real one now that it exists.
    if (draftFileCount > 0) {
      await attachmentsApi.reassign({ workspaceId, entityType: 'comment', entityId: composerDraftId }, comment.id);
    }
    setPendingContent(null);
    setDraftFileCount(0);
    setComposerDraftId(crypto.randomUUID());
    load();
  };

  const handleSaveEdit = async () => {
    if (!editingId || !pendingContent) return;
    await commentsApi.update(editingId, { content_json: pendingContent.blocks, content_text: pendingContent.text });
    setEditingId(null);
    setPendingContent(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await commentsApi.remove(id);
    load();
  };

  const togglePin = async (c: Comment) => {
    await commentsApi.update(c.id, { is_pinned: !c.is_pinned });
    load();
  };

  const toggleReaction = async (commentId: string, emoji: string) => {
    await reactionsApi.toggle(workspaceId, 'comment', commentId, emoji);
    load();
  };

  const reactionsFor = (commentId: string) => {
    const rows = reactionRows.filter((r) => r.entity_id === commentId);
    const grouped: Record<string, { count: number; reacted: boolean }> = {};
    for (const r of rows) {
      grouped[r.emoji] ??= { count: 0, reacted: false };
      grouped[r.emoji].count++;
      if (r.user_id === currentUserId) grouped[r.emoji].reacted = true;
    }
    return grouped;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <BlockEditor
            key={composerDraftId}
            content={[]}
            onChange={(blocks, text) => setPendingContent({ blocks, text })}
            workspaceId={workspaceId}
            entityType={entityType}
            entityId={composerDraftId}
            className="min-h-[100px] rounded-md border border-border"
          />
          <AttachmentsPanel
            key={composerDraftId}
            workspaceId={workspaceId}
            entityType="comment"
            entityId={composerDraftId}
            label={null}
            compact
            onChange={(rows) => setDraftFileCount(rows.length)}
          />
          <p className="text-[10px] text-muted-foreground">Type @username to mention a teammate</p>
        </div>
        <Button
          onClick={handlePost}
          disabled={!pendingContent?.text.trim() && draftFileCount === 0}
          className="shrink-0 self-start"
        >
          Post
        </Button>
      </div>

      {list.map((c, index) => {
        const author = memberFor(members, c.created_by);
        const authorLabel = author ? (author.users.display_name || author.users.username) : 'Unknown';
        const isEditing = editingId === c.id;
        const grouped = reactionsFor(c.id);

        return (
          <Card key={c.id} className={`animate-fade-in ${c.is_pinned ? 'border-primary/30' : ''}`} style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}>
            <CardContent className="p-3 sm:p-4 group">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {c.is_pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                <span className="text-xs font-medium text-foreground">{authorLabel}</span>
                <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), 'MMM d, h:mm a')}</span>
                {c.updated_at !== c.created_at && <span className="text-[10px] text-muted-foreground italic">(edited)</span>}
                <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => togglePin(c)}><Pin className="h-3 w-3" /></Button>
                  {c.created_by === currentUserId && (
                    <>
                      <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => { setEditingId(c.id); setPendingContent(null); }}><Edit2 className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(c.id)}><Trash2 className="h-3 w-3" /></Button>
                    </>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <BlockEditor
                    key={`edit-${c.id}`}
                    content={c.content_json}
                    onChange={(blocks, text) => setPendingContent({ blocks, text })}
                    workspaceId={workspaceId}
                    entityType={entityType}
                    entityId={c.id}
                    className="min-h-[80px] rounded-md border border-border"
                  />
                  <AttachmentsPanel workspaceId={workspaceId} entityType="comment" entityId={c.id} label={null} compact />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setPendingContent(null); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <BlockEditor
                    key={c.id}
                    content={c.content_json}
                    onChange={() => {}}
                    editable={false}
                    workspaceId={workspaceId}
                    entityType={entityType}
                    entityId={c.id}
                  />
                  <AttachmentsPanel workspaceId={workspaceId} entityType="comment" entityId={c.id} label={null} readOnly className="mt-2" />
                </>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1">
                {Object.entries(grouped).map(([emoji, { count, reacted }]) => (
                  <button
                    key={emoji}
                    onClick={() => toggleReaction(c.id, emoji)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${reacted ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                  >
                    <Emoji emoji={emoji} /> <span className="text-muted-foreground">{count}</span>
                  </button>
                ))}
                <EmojiPicker onSelect={(emoji) => toggleReaction(c.id, emoji)} />
              </div>
            </CardContent>
          </Card>
        );
      })}
      {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No comments yet</p>}
    </div>
  );
}
