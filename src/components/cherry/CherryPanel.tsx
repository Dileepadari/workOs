import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle, Check, Loader2, Mic, Plus, Send, Sparkles, Square, Trash2, Undo2, X, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { cherry as cherryApi } from '@/lib/api';
import {
  defaultConfirmedIds, operationVerb,
  type CherryApplyResult, type CherryProposal, type CherryQuestion, type CherryTurn, type CherryUndoToken,
} from '@/lib/cherry';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useInvalidate } from '@/hooks/useWorkData';
import { cn } from '@/lib/utils';
import { speechSupported } from '@/hooks/useCherryPrefs';

interface Turn {
  id: string;
  role: 'user' | 'cherry';
  text: string;
  proposal?: CherryProposal;
  /** Set once applied; drives the receipt and the undo button. */
  result?: CherryApplyResult;
  undone?: boolean;
  provider?: string;
  degradedFrom?: string | null;
}

/**
 * Cherry.
 *
 * The rule the whole component exists to enforce: nothing is written until a
 * person has seen what would change and ticked it. There is no auto-apply
 * mode, because "it usually gets it right" is not a good enough reason to let
 * a sentence rewrite someone's board unseen.
 *
 * Answering a question does not call the model again - it posts the pending
 * proposal back with the answer and the server merges it, so the actions you
 * already read cannot be quietly rewritten underneath you.
 */
