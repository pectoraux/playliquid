// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/lib/auth/use-session';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Sparkles, ArrowRight, Clock, Trophy, Wallet, Users, Gift, Gamepad2, Palette, Rocket, BarChart3, Building2, Code2, Store, Tags, Repeat, Flag, AlertTriangle, Shield, CheckCircle, LifeBuoy, TicketCheck, DollarSign, Receipt, FileText, Activity, Radio, Database, Bell, LayoutDashboard, Boxes, ArrowUpRight, TrendingUp, Zap, Plus, Settings2, Crown } from 'lucide-react';

interface DemoResponse<T = unknown> {
  ok: boolean;
  data: T;
}

export default function HomePage() {
  const { session, loading } = useSession();
  const [demoData, setDemoData] = useState<unknown>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const role = session?.activeRole || 'player';

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch(`/api/dashboard?role=${encodeURIComponent(role)}&userId=${encodeURIComponent(session.userId)}`)
      .then((r) => r.json())
      .then((data: DemoResponse) => {
        if (cancelled) return;
        if (data.ok) setDemoData(data.data);
        setDataLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, role]);

  if (loading || !session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  const greeting = getGreeting();
  const firstName = (session.displayName || session.username).split(' ')[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            {roleLabel(role)} workspace
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
            {greeting}, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Here's what's happening in your PlayLiquid world today.
          </p>
        </div>
        <QuickActions role={role} />
      </div>

      {dataLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-6">
                <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
                <div className="mt-3 h-8 w-24 animate-pulse rounded bg-white/10" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <RoleHome role={role} data={demoData} session={session} />
      )}
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    player: 'Player', creator: 'Creator', studio: 'Studio', marketplace: 'Marketplace',
    moderator: 'Moderator', support: 'Support', finance: 'Finance', operations: 'Operations',
    admin: 'Admin', developer: 'Developer',
  };
  return labels[role] || role;
}

