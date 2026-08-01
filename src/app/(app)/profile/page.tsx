'use client';

import { useState } from 'react';
import { useSession } from '@/lib/auth/use-session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, User, Shield, Crown, CheckCircle2, Save, Calendar, AtSign } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  player: 'Player', creator: 'Creator', studio: 'Studio', marketplace: 'Marketplace',
  moderator: 'Moderator', support: 'Support', finance: 'Finance', operations: 'Operations',
  admin: 'Admin', developer: 'Developer',
};

function initials(name: string): string {
  if (!name) return 'PL';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfilePage() {
  const { session, loading } = useSession();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  // Initialize once session loads
  if (session && !displayName && session.displayName) {
    setDisplayName(session.displayName);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!session) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandType: 'UpdateProfile',
          payload: {
            userId: session!.userId,
            displayName,
            timezone: session!.roles?.length ? 'UTC' : 'UTC',
            locale: 'en',
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: 'Profile saved', description: 'Your changes have been recorded.' });
      } else {
        toast({ title: 'Save failed', description: data.error || 'Please try again', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Network error', description: 'Could not reach server', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header card */}
      <Card className="overflow-hidden border-white/5 bg-white/[0.02] backdrop-blur">
        <div className="h-24 bg-gradient-to-r from-emerald-500/30 via-cyan-500/30 to-emerald-500/30" />
        <CardContent className="px-6 pb-6">
          <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar className="h-24 w-24 border-4 border-slate-950">
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-cyan-500 text-2xl font-bold text-slate-950">
                  {initials(session.displayName || session.username)}
                </AvatarFallback>
              </Avatar>
              <div className="pb-2">
                <h1 className="text-2xl font-bold text-zinc-100">{session.displayName || session.username}</h1>
                <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
                  <AtSign className="h-3.5 w-3.5" />
                  {session.username}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pb-2">
              {session!.roles.map((role) => (
                <Badge
                  key={role}
                  variant="outline"
                  className={role === session.activeRole
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-white/10 bg-white/[0.03] text-zinc-400'}
                >
                  {role === session.activeRole && <CheckCircle2 className="mr-1 h-3 w-3" />}
                  {ROLE_LABELS[role] || role}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account info */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-white/5 bg-white/[0.02] lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base text-zinc-100">Account Information</CardTitle>
            <CardDescription className="text-zinc-500">Update your public profile</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-zinc-300">Display Name</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="border-white/10 bg-white/[0.03] pl-9 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="username" className="text-zinc-300">Username</Label>
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="username"
                    value={session.username}
                    disabled
                    className="cursor-not-allowed border-white/10 bg-white/[0.01] pl-9 text-zinc-500"
                  />
                </div>
                <p className="text-xs text-zinc-600">Username cannot be changed.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="email"
                    value={session.email}
                    disabled
                    className="cursor-not-allowed border-white/10 bg-white/[0.01] pl-9 text-zinc-500"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/5 bg-white/[0.02]">
          <CardHeader>
            <CardTitle className="text-base text-zinc-100">Account Status</CardTitle>
            <CardDescription className="text-zinc-500">Your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Shield className="h-4 w-4 text-emerald-300" />
                Account Type
              </div>
              <Badge variant="outline" className={session.isDemo ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}>
                {session.isDemo ? 'Demo' : 'Permanent'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Crown className="h-4 w-4 text-cyan-300" />
                Active Role
              </div>
              <span className="text-sm font-medium text-zinc-200">{ROLE_LABELS[session.activeRole] || session.activeRole}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Calendar className="h-4 w-4 text-zinc-300" />
                Member Since
              </div>
              <span className="text-sm font-medium text-zinc-200">{new Date().getFullYear()}</span>
            </div>
            <Separator className="bg-white/5" />
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300/80">
              Need help with your account? Reach out to our support team for assistance.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
