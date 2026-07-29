import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, workspaces as workspacesApi } from '@/lib/api';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useTheme, hexToHSL } from '@/contexts/ThemeContext';
import { ArrowRight, Check, Sparkles, FolderPlus, UserPlus } from 'lucide-react';

const DISMISSED_KEY = 'workos_onboarding_dismissed';

function isDismissed(workspaceId: string) {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]').includes(workspaceId);
  } catch {
    return false;
  }
}

function markDismissed(workspaceId: string) {
  const list: string[] = (() => {
    try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'); } catch { return []; }
  })();
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...list, workspaceId])]));
}

// First swatch keeps the real ADK Dev brand (the 'common' palette) rather
// than overriding it — picking any other swatch switches to a custom
// single-color palette instead.
const BRAND_DEFAULT = '#47266b';
const BRAND_SWATCHES = [BRAND_DEFAULT, '#2563eb', '#dc2626', '#16a34a', '#0891b2', '#ea580c'];

export function OnboardingWizard() {
  const { currentWorkspace, refresh } = useWorkspace();
  const { setCustomColors, setColorPalette } = useTheme();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState(false);

  const [workspaceName, setWorkspaceName] = useState('');
  const [brandColor, setBrandColor] = useState(BRAND_SWATCHES[0]);
  const [projectName, setProjectName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!currentWorkspace || checked) return;
    setChecked(true);
    if (isDismissed(currentWorkspace.id) || currentWorkspace.role !== 'owner') return;
    api.select('projects', currentWorkspace.id).then((projects) => {
      if (projects.length === 0) {
        setWorkspaceName(currentWorkspace.name);
        setOpen(true);
      }
    });
  }, [currentWorkspace, checked]);

  const close = () => {
    if (currentWorkspace) markDismissed(currentWorkspace.id);
    setOpen(false);
  };

  const steps = [
    {
      icon: Sparkles,
      title: 'Welcome to WorkOS',
      description: 'A couple of quick things to make this feel like yours.',
      body: (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Workspace name</Label>
            <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Brand color</Label>
            <div className="flex gap-2">
              {BRAND_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setBrandColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${brandColor === c ? 'border-foreground' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
      ),
      onNext: async () => {
        if (!currentWorkspace) return;
        setSubmitting(true);
        try {
          if (workspaceName.trim() && workspaceName !== currentWorkspace.name) {
            await workspacesApi.rename(currentWorkspace.id, workspaceName.trim());
          }
          if (brandColor === BRAND_DEFAULT) setColorPalette('common');
          else setCustomColors(brandColor, brandColor);
          await refresh();
        } finally {
          setSubmitting(false);
        }
      },
    },
    {
      icon: FolderPlus,
      title: 'Create your first project',
      description: 'Everything in WorkOS — tasks, notes, discussions — lives inside a project.',
      body: (
        <div className="space-y-2">
          <Label>Project name</Label>
          <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Website Redesign" autoFocus />
        </div>
      ),
      onNext: async () => {
        if (!currentWorkspace || !projectName.trim()) return;
        setSubmitting(true);
        try {
          const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          await api.insert('projects', currentWorkspace.id, { name: projectName.trim(), status: 'active', color: brandColor, type: 'personal', tags: [], slug });
        } finally {
          setSubmitting(false);
        }
      },
      skippable: true,
    },
    {
      icon: UserPlus,
      title: 'Invite your team',
      description: 'Work is better together. You can always do this later from the Team page.',
      body: (
        <div className="space-y-2">
          <Label>Teammate's email</Label>
          <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@example.com" />
        </div>
      ),
      onNext: async () => {
        if (!currentWorkspace || !inviteEmail.trim()) return;
        setSubmitting(true);
        try {
          await workspacesApi.invites.create(currentWorkspace.id, { email: inviteEmail.trim(), role: 'member' });
        } finally {
          setSubmitting(false);
        }
      },
      skippable: true,
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleNext = async () => {
    await current.onNext?.();
    if (isLast) close();
    else setStep((s) => s + 1);
  };

  if (!currentWorkspace) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <div className="space-y-5 animate-fade-in" key={step}>
          <div className="flex items-center gap-2">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <current.icon className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">{current.title}</h2>
            <p className="text-sm text-muted-foreground">{current.description}</p>
          </div>
          {current.body}
          <div className="flex items-center justify-between pt-2">
            {current.skippable ? (
              <Button variant="ghost" size="sm" onClick={() => (isLast ? close() : setStep((s) => s + 1))}>Skip</Button>
            ) : <span />}
            <Button size="sm" onClick={handleNext} disabled={submitting}>
              {isLast ? (<><Check className="mr-1.5 h-3.5 w-3.5" />Done</>) : (<>Next<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></>)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
