'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSession, type Session } from '@/lib/auth/use-session';
import { useToast } from '@/hooks/use-toast';
import {
  Sparkles,
  Menu,
  LogOut,
  ChevronDown,
  Loader2,
  Home as HomeIcon,
  User as UserIcon,
  Gamepad2,
  Wallet as WalletIcon,
  Users,
  Gift,
  Crown,
  Palette,
  Rocket,
  BarChart3,
  Building2,
  Code2,
  Shield,
  Flag,
  AlertTriangle,
  CheckCircle,
  LifeBuoy,
  TicketCheck,
  Repeat,
  Settings2,
  Activity,
  Radio,
  Database,
  Bell,
  Server,
  Boxes,
  ShoppingCart,
  Store,
  Tags,
  Megaphone,
  FileText,
  Receipt,
  DollarSign,
  Wrench,
  LayoutDashboard,
  ChevronRight,
  Compass,
  Trophy,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: typeof HomeIcon;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  player: [
    { label: 'Discover', href: '/feed', icon: Compass },
    { label: 'Compete', href: '/compete', icon: Trophy },
    { label: 'Rewards', href: '/wallet', icon: WalletIcon },
    { label: 'Profile', href: '/profile', icon: UserIcon },
  ],
  creator: [
    { label: 'Discover', href: '/feed', icon: Compass },
    { label: 'Create', href: '/ai-studio', icon: Sparkles },
    { label: 'My Games', href: '/my-games', icon: Rocket },
    { label: 'Rewards', href: '/wallet', icon: WalletIcon },
    { label: 'Profile', href: '/profile', icon: UserIcon },
  ],
  studio: [
    { label: 'Discover', href: '/feed', icon: Compass },
    { label: 'Studios', href: '/studios', icon: Building2 },
    { label: 'Publishing', href: '/publishing', icon: Rocket },
    { label: 'Rewards', href: '/wallet', icon: WalletIcon },
    { label: 'Profile', href: '/profile', icon: UserIcon },
  ],
  marketplace: [
    { label: 'Discover', href: '/feed', icon: Compass },
    { label: 'Store', href: '/store', icon: Store },
    { label: 'Sales', href: '/sales', icon: Tags },
    { label: 'Rewards', href: '/wallet', icon: WalletIcon },
    { label: 'Profile', href: '/profile', icon: UserIcon },
  ],
  moderator: [
    { label: 'Discover', href: '/feed', icon: Compass },
    { label: 'Reports', href: '/reports', icon: Flag },
    { label: 'Approvals', href: '/approvals', icon: CheckCircle },
    { label: 'Profile', href: '/profile', icon: UserIcon },
  ],
  support: [
    { label: 'Discover', href: '/feed', icon: Compass },
    { label: 'Tickets', href: '/tickets', icon: TicketCheck },
    { label: 'Profile', href: '/profile', icon: UserIcon },
  ],
  finance: [
    { label: 'Discover', href: '/feed', icon: Compass },
    { label: 'Revenue', href: '/revenue', icon: DollarSign },
    { label: 'Payouts', href: '/payouts', icon: Receipt },
    { label: 'Profile', href: '/profile', icon: UserIcon },
  ],
  operations: [
    { label: 'Discover', href: '/feed', icon: Compass },
    { label: 'System Health', href: '/system-health', icon: Activity },
    { label: 'Queues', href: '/queues', icon: Database },
    { label: 'Profile', href: '/profile', icon: UserIcon },
  ],
  admin: [
    { label: 'Discover', href: '/feed', icon: Compass },
    { label: 'Users', href: '/users', icon: Users },
    { label: 'Operations', href: '/system-health', icon: Settings2 },
    { label: 'Audit', href: '/audit', icon: FileText },
    { label: 'Profile', href: '/profile', icon: UserIcon },
  ],
  developer: [
    { label: 'Discover', href: '/feed', icon: Compass },
    { label: 'Architecture', href: '/architecture', icon: LayoutDashboard },
    { label: 'System Health', href: '/system-health', icon: Activity },
    { label: 'Profile', href: '/profile', icon: UserIcon },
  ],
};

// Also expose Architecture nav for admins (the architecture dashboard is admin/developer only)
NAV_BY_ROLE.admin = [
  ...NAV_BY_ROLE.admin.slice(0, 6),
  { label: 'Architecture', href: '/architecture', icon: LayoutDashboard },
  ...NAV_BY_ROLE.admin.slice(6),
];

const ROLE_LABELS: Record<string, string> = {
  player: 'Player',
  creator: 'Creator',
  studio: 'Studio',
  marketplace: 'Marketplace',
  moderator: 'Moderator',
  support: 'Support',
  finance: 'Finance',
  operations: 'Operations',
  admin: 'Admin',
  developer: 'Developer',
};

function getPageTitle(pathname: string): string {
  if (!pathname || pathname === '/') return 'Welcome';
  const seg = pathname.split('/').filter(Boolean)[0] || 'home';
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
}

function initials(name: string): string {
  if (!name) return 'PL';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/');
    }
  }, [loading, session, router]);

  if (loading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-slate-950 text-zinc-100">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/30">
            <Sparkles className="h-6 w-6 text-slate-950" />
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
            Loading PlayLiquid…
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return <AppShell session={session}>{children}</AppShell>;
}

