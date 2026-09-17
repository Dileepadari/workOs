import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { invites } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import logoMark from '@/assets/logo-mark.png';

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Accounts and sign-in belong to the ecosystem identity now, so an invite is
  // accepted by an already signed-in person - it joins them to the workspace
  // (and grants WorkOS access if they lacked it), rather than creating an
  // account here.
  const handleAccept = async () => {
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      await invites.accept(token);
      setSuccess(true);
      setTimeout(() => navigate('/'), 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const returnTo = encodeURIComponent(`/invite/${token ?? ''}`);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 px-4">
      <Card className="w-full max-w-sm animate-scale-in shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 p-2.5">
            <img src={logoMark} alt="" className="h-full w-full object-contain logo-mono" />
          </div>
          <CardTitle className="font-display text-2xl">Join workspace</CardTitle>
          <CardDescription>
            {user
              ? 'Accept this invite with your current account.'
              : 'Sign in to your ecosystem account to accept this invite.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <p className="text-sm text-center text-muted-foreground">You're in! Redirecting...</p>
          ) : user ? (
            <div className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={handleAccept} disabled={submitting}>
                {submitting ? 'Please wait...' : 'Accept invite'}
              </Button>
            </div>
          ) : (
            <Button asChild className="w-full">
              <Link to={`/auth?returnTo=${returnTo}`}>Sign in to continue</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
