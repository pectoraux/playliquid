'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, ArrowLeft, Sparkles, Mail, Clock } from 'lucide-react';

export default function WaitlistConfirmedPage() {
  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 text-zinc-100">
      {/* Background orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute bottom-0 -right-32 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Card className="overflow-hidden border-white/10 bg-white/[0.03] backdrop-blur-xl">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-400 to-cyan-500" />
          <CardContent className="px-8 py-12 text-center">
            {/* Animated checkmark */}
            <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" style={{ animationDuration: '2s' }} />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/40">
                <CheckCircle2 className="h-10 w-10 text-slate-950" />
              </div>
            </div>

            <h1 className="mb-2 text-2xl font-bold text-zinc-100">You're on the waitlist!</h1>
            <p className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-zinc-400">
              Thanks for joining PlayLiquid. We'll notify you by email when your account has been approved and you can start playing.
            </p>

            {/* Next steps */}
            <div className="mb-8 space-y-3 text-left">
              <Step
                icon={<Mail className="h-4 w-4" />}
                title="Verify your email"
                description="Check your inbox for a confirmation link from PlayLiquid."
              />
              <Step
                icon={<Clock className="h-4 w-4" />}
                title="Wait for approval"
                description="Our team reviews new applications within 1–2 business days."
              />
              <Step
                icon={<Sparkles className="h-4 w-4" />}
                title="Start playing"
                description="Once approved, sign in and jump right into the action."
              />
            </div>

            <Button asChild className="w-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400">
              <Link href="/signin">
                <ArrowLeft className="h-4 w-4" />
                Back to Sign In
              </Link>
            </Button>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Questions? Reach us at{' '}
          <a href="mailto:support@playliquid.com" className="text-zinc-500 transition hover:text-zinc-400">support@playliquid.com</a>
        </p>
      </div>
    </div>
  );
}

function Step({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-200">{title}</div>
        <div className="text-xs text-zinc-500">{description}</div>
      </div>
    </div>
  );
}