function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const navItems = useMemo<NavItem[]>(() => {
    return NAV_BY_ROLE[session.activeRole] || NAV_BY_ROLE.player;
  }, [session.activeRole]);

  async function handleSwitchRole(role: string) {
    if (role === session.activeRole) return;
    setSwitching(true);
    try {
      const res = await fetch('/api/auth/v2/switch-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ title: 'Role switch failed', description: data.error || 'Please try again', variant: 'destructive' });
        setSwitching(false);
        return;
      }
      toast({ title: `Switched to ${ROLE_LABELS[role] || role}`, description: 'Reloading your workspace…' });
      // Reload to refresh server-rendered content for the new role.
      window.location.assign('/home');
    } catch {
      toast({ title: 'Network error', description: 'Could not reach the server.', variant: 'destructive' });
      setSwitching(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/v2/logout', { method: 'POST' });
    } catch {
      // ignore — we'll redirect anyway
    }
    toast({ title: 'Signed out', description: 'See you soon!' });
    router.replace('/');
  }

  const pageTitle = getPageTitle(pathname);

  const SidebarContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/5 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/30">
          <Sparkles className="h-4 w-4 text-slate-950" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-zinc-100">PlayLiquid</span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{ROLE_LABELS[session.activeRole] || session.activeRole}</span>
        </div>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/home' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-300' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                <span className="flex-1 truncate">{item.label}</span>
                {active && <ChevronRight className="h-3.5 w-3.5 text-emerald-400" />}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User card at bottom */}
      <div className="shrink-0 border-t border-white/5 p-3">
        <Link
          href="/profile"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-white/[0.04]"
        >
          <Avatar className="h-8 w-8 border border-white/10">
            <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-cyan-500 text-xs font-semibold text-slate-950">
              {initials(session.displayName || session.username)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-100">{session.displayName || session.username}</div>
            <div className="truncate text-xs text-zinc-500">{session.email}</div>
          </div>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="dark flex min-h-screen flex-col bg-slate-950 text-zinc-100">
      {/* Demo banner */}
      {session.isDemo && (
        <div className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs text-amber-200">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
          <span className="font-medium">Demo Account — Changes are temporary.</span>
        </div>
      )}

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-white/5 bg-slate-950/60 backdrop-blur lg:block">
          {SidebarContent}
        </aside>

        {/* Mobile sidebar (Sheet) */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 border-white/5 bg-slate-950 p-0 text-zinc-100">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {SidebarContent}
          </SheetContent>
        </Sheet>

        {/* Main column */}
        <div className="flex flex-1 flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-white/5 bg-slate-950/70 px-4 backdrop-blur sm:px-6">
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:bg-white/5 hover:text-zinc-100 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <div className="flex min-w-0 flex-1 flex-col">
              <h1 className="truncate text-base font-semibold text-zinc-100 sm:text-lg">{pageTitle}</h1>
              <p className="hidden text-xs text-zinc-500 sm:block">{ROLE_LABELS[session.activeRole] || session.activeRole} workspace</p>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-2">
              {/* Role switcher (only if more than one role) */}
              {session.roles.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-white/10 bg-white/[0.03] text-zinc-200 hover:border-emerald-500/40 hover:bg-white/[0.06] hover:text-white"
                    >
                      {switching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-emerald-300" />}
                      <span className="hidden sm:inline">{ROLE_LABELS[session.activeRole] || session.activeRole}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 border-white/10 bg-slate-900 text-zinc-100">
                    <DropdownMenuLabel className="text-xs uppercase tracking-wider text-zinc-500">Switch role</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/10" />
                    {session.roles.map((role) => (
                      <DropdownMenuItem
                        key={role}
                        onSelect={(e) => {
                          e.preventDefault();
                          handleSwitchRole(role);
                        }}
                        className={`cursor-pointer focus:bg-emerald-500/10 focus:text-emerald-200 ${role === session.activeRole ? 'text-emerald-300' : ''}`}
                      >
                        <span className="flex-1">{ROLE_LABELS[role] || role}</span>
                        {role === session.activeRole && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* User avatar */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/5">
                    <Avatar className="h-8 w-8 border border-white/10">
                      <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-cyan-500 text-xs font-semibold text-slate-950">
                        {initials(session.displayName || session.username)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 border-white/10 bg-slate-900 text-zinc-100">
                  <div className="px-2 py-1.5">
                    <div className="text-sm font-medium text-zinc-100">{session.displayName || session.username}</div>
                    <div className="truncate text-xs text-zinc-500">{session.email}</div>
                  </div>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/[0.04]">
                    <Link href="/profile">
                      <UserIcon className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  {session.isDemo && (
                    <div className="px-2 py-1.5">
                      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">Demo Account</Badge>
                    </div>
                  )}
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); handleLogout(); }}
                    className="cursor-pointer text-rose-300 focus:bg-rose-500/10 focus:text-rose-200"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>

          {/* Footer */}
          <footer className="mt-auto shrink-0 border-t border-white/5 bg-slate-950/60 px-4 py-4 text-center text-xs text-zinc-600 sm:px-6">
            PlayLiquid · {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    </div>
  );
}