function QuickActions({ role }: { role: string }) {
  const actions: Record<string, { label: string; href: string; icon: typeof Gamepad2 }> = {
    player: { label: 'Browse Games', href: '/games', icon: Gamepad2 },
    creator: { label: 'Create Game', href: '/create', icon: Plus },
    studio: { label: 'View Studios', href: '/studios', icon: Building2 },
    marketplace: { label: 'Open Store', href: '/store', icon: Store },
    moderator: { label: 'Review Reports', href: '/reports', icon: Flag },
    support: { label: 'Open Tickets', href: '/tickets', icon: TicketCheck },
    finance: { label: 'View Payouts', href: '/payouts', icon: Receipt },
    operations: { label: 'System Health', href: '/system-health', icon: Activity },
    admin: { label: 'Manage Users', href: '/users', icon: Users },
    developer: { label: 'Architecture', href: '/architecture', icon: LayoutDashboard },
  };
  const a = actions[role];
  if (!a) return null;
  const Icon = a.icon;
  return (
    <Button asChild className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
      <Link href={a.href}>
        <Icon className="h-4 w-4" />
        {a.label}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}

function RoleHome({ role, data }: { role: string; data: unknown; session: { displayName: string; username: string } }) {
  switch (role) {
    case 'player': return <PlayerHome data={data as PlayerData} />;
    case 'creator': return <CreatorHome data={data as CreatorData} />;
    case 'studio': return <StudioHome data={data as StudioData} />;
    case 'marketplace': return <MarketplaceHome data={data as MarketplaceData} />;
    case 'moderator': return <ModeratorHome data={data as ModeratorData} />;
    case 'support': return <SupportHome data={data as SupportData} />;
    case 'finance': return <FinanceHome data={data as FinanceData} />;
    case 'operations': return <OperationsHome data={data as OperationsData} />;
    case 'admin': return <AdminHome data={data as AdminData} />;
    case 'developer': return <DeveloperHome data={data as DeveloperData} />;
    default: return <PlayerHome data={data as PlayerData} />;
  }
}

// Re-import the demo data types from the lib so we stay in sync with the server.
import type {
  PlayerData, CreatorData, StudioData, MarketplaceData,
  ModeratorData, SupportData, FinanceData, OperationsData,
} from '@/lib/demo/demo-data';

interface AdminData {
  totalUsers: number; activeUsers: number; suspendedUsers: number;
  pendingWaitlist: number; totalGames: number; publishedGames: number;
  totalEvents: number; systemHealth: string;
  finance?: { revenue: { total: number } };
  operations?: { systemHealth: { status: string; uptime: string } };
}
interface DeveloperData {
  operations: OperationsData; systemHealth: OperationsData['systemHealth'];
}

// ─── Shared primitives ───────────────────────────────────────────────────────

function SectionHeader({ title, icon: Icon, action }: { title: string; icon: typeof Trophy; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function StatCard({
  label, value, sub, icon: Icon, accent = 'emerald',
}: {
  label: string; value: string | number; sub?: string;
  icon: typeof Trophy; accent?: 'emerald' | 'cyan';
}) {
  const color = accent === 'cyan' ? 'bg-cyan-500/10 text-cyan-300' : 'bg-emerald-500/10 text-emerald-300';
  return (
    <Card className="border-white/5 bg-white/[0.02] backdrop-blur transition hover:border-white/10">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 text-2xl font-bold text-zinc-100">{value}</div>
        {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function PageCard({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`border-white/5 bg-white/[0.02] backdrop-blur ${className || ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-zinc-100">{title}</CardTitle>
        {description && <CardDescription className="text-xs text-zinc-500">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ─── PLAYER ─────────────────────────────────────────────────────────────────

function PlayerHome({ data }: { data: PlayerData }) {
  if (!data) return null;
  return (
    <div className="space-y-8">
      {/* Top stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Wallet Balance" value={`${(data?.wallet?.balance ?? 0).toLocaleString()} ${data?.wallet?.currency ?? 'GHS'}`} icon={Wallet} sub="Available to spend" />
        <StatCard label="Leaderboard Rank" value={`#${(data?.leaderboardPosition?.rank ?? 0).toLocaleString()}`} icon={Trophy} sub={`of ${(data?.leaderboardPosition?.total ?? 0).toLocaleString()} players`} accent="cyan" />
        <StatCard label="Score" value={(data?.leaderboardPosition?.score ?? 0).toLocaleString()} icon={TrendingUp} sub="All-time best" />
        <StatCard label="Friends Online" value={data?.friendsOnline ?? 0} icon={Users} sub="Playing now" />
      </div>

      {/* Continue Playing */}
      <div>
        <SectionHeader title="Continue Playing" icon={Gamepad2} action={<Button asChild variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100"><Link href="/games">View all<ArrowRight className="h-3.5 w-3.5" /></Link></Button>} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(data?.recentGames ?? []).map((g) => (
            <Link key={g.id} href={`/play/${g.id}`}>
            <Card className="group cursor-pointer border-white/5 bg-white/[0.02] transition hover:border-emerald-500/30 hover:bg-white/[0.04]">
              <CardContent className="p-4">
                <div className="mb-3 flex h-16 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-3xl">
                  {g.thumbnail || '🎮'}
                </div>
                <div className="truncate text-sm font-medium text-zinc-100">{g.title}</div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                  <Clock className="h-3 w-3" />{g.lastPlayed || 'Never played'}
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
                    <span>Status</span>
                    <span className="text-emerald-400">{g.status || 'available'}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-300 opacity-0 transition-opacity group-hover:opacity-100">
                  Play Now <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
            </Link>
          ))}
          {(!data?.recentGames || data.recentGames.length === 0) && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-zinc-500">No games available yet.</p>
                <Link href="/play" className="mt-2 text-sm font-medium text-emerald-300 hover:text-emerald-200">Play built-in games →</Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Daily challenge + Rewards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {data?.dailyChallenge ? (
        <Card className="overflow-hidden border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 backdrop-blur lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-300">
              <Zap className="h-3.5 w-3.5" />Daily Challenge
            </div>
            <CardTitle className="text-lg text-zinc-100">{data.dailyChallenge.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-black/20 p-3">
              <span className="text-xs text-zinc-400">Reward</span>
              <span className="font-semibold text-emerald-300">+{data.dailyChallenge.reward} pts</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-black/20 p-3">
              <span className="text-xs text-zinc-400">Time remaining</span>
              <span className="font-mono font-semibold text-cyan-300">{data.dailyChallenge.expiresIn}</span>
            </div>
            <Button className="w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400">
              Start Challenge
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
        ) : (
        <Card className="border-white/5 bg-white/[0.02] lg:col-span-1">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Zap className="h-8 w-8 text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-500">No active daily challenge.</p>
            <p className="text-xs text-zinc-600">Check back later for new challenges.</p>
          </CardContent>
        </Card>
        )}

        <PageCard title="Recent Rewards" description="Your latest earnings" className="lg:col-span-2">
          <div className="space-y-2">
            {data?.recentRewards?.length > 0 ? data.recentRewards.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
                  <Gift className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-100">{r.title}</div>
                  <div className="text-xs text-zinc-500">{r.date}</div>
                </div>
                <div className="font-semibold text-emerald-300">+{r.amount}</div>
              </div>
            )) : (
              <div className="flex items-center justify-center py-8 text-center text-sm text-zinc-600">
                No rewards yet. Play games and complete challenges to earn rewards.
              </div>
            )}
          </div>
        </PageCard>
      </div>
    </div>
  );
}

// ─── CREATOR ─────────────────────────────────────────────────────────────────

function CreatorHome({ data }: { data: CreatorData }) {
  if (!data) return null;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Plays" value={(data?.analytics?.totalPlays ?? 0).toLocaleString()} icon={TrendingUp} sub={`${(data?.analytics?.totalPlayers ?? 0).toLocaleString()} unique players`} />
        <StatCard label="Avg Rating" value={`${data?.analytics?.avgRating ?? 0} ★`} icon={Trophy} sub="Across all games" accent="cyan" />
        <StatCard label="Total Revenue" value={`${(data?.revenue?.total ?? 0).toLocaleString()} ${data?.revenue?.currency ?? 'GHS'}`} icon={DollarSign} sub="Lifetime earnings" />
        <StatCard label="This Month" value={`${(data?.revenue?.thisMonth ?? 0).toLocaleString()} ${data?.revenue?.currency ?? 'GHS'}`} icon={BarChart3} sub="Current period" accent="cyan" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <PageCard title="My Games" description="Published games performance" className="lg:col-span-2">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-zinc-500">Game</TableHead>
                <TableHead className="text-zinc-500">Status</TableHead>
                <TableHead className="text-right text-zinc-500">Plays</TableHead>
                <TableHead className="text-right text-zinc-500">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.myGames ?? []).map((g) => (
                <TableRow key={g.id} className="border-white/5">
                  <TableCell className="font-medium text-zinc-100">{g.title}</TableCell>
                  <TableCell>
                    <Badge variant={g.status === 'published' ? 'default' : 'secondary'} className={g.status === 'published' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-zinc-400'}>
                      {g.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-300">{(g.plays ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-300">{(g.revenue ?? 0).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PageCard>

        <div className="space-y-6">
          <Card className="overflow-hidden border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-emerald-500/10 backdrop-blur">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-cyan-300">
                <Sparkles className="h-3.5 w-3.5" />AI Studio
              </div>
              <CardTitle className="text-lg text-zinc-100">Generate your next game</CardTitle>
              <CardDescription className="text-xs text-zinc-400">Describe it. We'll build it.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                <Link href="/ai-studio">
                  Open AI Studio
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <PageCard title="Publishing Queue" description="Awaiting review">
            <div className="space-y-2">
              {(data?.publishingQueue ?? []).map((q) => (
                <div key={q.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-100">{q.title}</div>
                  </div>
                  <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">{q.status}</Badge>
                </div>
              ))}
            </div>
          </PageCard>
        </div>
      </div>

      <div>
        <SectionHeader title="Continue Building" icon={Palette} action={<Button asChild variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100"><Link href="/create">New game<Plus className="h-3.5 w-3.5" /></Link></Button>} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.myGames ?? []).filter((g) => g.status === 'draft').map((g) => (
            <Card key={g.id} className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-4">
                <div className="mb-3 flex h-20 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/10 to-emerald-500/10">
                  <Palette className="h-7 w-7 text-zinc-500" />
                </div>
                <div className="truncate text-sm font-medium text-zinc-100">{g.title}</div>
                <div className="mt-1 text-xs text-zinc-500">Draft · last edited 2h ago</div>
                <Button variant="outline" size="sm" className="mt-3 w-full border-white/10 bg-white/[0.03] text-zinc-200 hover:border-emerald-500/40 hover:text-white">
                  Continue editing
                </Button>
              </CardContent>
            </Card>
          ))}
          {(data?.myGames ?? []).filter((g) => g.status === 'draft').length === 0 && (
            <Card className="border-dashed border-white/10 bg-white/[0.01]">
              <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                <Palette className="h-8 w-8 text-zinc-600" />
                <p className="mt-2 text-sm text-zinc-500">No drafts in progress</p>
                <Button asChild variant="ghost" size="sm" className="mt-2 text-emerald-400 hover:text-emerald-300">
                  <Link href="/create">Start a new game</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── STUDIO ──────────────────────────────────────────────────────────────────

function StudioHome({ data }: { data: StudioData }) {
  if (!data) return null;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Revenue" value={`${data?.revenue?.total.toLocaleString()}`} icon={DollarSign} sub="All studios" />
        <StatCard label="This Month" value={`${data?.revenue?.thisMonth.toLocaleString()}`} icon={BarChart3} sub="Current period" accent="cyan" />
        <StatCard label="Studios" value={data?.studios?.length ?? 0} icon={Building2} sub="Under management" />
        <StatCard label="Developers" value={data?.developers?.length ?? 0} icon={Code2} sub="Across all studios" accent="cyan" />
      </div>

      <div>
        <SectionHeader title="Studios" icon={Building2} action={<Button asChild variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-100"><Link href="/studios">Manage<ArrowRight className="h-3.5 w-3.5" /></Link></Button>} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(data?.studios ?? []).map((s) => (
            <Card key={s.id} className="border-white/5 bg-white/[0.02]">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 text-slate-950">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium text-zinc-100">{s.name}</div>
                      <div className="text-xs text-zinc-500">{s.members} members · {s.projects} projects</div>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-zinc-600" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PageCard title="Developers" description="Your team">
          <div className="space-y-2">
            {(data?.developers ?? []).map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <Avatar className="h-9 w-9 border border-white/10">
                  <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-cyan-500 text-xs font-semibold text-slate-950">
                    {d.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-100">{d.name}</div>
                  <div className="text-xs text-zinc-500">{d.role}</div>
                </div>
                <Badge variant={d.status === 'Active' ? 'default' : 'secondary'} className={d.status === 'Active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-zinc-400'}>
                  {d.status}
                </Badge>
              </div>
            ))}
          </div>
        </PageCard>

        <PageCard title="Projects" description="With deadlines">
          <div className="space-y-2">
            {(data?.projects ?? []).map((p) => (
              <div key={p.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium text-zinc-100">{p.title}</div>
                  <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">{p.status}</Badge>
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                  <Clock className="h-3 w-3" />Deadline: {p.deadline}
                </div>
              </div>
            ))}
          </div>
        </PageCard>
      </div>
    </div>
  );
}

// ─── MARKETPLACE ────────────────────────────────────────────────────────────

function MarketplaceHome({ data }: { data: MarketplaceData }) {
  if (!data) return null;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Sales" value={data?.storePerformance?.totalSales.toLocaleString()} icon={Tags} sub="All time" />
        <StatCard label="Revenue" value={`${data?.storePerformance?.revenue.toLocaleString()}`} icon={DollarSign} sub="Gross" accent="cyan" />
        <StatCard label="Conversion" value={`${data?.storePerformance?.conversionRate}%`} icon={TrendingUp} sub="Visitor → buyer" />
        <StatCard label="Subscriptions" value={data?.subscriptions?.active.toLocaleString()} icon={Repeat} sub={`+${data?.subscriptions?.revenue.toLocaleString()} revenue`} accent="cyan" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Today" value={data?.sales?.today.toLocaleString()} icon={Tags} />
        <StatCard label="This Week" value={data?.sales?.thisWeek.toLocaleString()} icon={Tags} accent="cyan" />
        <StatCard label="This Month" value={data?.sales?.thisMonth.toLocaleString()} icon={Tags} />
      </div>

      <PageCard title="Featured Games" description="Top performing titles in your store">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-zinc-500">Game</TableHead>
              <TableHead className="text-right text-zinc-500">Price</TableHead>
              <TableHead className="text-right text-zinc-500">Sales</TableHead>
              <TableHead className="text-right text-zinc-500">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.featuredGames ?? []).map((g) => (
              <TableRow key={g.id} className="border-white/5">
                <TableCell className="font-medium text-zinc-100">{g.title}</TableCell>
                <TableCell className="text-right tabular-nums text-zinc-300">{g.price}</TableCell>
                <TableCell className="text-right tabular-nums text-zinc-300">{(g.sales ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-300">{(g.price ?? 0) * (g.sales ?? 0).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageCard>
    </div>
  );
}

// ─── MODERATOR ──────────────────────────────────────────────────────────────

function ModeratorHome({ data }: { data: ModeratorData }) {
  if (!data) return null;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open Reports" value={(data?.reports ?? []).filter((r) => r.status !== 'Resolved').length} icon={Flag} sub="Needs attention" />
        <StatCard label="Flagged Games" value={data?.flaggedGames?.length ?? 0} icon={AlertTriangle} sub="Awaiting review" accent="cyan" />
        <StatCard label="Flagged Players" value={data?.antiCheat?.flaggedPlayers ?? 0} icon={Shield} sub="Suspicious activity" />
        <StatCard label="Banned Today" value={data?.antiCheat?.bannedToday ?? 0} icon={CheckCircle} sub="Confirmed cheaters" accent="cyan" />
      </div>

      <PageCard title="Reports" description="Most recent incidents">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-zinc-500">Type</TableHead>
              <TableHead className="text-zinc-500">Severity</TableHead>
              <TableHead className="text-zinc-500">Status</TableHead>
              <TableHead className="text-right text-zinc-500">Reported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.reports ?? []).map((r) => (
              <TableRow key={r.id} className="border-white/5">
                <TableCell className="font-medium text-zinc-100">{r.type}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={severityClass(r.severity)}>{r.severity}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={r.status === 'Resolved' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-zinc-400'}>{r.status}</Badge>
                </TableCell>
                <TableCell className="text-right text-zinc-500">{r.reportedAt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PageCard title="Flagged Games" description="Under community review">
          <div className="space-y-2">
            {(data?.flaggedGames ?? []).map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-100">{g.title}</div>
                </div>
                <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-300">{g.flagCount} flags</Badge>
              </div>
            ))}
          </div>
        </PageCard>

        <PageCard title="Active Incidents" description="Ongoing investigations">
          <div className="space-y-2">
            {(data?.incidents ?? []).map((i) => (
              <div key={i.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-medium text-zinc-100">{i.title}</div>
                  <Badge variant="outline" className={severityClass(i.severity)}>{i.severity}</Badge>
                </div>
                <div className="mt-1 text-xs text-zinc-500">Status: {i.status}</div>
              </div>
            ))}
          </div>
        </PageCard>
      </div>
    </div>
  );
}

function severityClass(severity: string): string {
  switch (severity) {
    case 'critical': return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    case 'high': return 'border-orange-500/30 bg-orange-500/10 text-orange-300';
    case 'medium': return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'low': return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300';
    default: return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300';
  }
}

// ─── SUPPORT ────────────────────────────────────────────────────────────────

function SupportHome({ data }: { data: SupportData }) {
  if (!data) return null;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open Tickets" value={(data?.tickets ?? []).filter((t) => t.status !== 'Resolved').length} icon={TicketCheck} sub="Needs response" />
        <StatCard label="Live Sessions" value={data?.liveSessions ?? 0} icon={Radio} sub="Active right now" accent="cyan" />
        <StatCard label="Player Issues" value={data?.playerIssues ?? 0} icon={Users} sub="Last 24h" />
        <StatCard label="Creator Issues" value={data?.creatorIssues ?? 0} icon={Crown} sub="Last 24h" accent="cyan" />
      </div>

      <PageCard title="Tickets" description="Most recent cases">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-zinc-500">Subject</TableHead>
              <TableHead className="text-zinc-500">Priority</TableHead>
              <TableHead className="text-zinc-500">Status</TableHead>
              <TableHead className="text-right text-zinc-500">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.tickets ?? []).map((t) => (
              <TableRow key={t.id} className="border-white/5">
                <TableCell className="font-medium text-zinc-100">{t.subject}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={priorityClass(t.priority)}>{t.priority}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={t.status === 'Resolved' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-zinc-400'}>{t.status}</Badge>
                </TableCell>
                <TableCell className="text-right text-zinc-500">{t.createdAt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageCard>

      <PageCard title="Refund Requests" description="Pending review">
        <div className="space-y-2">
          {(data?.refundRequests ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300">
                  <Receipt className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-100">Refund #{r.id}</div>
                  <div className="text-xs text-zinc-500">Status: {r.status}</div>
                </div>
              </div>
              <div className="font-semibold text-amber-300">{r.amount}</div>
            </div>
          ))}
        </div>
      </PageCard>
    </div>
  );
}

function priorityClass(p: string): string {
  switch (p) {
    case 'high': return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    case 'medium': return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'low': return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300';
    default: return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300';
  }
}

// ─── FINANCE ────────────────────────────────────────────────────────────────

function FinanceHome({ data }: { data: FinanceData }) {
  if (!data) return null;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Revenue" value={`${data?.revenue?.total.toLocaleString()} ${data?.revenue?.currency}`} icon={DollarSign} sub="All time" />
        <StatCard label="This Month" value={`${data?.revenue?.thisMonth.toLocaleString()} ${data?.revenue?.currency}`} icon={BarChart3} sub="Current period" accent="cyan" />
        <StatCard label="Available Liquidity" value={`${data?.liquidity?.available.toLocaleString()}`} icon={Wallet} sub="Free to deploy" />
        <StatCard label="Reserved" value={`${data?.liquidity?.reserved.toLocaleString()}`} icon={Shield} sub="In pending payouts" accent="cyan" />
      </div>

      <PageCard title="Payout Queue" description="Pending creator payouts">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-zinc-500">Payee</TableHead>
              <TableHead className="text-right text-zinc-500">Amount</TableHead>
              <TableHead className="text-right text-zinc-500">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.payoutQueue ?? []).map((p) => (
              <TableRow key={p.id} className="border-white/5">
                <TableCell className="font-medium text-zinc-100">{p.payee}</TableCell>
                <TableCell className="text-right tabular-nums text-emerald-300">{(p.amount ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className={p.status === 'Pending' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'}>
                    {p.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PageCard title="Settlement" description="Reconciliation status">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-amber-300">Pending</div>
                <div className="mt-1 text-2xl font-bold text-zinc-100">{data?.settlement?.pending ?? 0}</div>
              </div>
              <Clock className="h-6 w-6 text-amber-300" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-emerald-300">Completed</div>
                <div className="mt-1 text-2xl font-bold text-zinc-100">{data?.settlement?.completed ?? 0}</div>
              </div>
              <CheckCircle className="h-6 w-6 text-emerald-300" />
            </div>
          </div>
        </PageCard>

        <PageCard title="Liquidity Pool" description="Available capital">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-emerald-300">Available</div>
                <div className="mt-1 text-2xl font-bold text-zinc-100">{data?.liquidity?.available.toLocaleString()}</div>
              </div>
              <Wallet className="h-6 w-6 text-emerald-300" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-cyan-300">Reserved</div>
                <div className="mt-1 text-2xl font-bold text-zinc-100">{data?.liquidity?.reserved.toLocaleString()}</div>
              </div>
              <Shield className="h-6 w-6 text-cyan-300" />
            </div>
          </div>
        </PageCard>
      </div>
    </div>
  );
}

// ─── OPERATIONS ──────────────────────────────────────────────────────────────

function OperationsHome({ data }: { data: OperationsData }) {
  if (!data) return null;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Users" value={(data?.realtime?.activeUsers ?? 0).toLocaleString()} icon={Users} sub="Right now" />
        <StatCard label="API Latency" value={`${data?.realtime?.apiLatency ?? 0}ms`} icon={Activity} sub="p50" accent="cyan" />
        <StatCard label="Error Rate" value={`${data?.realtime?.errorRate ?? 0}%`} icon={AlertTriangle} sub="Last hour" />
        <StatCard label="Uptime" value={data?.systemHealth?.uptime} icon={CheckCircle} sub="Last 30 days" accent="cyan" />
      </div>

      <Card className={`overflow-hidden border-${data?.systemHealth?.status === 'Healthy' ? 'emerald' : 'amber'}-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 backdrop-blur`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              System Health: {data?.systemHealth?.status}
            </div>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{data?.systemHealth?.incidents ?? 0} incidents</Badge>
          </div>
          <CardTitle className="text-2xl text-zinc-100">{data?.systemHealth?.uptime} uptime</CardTitle>
          <CardDescription className="text-zinc-400">All systems operational</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PageCard title="Queues" description="Background workers">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-zinc-500">Queue</TableHead>
                <TableHead className="text-right text-zinc-500">Depth</TableHead>
                <TableHead className="text-right text-zinc-500">Processing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.queues ?? []).map((q) => (
                <TableRow key={q.name} className="border-white/5">
                  <TableCell className="font-medium text-zinc-100">{q.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-300">{q.depth}</TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-300">{q.processing}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PageCard>

        <PageCard title="Recent Alerts" description="Operational notifications">
          <div className="space-y-2">
            {(data?.alerts ?? []).map((a) => (
              <div key={a.id} className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${severityClass(a.severity)}`}>
                  <Bell className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-zinc-100">{a.message}</div>
                  <div className="text-xs text-zinc-500">{a.timestamp}</div>
                </div>
              </div>
            ))}
          </div>
        </PageCard>
      </div>
    </div>
  );
}

// ─── ADMIN ──────────────────────────────────────────────────────────────────

function AdminHome({ data }: { data: AdminData }) {
  const tiles = [
    { label: 'Users', href: '/users', icon: Users, desc: 'Manage accounts' },
    { label: 'Waitlist', href: '/admin/waitlist', icon: Clock, desc: 'Review applications' },
    { label: 'Marketplace', href: '/marketplace', icon: Store, desc: 'Store & sales' },
    { label: 'Operations', href: '/operations', icon: Settings2, desc: 'System health' },
    { label: 'Finance', href: '/finance', icon: DollarSign, desc: 'Revenue & payouts' },
    { label: 'Audit', href: '/audit', icon: FileText, desc: 'Audit logs' },
    { label: 'Architecture', href: '/architecture', icon: LayoutDashboard, desc: 'System dashboard' },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pending Waitlist" value={data?.pendingWaitlist ?? 0} icon={Clock} sub="Awaiting review" />
        <StatCard label="Total Users" value={data?.totalUsers ?? 0} icon={Users} sub="Active accounts" accent="cyan" />
        <StatCard label="Total Revenue" value={data?.finance?.revenue?.total?.toLocaleString() ?? '0'} icon={DollarSign} sub="All time" />
        <StatCard label="System Health" value={data?.operations?.systemHealth?.status ?? data?.systemHealth ?? 'Healthy'} icon={Activity} sub={data?.operations?.systemHealth?.uptime ?? '99.97%'} accent="cyan" />
      </div>

      <div>
        <SectionHeader title="Management" icon={LayoutDashboard} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => {
            const Icon = t.icon;
            return (
              <Card key={t.label} className="group cursor-pointer border-white/5 bg-white/[0.02] transition hover:border-emerald-500/30 hover:bg-white/[0.04]">
                <Link href={t.href}>
                  <CardContent className="flex items-center gap-4 p-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/15 text-emerald-300 transition group-hover:from-emerald-500/25 group-hover:to-cyan-500/25">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-zinc-100">{t.label}</div>
                      <div className="text-xs text-zinc-500">{t.desc}</div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-zinc-600 transition group-hover:text-emerald-300" />
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── DEVELOPER ──────────────────────────────────────────────────────────────

function DeveloperHome({ data }: { data: DeveloperData }) {
  const apiEndpoints = [
    { method: 'GET', path: '/api/health', desc: 'Liveness probe' },
    { method: 'GET', path: '/api/ready', desc: 'Readiness probe' },
    { method: 'POST', path: '/api/commands', desc: 'Dispatch command' },
    { method: 'POST', path: '/api/queries', desc: 'Execute query' },
    { method: 'GET', path: '/api/architecture', desc: 'Architecture registry' },
    { method: 'POST', path: '/api/workers/outbox', desc: 'Publish outbox messages' },
    { method: 'POST', path: '/api/workers/projections', desc: 'Run projections' },
  ];

  return (
    <div className="space-y-8">
      <Card className={`overflow-hidden border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 backdrop-blur`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              System Health: {data?.systemHealth?.status || 'Healthy'}
            </div>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{data?.systemHealth?.incidents || 0} incidents</Badge>
          </div>
          <CardTitle className="text-2xl text-zinc-100">{data?.systemHealth?.uptime || '99.97%'} uptime</CardTitle>
          <CardDescription className="text-zinc-400">All systems operational</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="border-emerald-500/40 bg-white/5 text-white hover:border-emerald-500/60 hover:bg-white/10">
            <Link href="/architecture">
              <LayoutDashboard className="h-4 w-4" />
              Open Architecture Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PageCard title="Architecture" description="Platform overview">
          <div className="space-y-3">
            <Link href="/architecture" className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 transition hover:border-emerald-500/30 hover:bg-white/[0.04]">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-100">Architecture Dashboard</div>
                <div className="text-xs text-zinc-500">Health, CQRS flow, registry, pipelines</div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-zinc-600" />
            </Link>
            <Link href="/api-docs" className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 transition hover:border-emerald-500/30 hover:bg-white/[0.04]">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300">
                <Boxes className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-100">Developer Tools</div>
                <div className="text-xs text-zinc-500">API keys, webhooks, feature flags</div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-zinc-600" />
            </Link>
          </div>
        </PageCard>

        <PageCard title="API Endpoints" description="Quick reference">
          <div className="space-y-1.5">
            {apiEndpoints.map((e) => (
              <div key={e.path} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 font-mono text-xs">
                <Badge variant="outline" className={e.method === 'GET' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'}>
                  {e.method}
                </Badge>
                <span className="text-zinc-200">{e.path}</span>
                <span className="ml-auto hidden text-zinc-500 sm:inline">{e.desc}</span>
              </div>
            ))}
          </div>
        </PageCard>
      </div>
    </div>
  );
}
