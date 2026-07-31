'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sparkles, LogIn, UserPlus, Zap, Shield, Trophy, Palette, ArrowRight } from 'lucide-react';

export default function WelcomePage() {
  return (
    <div className="dark relative min-h-screen overflow-hidden bg-slate-950 text-zinc-100">
      {/* Animated background orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -top-40 -left-40 h-96 w-96 animate-pulse rounded-full bg-emerald-500/20 blur-3xl" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/3 -right-32 h-96 w-96 animate-pulse rounded-full bg-cyan-500/20 blur-3xl" style={{ animationDuration: '10s', animationDelay: '1s' }} />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 animate-pulse rounded-full bg-emerald-400/10 blur-3xl" style={{ animationDuration: '12s', animationDelay: '2s' }} />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(16,185,129,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(16,185,129,0.4) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />
      </div>

      {/* Top nav */}
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/30">
            <Sparkles className="h-5 w-5 text-slate-950" />
          </div>
          <span className="text-lg font-semibold tracking-tight">PlayLiquid</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="text-zinc-300 hover:bg-white/5 hover:text-white">
            <Link href="/signin">Sign In</Link>
          </Button>
          <Button asChild size="sm" className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
            <Link href="/signup">Join Waitlist</Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-6 pb-20 pt-12 sm:pt-20 lg:pt-28">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Now in early access
        </div>

        <h1 className="text-center text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          <span className="bg-gradient-to-r from-emerald-300 via-emerald-200 to-cyan-300 bg-clip-text text-transparent">PlayLiquid</span>
        </h1>

        <p className="mt-4 text-center text-xl font-medium text-zinc-200 sm:text-2xl">
          Play. <span className="text-emerald-400">Create.</span> Earn.
        </p>

        <p className="mt-5 max-w-2xl text-center text-base leading-relaxed text-zinc-400 sm:text-lg">
          The all-in-one platform where players discover games, creators build worlds, and everyone gets rewarded. Join a new generation of gaming — built on fairness, speed, and creative freedom.
        </p>

        {/* CTA buttons */}
        <div className="mt-10 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="w-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 sm:w-auto">
            <Link href="/signin">
              <LogIn className="h-4 w-4" />
              Sign In
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full border-emerald-500/40 bg-white/5 text-white backdrop-blur hover:border-emerald-500/60 hover:bg-white/10 sm:w-auto">
            <Link href="/signup">
              <UserPlus className="h-4 w-4" />
              Join Waitlist
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="w-full text-zinc-300 hover:bg-white/5 hover:text-white sm:w-auto">
            <Link href="/signin?demo=true">
              <Zap className="h-4 w-4" />
              Quick Demo Login
            </Link>
          </Button>
        </div>

        {/* Feature cards */}
        <div className="mt-24 grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Trophy className="h-5 w-5" />}
            title="Play & Compete"
            description="Discover thousands of games, climb leaderboards, and earn rewards for every win."
            color="emerald"
          />
          <FeatureCard
            icon={<Palette className="h-5 w-5" />}
            title="Create & Publish"
            description="Build games with our AI Studio, publish to the marketplace, and earn from day one."
            color="cyan"
          />
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Fair & Secure"
            description="Event-driven architecture with anti-cheat built in. Your progress and earnings are protected."
            color="emerald"
          />
        </div>

        {/* Stats strip */}
        <div className="mt-16 flex w-full flex-col items-center justify-center gap-8 rounded-2xl border border-white/5 bg-white/[0.02] px-8 py-8 backdrop-blur sm:flex-row sm:gap-16">
          <Stat value="12K+" label="Active Players" />
          <div className="h-8 w-px bg-white/10" />
          <Stat value="480+" label="Games Published" />
          <div className="h-8 w-px bg-white/10" />
          <Stat value="GHS 2.4M" label="Paid to Creators" />
          <div className="h-8 w-px bg-white/10" />
          <Stat value="99.97%" label="Uptime" />
        </div>

        {/* Bottom CTA */}
        <div className="mt-20 flex flex-col items-center gap-4 text-center">
          <p className="text-lg text-zinc-300">Ready to dive in?</p>
          <Button asChild size="lg" className="bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400">
            <Link href="/signin?demo=true">
              Try the Demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-auto border-t border-white/5 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-zinc-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-emerald-400 to-cyan-500">
              <Sparkles className="h-3.5 w-3.5 text-slate-950" />
            </div>
            <span className="text-zinc-400">PlayLiquid</span>
            <span className="text-zinc-600">·</span>
            <span>{new Date().getFullYear()}</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/signin" className="transition hover:text-zinc-300">Sign In</Link>
            <Link href="/signup" className="transition hover:text-zinc-300">Waitlist</Link>
            <Link href="/privacy" className="transition hover:text-zinc-300">Privacy</Link>
            <Link href="/terms" className="transition hover:text-zinc-300">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'emerald' | 'cyan';
}) {
  const accent = color === 'emerald' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur transition hover:border-white/10 hover:bg-white/[0.04]">
      <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border ${accent}`}>
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold text-zinc-100">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-400">{description}</p>
      <div className={`absolute -bottom-12 -right-12 h-32 w-32 rounded-full opacity-0 transition group-hover:opacity-100 ${color === 'emerald' ? 'bg-emerald-500/10' : 'bg-cyan-500/10'} blur-2xl`} />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-2xl font-bold text-transparent sm:text-3xl">{value}</span>
      <span className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{label}</span>
    </div>
  );
}
