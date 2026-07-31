'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, Mail, Lock, User, ArrowLeft, Zap, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SignUpPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email || !username || !password || !confirm) {
      toast({ title: 'Missing fields', description: 'Please fill in all fields.', variant: 'destructive' });
      return;
    }

    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }

    if (password !== confirm) {
      toast({ title: 'Passwords do not match', description: 'Please re-enter your password.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/v2/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ title: 'Could not join waitlist', description: data.error || 'Please try again later', variant: 'destructive' });
        setLoading(false);
        return;
      }
      toast({ title: "You're on the waitlist!", description: "We'll be in touch soon." });
      router.push('/waitlist-confirmed');
    } catch {
      toast({ title: 'Network error', description: 'Could not reach the server.', variant: 'destructive' });
      setLoading(false);
    }
  }

  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 text-zinc-100">
      {/* Background orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute bottom-0 -left-32 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center gap-2 text-sm text-zinc-400 transition hover:text-zinc-200">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <Card className="border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/30">
              <Zap className="h-6 w-6 text-slate-950" />
            </div>
            <CardTitle className="text-2xl">Join the Waitlist</CardTitle>
            <CardDescription className="text-zinc-400">
              We'll notify you when your account is approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="border-white/10 bg-white/[0.03] pl-9 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="text-zinc-300">Username</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    placeholder="liquidplayer"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="border-white/10 bg-white/[0.03] pl-9 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-white/10 bg-white/[0.03] pl-9 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-zinc-300">Confirm Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="border-white/10 bg-white/[0.03] pl-9 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join Waitlist'}
              </Button>
            </form>

            <Separator className="my-4 bg-white/10" />
            <div className="text-center text-sm text-zinc-400">
              Already have an account?{' '}
              <Link href="/signin" className="font-medium text-emerald-400 transition hover:text-emerald-300">
                Sign in
              </Link>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300/80">
              <CheckCircle2 className="h-3.5 w-3.5" />
              We review every application by hand to keep PlayLiquid fair.
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-zinc-600">
          By joining you agree to our{' '}
          <Link href="/terms" className="text-zinc-500 hover:text-zinc-400">Terms</Link> and{' '}
          <Link href="/privacy" className="text-zinc-500 hover:text-zinc-400">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
