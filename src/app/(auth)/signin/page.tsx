'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Loader2, Mail, Lock, ArrowLeft, Zap, User, Crown, Building2, ShoppingCart, Shield, LifeBuoy, Wallet, Settings2, Wrench } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DemoAccount {
  email: string;
  username: string;
  displayName: string;
  role: string;
  password: string;
}

const ROLE_META: Record<string, { icon: typeof User; label: string; color: string }> = {
  player: { icon: User, label: 'Continue as Player', color: 'text-emerald-300' },
  creator: { icon: Crown, label: 'Continue as Creator', color: 'text-cyan-300' },
  studio: { icon: Building2, label: 'Continue as Studio', color: 'text-emerald-300' },
  marketplace: { icon: ShoppingCart, label: 'Continue as Marketplace', color: 'text-cyan-300' },
  moderator: { icon: Shield, label: 'Continue as Moderator', color: 'text-emerald-300' },
  support: { icon: LifeBuoy, label: 'Continue as Support', color: 'text-cyan-300' },
  finance: { icon: Wallet, label: 'Continue as Finance', color: 'text-emerald-300' },
  operations: { icon: Settings2, label: 'Continue as Operations', color: 'text-cyan-300' },
  admin: { icon: Crown, label: 'Continue as Admin', color: 'text-emerald-300' },
  developer: { icon: Wrench, label: 'Continue as Developer', color: 'text-cyan-300' },
};

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemoMode = searchParams.get('demo') === 'true';
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [loadingDemos, setLoadingDemos] = useState(isDemoMode);

  useEffect(() => {
    if (!isDemoMode) return;
    let cancelled = false;
    fetch('/api/auth/v2/demo-accounts')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok && data.data) setDemoAccounts(data.data);
        setLoadingDemos(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingDemos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDemoMode]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: 'Missing fields', description: 'Please enter your email and password.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/v2/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ title: 'Sign in failed', description: data.error || 'Invalid credentials', variant: 'destructive' });
        setLoading(false);
        return;
      }
      toast({ title: 'Welcome back!', description: 'Redirecting to your dashboard…' });
      setTimeout(() => { window.location.href = '/home'; }, 100);
    } catch (err) {
      toast({ title: 'Network error', description: 'Could not reach the server.', variant: 'destructive' });
      setLoading(false);
    }
  }

  async function handleDemoLogin(demo: DemoAccount) {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/v2/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demo.email, password: demo.password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ title: 'Demo login failed', description: data.error || 'Try again later', variant: 'destructive' });
        setLoading(false);
        return;
      }
      toast({ title: `Signed in as ${demo.displayName}`, description: 'Redirecting…' });
      setTimeout(() => { window.location.href = '/home'; }, 100);
    } catch {
      toast({ title: 'Network error', description: 'Could not reach the server.', variant: 'destructive' });
      setLoading(false);
    }
  }

  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 text-zinc-100">
      {/* Background orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute bottom-0 -right-32 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
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
            <CardTitle className="text-2xl">Sign in to PlayLiquid</CardTitle>
            <CardDescription className="text-zinc-400">
              {isDemoMode ? 'Pick a demo account to explore the platform' : 'Enter your credentials to continue'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isDemoMode ? (
              <div className="space-y-3">
                {loadingDemos ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                  </div>
                ) : demoAccounts.length === 0 ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                    No demo accounts found. Please run the seed script to create demo accounts.
                  </div>
                ) : (
                  demoAccounts.map((demo) => {
                    const meta = ROLE_META[demo.role] || ROLE_META.player;
                    const Icon = meta.icon;
                    return (
                      <button
                        key={demo.email}
                        type="button"
                        disabled={loading}
                        onClick={() => handleDemoLogin(demo)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-left transition hover:border-emerald-500/40 hover:bg-white/[0.05] disabled:opacity-50"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300 transition group-hover:bg-emerald-500/20">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-zinc-100">{meta.label}</div>
                          <div className="truncate text-xs text-zinc-500">{demo.displayName} · {demo.email}</div>
                        </div>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : <ArrowLeft className="h-4 w-4 rotate-180 text-zinc-500 transition group-hover:text-emerald-300" />}
                      </button>
                    );
                  })
                )}

                <Separator className="my-4 bg-white/10" />
                <Link href="/signin" className="block text-center text-sm text-zinc-400 transition hover:text-zinc-200">
                  Use a regular account instead
                </Link>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-zinc-300">Password</Label>
                    <Link href="/forgot-password" className="text-xs text-emerald-400 transition hover:text-emerald-300">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="border-white/10 bg-white/[0.03] pl-9 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember"
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                    className="border-white/20 data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500"
                  />
                  <Label htmlFor="remember" className="text-sm text-zinc-400">Remember me</Label>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
                </Button>
              </form>
            )}

            <Separator className="my-4 bg-white/10" />
            <div className="flex flex-col gap-2 text-center text-sm">
              <p className="text-zinc-400">
                New to PlayLiquid?{' '}
                <Link href="/signup" className="font-medium text-emerald-400 transition hover:text-emerald-300">
                  Join the waitlist
                </Link>
              </p>
              {!isDemoMode && (
                <Link href="/signin?demo=true" className="text-xs text-zinc-500 transition hover:text-zinc-300">
                  Or try a quick demo login →
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-zinc-600">
          By signing in you agree to our{' '}
          <Link href="/terms" className="text-zinc-500 hover:text-zinc-400">Terms</Link> and{' '}
          <Link href="/privacy" className="text-zinc-500 hover:text-zinc-400">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="dark flex min-h-screen items-center justify-center bg-slate-950 text-zinc-100"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>}>
      <SignInForm />
    </Suspense>
  );
}