export function CherryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentWorkspace } = useWorkspace();
  const invalidate = useInvalidate();
  const reduceMotion = useReducedMotion();
  const location = useLocation();
  const params = useParams();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ provider: string; reason: string } | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const canSpeak = speechSupported();

  const scopeProjectId = location.pathname.startsWith('/projects/') ? params.id ?? null : null;

  useEffect(() => {
    if (!open || status) return;
    cherryApi.status().then((s) => setStatus({ provider: s.provider, reason: s.reason })).catch(() => {});
  }, [open, status]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [turns, reduceMotion]);

  const pending = [...turns].reverse().find((t) => t.proposal && !t.result)?.proposal ?? null;

  const history = (): CherryTurn[] =>
    turns.slice(-8).map((t) => ({ role: t.role, text: t.text }));

  const ask = async (message: string) => {
    const text = message.trim();
    if (!text || busy || !currentWorkspace) return;
    setInput('');
    setBusy(true);
    setTurns((t) => [...t, { id: crypto.randomUUID(), role: 'user', text }]);

    try {
      const res = await cherryApi.parse({
        workspace_id: currentWorkspace.id,
        message: text,
        history: history(),
        pending_proposal: pending,
        scope: { project_id: scopeProjectId },
      });
      const id = crypto.randomUUID();
      setTurns((t) => [...t, {
        id, role: 'cherry',
        text: res.proposal.understanding || res.proposal.reply,
        proposal: res.proposal,
        provider: res.provider,
        degradedFrom: res.degraded_from,
      }]);
      setConfirmed((c) => ({ ...c, [id]: defaultConfirmedIds(res.proposal) }));
    } catch (err) {
      setTurns((t) => [...t, {
        id: crypto.randomUUID(), role: 'cherry',
        text: err instanceof Error ? err.message : 'Something went wrong.',
      }]);
    } finally {
      setBusy(false);
    }
  };

  /** Answering or skipping: a server-side merge, no model call. */
  const answer = async (turnId: string, answers: Record<string, unknown>, skips: string[] = [], resolutions: Record<string, string> = {}) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn?.proposal || !currentWorkspace) return;
    setBusy(true);
    try {
      const res = await cherryApi.parse({
        workspace_id: currentWorkspace.id,
        pending_proposal: turn.proposal,
        answers, skips, resolutions,
      });
      setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, proposal: res.proposal } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update that.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async (turnId: string) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn?.proposal || !currentWorkspace) return;
    const ids = confirmed[turnId] ?? [];
    if (!ids.length) return;
    setBusy(true);
    try {
      const result = await cherryApi.apply({
        workspace_id: currentWorkspace.id,
        proposal: turn.proposal,
        confirmed_action_ids: ids,
        typed_confirmations: typed,
      });
      setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, result } : x)));
      invalidate(result.touched.tables);
      if (result.failed.length) {
        toast.error(`${result.failed.length} could not be applied`, { description: result.failed[0].error });
      } else {
        toast.success(`${result.applied.length} ${result.applied.length === 1 ? 'change' : 'changes'} applied`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not apply that.');
    } finally {
      setBusy(false);
    }
  };

  const undo = async (turnId: string, token: CherryUndoToken) => {
    if (!currentWorkspace) return;
    setBusy(true);
    try {
      const res = await cherryApi.undo(currentWorkspace.id, token);
      setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, undone: true } : x)));
      invalidate();
      toast.success(`Undone - ${res.reverted} reversed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not undo that.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Dictation, using the browser's own recogniser.
   *
   * Deliberately not a service call: it needs no key and no audio ever leaves
   * for us to handle. The trade is worth stating plainly - in Chrome the audio
   * goes to Google to be transcribed, which is why this is a button you press
   * rather than something always listening, and why it hides itself entirely
   * in browsers with no recogniser rather than sitting there dead.
   */
  const toggleDictation = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const toggleAction = (turnId: string, actionId: string) => {
    setConfirmed((c) => {
      const cur = c[turnId] ?? [];
      return { ...c, [turnId]: cur.includes(actionId) ? cur.filter((x) => x !== actionId) : [...cur, actionId] };
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />
      <motion.aside
        // Her opening: a small rise and settle rather than a slide-in, so the
        // panel reads as something she said rather than a drawer.
        initial={reduceMotion ? false : { y: 8, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="cherry-panel-tail fixed inset-y-0 right-0 z-50 flex w-full max-w-[27rem] flex-col border-l border-border bg-card shadow-2xl lg:inset-y-auto lg:bottom-6 lg:right-[9.5rem] lg:max-h-[min(680px,calc(100vh-96px))] lg:rounded-xl lg:border"
        aria-label="Cherry"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-base font-semibold leading-none">Cherry</p>
              {status && (
                <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                  {status.provider === 'builtin' ? 'Built-in parser' : status.provider}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close Cherry">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {turns.length === 0 && (
            <div className="py-6">
              <p className="text-sm text-muted-foreground">
                Tell me what changed and I'll turn it into work. I'll show you exactly what I intend
                to do and wait for you to confirm it.
              </p>
              {status?.provider === 'builtin' && (
                <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-muted-foreground">
                  No AI key is set, so I'm on my built-in parser. I understand direct instructions
                  like <em>add a task to fix the header for Website, due Friday</em>, and I'll say so
                  when I can't follow something.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  'Add a task to review the migration plan, due Friday',
                  'Mark the login redirect task done',
                  'Create a project for the Q4 rewrite',
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {turns.map((turn) => (
                <motion.div
                  key={turn.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {turn.role === 'user' ? (
                    <div className="flex justify-end">
                      <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                        {turn.text}
                      </p>
                    </div>
                  ) : (
                    <CherryTurnCard
                      turn={turn}
                      confirmedIds={confirmed[turn.id] ?? []}
                      typed={typed}
                      busy={busy}
                      onToggle={(actionId) => toggleAction(turn.id, actionId)}
                      onAnswer={(a, s, r) => answer(turn.id, a, s, r)}
                      onTyped={(actionId, value) => setTyped((t) => ({ ...t, [actionId]: value }))}
                      onApply={() => apply(turn.id)}
                      onUndo={(token) => undo(turn.id, token)}
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); ask(input); }}
          className="flex gap-2 border-t border-border px-4 py-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? 'Listening...' : 'What changed?'}
            disabled={busy}
            aria-label="Message Cherry"
          />
          {canSpeak && (
            <Button
              type="button" size="icon"
              variant={listening ? 'destructive' : 'outline'}
              onClick={toggleDictation}
              disabled={busy}
              aria-label={listening ? 'Stop dictating' : 'Dictate'}
            >
              {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
          <Button type="submit" size="icon" disabled={busy || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </motion.aside>
    </>
  );
}

// --------------------------------------------------------------------------

function CherryTurnCard({
  turn, confirmedIds, typed, busy, onToggle, onAnswer, onTyped, onApply, onUndo,
}: {
  turn: Turn;
  confirmedIds: string[];
  typed: Record<string, string>;
  busy: boolean;
  onToggle: (actionId: string) => void;
  onAnswer: (answers: Record<string, unknown>, skips: string[], resolutions: Record<string, string>) => void;
  onTyped: (actionId: string, value: string) => void;
  onApply: () => void;
  onUndo: (token: CherryUndoToken) => void;
}) {
  const p = turn.proposal;

  if (!p) {
    return <p className="max-w-[90%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm">{turn.text}</p>;
  }

  const open = p.questions.filter((q) => q.answered_value === undefined && !q.skipped);
  const blocking = open.filter((q) => q.blocking);
  const optional = open.filter((q) => !q.blocking);
  const canApply = !blocking.length && !p.ambiguities.length && confirmedIds.length > 0;

  return (
    <div className="rounded-xl border border-border bg-background/60 p-3.5">
      {p.understanding && (
        <p className="text-sm leading-relaxed">
          <span className="text-muted-foreground">I understood: </span>
          {p.understanding}
        </p>
      )}
      {p.reply && <p className="mt-2 text-sm text-muted-foreground">{p.reply}</p>}

      {turn.degradedFrom && (
        <p className="mt-2 rounded-md bg-warning/10 px-2 py-1 text-[0.7rem] text-muted-foreground">
          {turn.degradedFrom} was unavailable, so I used the built-in parser.
        </p>
      )}

      {/* Anything that must be settled first, before the actions can run. */}
      {blocking.map((q) => (
        <QuestionRow key={q.id} q={q} blocking onAnswer={(v) => onAnswer({ [q.id]: v }, [], {})} />
      ))}

      {p.ambiguities.map((amb) => (
        <div key={amb.id} className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-2.5">
          <p className="text-xs font-medium">{amb.prompt}</p>
          <div className="mt-2 space-y-1">
            {amb.candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onAnswer({}, [], { [amb.id]: c.id })}
                className="block w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
              >
                <span className="font-medium">{c.label}</span>
                {c.context && <span className="text-muted-foreground"> · {c.context}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {p.actions.length > 0 && (
        <div className="mt-3 space-y-2">
          {p.actions.map((a) => {
            const checked = confirmedIds.includes(a.id);
            const Icon = a.operation === 'insert' ? Plus : a.operation === 'delete' ? Trash2 : Pencil;
            return (
              <div
                key={a.id}
                className={cn(
                  'rounded-lg border p-2.5 transition-colors',
                  a.severity === 'destructive' ? 'border-destructive/40 bg-destructive/5' : 'border-border',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(a.id)}
                    disabled={!a.ready}
                    aria-label={a.summary}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-start gap-1.5 text-sm">
                      <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', a.severity === 'destructive' && 'text-destructive')} />
                      <span>{a.summary}</span>
                    </p>
                    {a.target?.context && (
                      <p className="mt-0.5 pl-5 text-xs text-muted-foreground">{a.target.context}</p>
                    )}
                    {a.fields.length > 0 && (
                      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pl-5 text-xs">
                        {a.fields.map((f) => (
                          <div key={f.field} className="contents">
                            <dt className="text-muted-foreground">{f.label}</dt>
                            <dd className="truncate">
                              {f.display}
                              {f.source === 'default' && <span className="ml-1 text-muted-foreground">(default)</span>}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    {a.destructive && (
                      <div className="mt-2 rounded-md bg-destructive/10 p-2">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                          <AlertTriangle className="h-3 w-3" /> This cannot be fully undone
                        </p>
                        {a.destructive.cascade_summary.map((c) => (
                          <p key={c} className="mt-0.5 text-xs text-muted-foreground">{c}</p>
                        ))}
                        {a.destructive.requires_typed_confirmation && (
                          <Input
                            className="mt-2 h-7 text-xs"
                            placeholder={`Type "${a.destructive.typed_confirmation_phrase}" to confirm`}
                            value={typed[a.id] ?? ''}
                            onChange={(e) => onTyped(a.id, e.target.value)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Optional detail: offered, never required. */}
      {optional.length > 0 && !turn.result && (
        <div className="mt-3 space-y-2">
          {optional.map((q) => (
            <QuestionRow
              key={q.id}
              q={q}
              onAnswer={(v) => onAnswer({ [q.id]: v }, [], {})}
              onSkip={() => onAnswer({}, [q.id], {})}
            />
          ))}
        </div>
      )}

      {p.refusals.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-2">
          {p.refusals.map((r, i) => (
            <li key={i} className="text-xs text-muted-foreground">{r.detail}</li>
          ))}
        </ul>
      )}

      {/* Receipt, once written. */}
      {turn.result ? (
        <div className="mt-3 border-t border-border pt-2.5">
          {turn.undone ? (
            <p className="text-xs text-muted-foreground">Undone - nothing was kept.</p>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-xs text-success">
                <Check className="h-3 w-3" />
                {turn.result.applied.length} applied
                {turn.result.failed.length > 0 && `, ${turn.result.failed.length} failed`}
              </p>
              {turn.result.failed.map((f) => (
                <p key={f.action_id} className="mt-1 text-xs text-destructive">{f.error}</p>
              ))}
              {turn.result.undo.entries.length > 0 && (
                <Button
                  variant="ghost" size="sm" className="mt-1.5 h-7 gap-1.5 text-xs"
                  disabled={busy}
                  onClick={() => onUndo(turn.result!.undo)}
                >
                  <Undo2 className="h-3 w-3" /> Undo
                </Button>
              )}
              {turn.result.undo.unrecoverable.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Undo will not bring back{' '}
                  {turn.result.undo.unrecoverable.map((u) => `${u.count} ${u.table}`).join(', ')}.
                </p>
              )}
            </>
          )}
        </div>
      ) : p.actions.length > 0 ? (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
          <Button size="sm" disabled={!canApply || busy} onClick={onApply}>
            Apply {confirmedIds.length || ''} {confirmedIds.length === 1 ? 'change' : 'changes'}
          </Button>
          {blocking.length > 0 && (
            <span className="text-xs text-muted-foreground">Answer the question above first</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function QuestionRow({
  q, blocking, onAnswer, onSkip,
}: {
  q: CherryQuestion;
  blocking?: boolean;
  onAnswer: (value: unknown) => void;
  onSkip?: () => void;
}) {
  const [value, setValue] = useState('');

  return (
    <div className={cn('mt-2 rounded-lg border p-2.5', blocking ? 'border-warning bg-warning/5' : 'border-border')}>
      <p className="text-xs font-medium">
        {q.prompt}
        {blocking && <span className="ml-1 text-warning">(needed)</span>}
      </p>
      <div className="mt-1.5 flex gap-1.5">
        {q.input.kind === 'enum' ? (
          <Select onValueChange={(v) => onAnswer(v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>
              {q.input.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : q.input.kind === 'longtext' ? (
          <Textarea
            className="min-h-[60px] text-xs"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => value.trim() && onAnswer(value)}
            placeholder="Type here"
          />
        ) : (
          <Input
            className="h-8 text-xs"
            type={q.input.kind === 'date' ? 'date' : q.input.kind === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onAnswer(value); }}
            onBlur={() => value.trim() && onAnswer(value)}
          />
        )}
        {onSkip && (
          <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={onSkip}>
            {q.skip_label ?? 'Skip'}
          </Button>
        )}
      </div>
    </div>
  );
}

export { operationVerb };
