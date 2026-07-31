'use client'

import * as React from 'react'
import { toast, Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  Bug,
  XCircle,
  Play,
  FileText,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidationRunRecord {
  id: string
  suite: string
  status: 'running' | 'passed' | 'failed' | 'partial'
  totalChecks: number
  passedChecks: number
  failedChecks: number
  durationMs: number
  triggeredBy: string
  startedAt: string
  completedAt: string | null
  report: Record<string, unknown>
}

interface ListValidationRunsResult {
  items: readonly ValidationRunRecord[]
  limit: number
}

interface ReconciliationRecord {
  id: string
  period: string
  status: 'balanced' | 'discrepancy' | 'error'
  expectedBalance: number
  actualBalance: number
  discrepancy: number
  totalTransactions: number
  matchedTransactions: number
  unmatchedTransactions: number
  completedAt: string
  details: Record<string, unknown>
}

interface ListReconciliationsResult {
  items: readonly ReconciliationRecord[]
  limit: number
}

interface LatestReconciliationResult {
  record: ReconciliationRecord | null
}

type BugStatus = 'open' | 'in_progress' | 'fixed' | 'wont_fix' | 'duplicate' | 'invalid'
type BugSeverity = 'low' | 'medium' | 'high' | 'critical'

interface BugRecord {
  id: string
  title: string
  description: string
  severity: BugSeverity
  category: string
  status: BugStatus
  reportedBy: string
  cohortId: string
  assignedTo: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  resolution: string | null
  createdAt: string
  updatedAt: string
}

interface BugListResult {
  items: readonly BugRecord[]
  total: number
  limit: number
  offset: number
}

interface BugStatsResult {
  cohortId: string | null
  total: number
  bySeverity: Readonly<Record<string, number>>
  byStatus: Readonly<Record<string, number>>
}

interface MetricSummary {
  value: number
  status: string
  threshold: number | null
}

interface PerformanceSummaryResult {
  metrics: Readonly<Record<string, MetricSummary>>
}

interface SessionReplayRecord {
  id: string
  sessionId: string
  userId: string
  cohortId: string
  durationSeconds: number
  eventCount: number
  recordedAt: string
  storageKey: string
  metadata: Record<string, unknown>
}

interface SessionReplayListResult {
  items: readonly SessionReplayRecord[]
  total: number
  limit: number
  offset: number
}

type LaunchPhase = 'alpha' | 'closed_beta' | 'open_beta'
type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'
type ParticipantRole = 'player' | 'creator'

interface BetaCohortView {
  cohortId: string
  name: string
  phase: LaunchPhase
  maxParticipants: number
  acceptedCount: number
  pendingCount: number
  revokedCount: number
  createdById: string
  active: boolean
  createdAt: string
  updatedAt: string
}

interface CohortListResult {
  items: readonly BetaCohortView[]
  total: number
  limit: number
  offset: number
}

interface ParticipantView {
  invitationId: string
  userId: string
  email: string
  role: ParticipantRole
  status: InvitationStatus
  invitedAt: string
  acceptedAt: string | null
  expiresAt: string
}

interface CohortParticipantsResult {
  cohortId: string
  participants: readonly ParticipantView[]
  total: number
}

type FeedbackCategory = 'bug' | 'feature_request' | 'experience' | 'performance' | 'other'
type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical'
type FeedbackStatus = 'new' | 'triaged' | 'in_progress' | 'resolved' | 'wont_fix'

interface FeedbackRecord {
  id: string
  cohortId: string
  userId: string
  category: FeedbackCategory
  severity: FeedbackSeverity
  title: string
  description: string
  status: FeedbackStatus
  assignedTo: string | null
  triagedBy: string | null
  triagedAt: string | null
  triageNotes: string | null
  createdAt: string
  updatedAt: string
}

interface FeedbackListResult {
  items: readonly FeedbackRecord[]
  total: number
  limit: number
  offset: number
}

interface FeedbackStatsResult {
  cohortId: string
  total: number
  byStatus: Readonly<Record<string, number>>
  bySeverity: Readonly<Record<string, number>>
}

interface BetaMetricsResult {
  cohorts: CohortListResult
  feedbackByStatus: Record<string, number>
  bugsByStatus: Record<string, number>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = 'admin'

const VALIDATION_SUITES: ReadonlyArray<{
  key: string
  name: string
  description: string
}> = [
  {
    key: 'event-replay',
    name: 'Event Replay',
    description: 'Replays the event store and verifies read-model parity.',
  },
  {
    key: 'ledger-integrity',
    name: 'Ledger Integrity',
    description: 'Validates wallet balances against the source-of-truth ledger.',
  },
  {
    key: 'ai-quality',
    name: 'AI Quality',
    description: 'Probes AI generation endpoints and content-moderation gates.',
  },
  {
    key: 'security',
    name: 'Security',
    description: 'Auth rejection, rate limiting, and security middleware checks.',
  },
  {
    key: 'extension-runtime',
    name: 'Extension Runtime',
    description: 'Validates projection engine and extension runtime status.',
  },
  {
    key: 'session-replay',
    name: 'Session Replay',
    description: 'Verifies session replay repository and storage provider wiring.',
  },
  {
    key: 'data-integrity',
    name: 'Data Integrity',
    description: 'Detects orphaned wallets, stuck outbox, and duplicate events.',
  },
]

const BUG_SEVERITY_OPTIONS: ReadonlyArray<BugSeverity> = ['low', 'medium', 'high', 'critical']
const BUG_CATEGORY_OPTIONS = [
  'ui',
  'api',
  'performance',
  'security',
  'data',
  'extension',
  'ai',
  'other',
] as const

const COHORT_PHASE_OPTIONS: ReadonlyArray<LaunchPhase> = ['alpha', 'closed_beta', 'open_beta']
const PARTICIPANT_ROLE_OPTIONS: ReadonlyArray<ParticipantRole> = ['player', 'creator']

const FEEDBACK_CATEGORY_OPTIONS: ReadonlyArray<FeedbackCategory> = [
  'bug',
  'feature_request',
  'experience',
  'performance',
  'other',
]
const FEEDBACK_SEVERITY_OPTIONS: ReadonlyArray<FeedbackSeverity> = ['low', 'medium', 'high', 'critical']
const FEEDBACK_STATUS_OPTIONS: ReadonlyArray<FeedbackStatus> = [
  'new',
  'triaged',
  'in_progress',
  'resolved',
  'wont_fix',
]

const BUG_RESOLUTION_OPTIONS = ['fixed', 'wont_fix', 'duplicate', 'invalid'] as const

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: T; error?: string }
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Request failed (${res.status})`)
  }
  return json.data as T
}

async function apiPost<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  })
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: T; error?: string; code?: string }
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Request failed (${res.status})`)
  }
  return json.data as T
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatRelativeTime(input: string | null | undefined): string {
  if (!input) return '—'
  const t = new Date(input).getTime()
  if (Number.isNaN(t)) return String(input)
  const diff = Date.now() - t
  const sec = Math.round(diff / 1000)
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec} seconds ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`
  const month = Math.round(day / 30)
  if (month < 12) return `${month} month${month === 1 ? '' : 's'} ago`
  const year = Math.round(month / 12)
  return `${year} year${year === 1 ? '' : 's'} ago`
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(2)}s`
  const min = Math.floor(sec / 60)
  const rem = Math.round(sec - min * 60)
  return `${min}m ${rem}s`
}

function formatBalance(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Status tone → badge className
type Tone = 'green' | 'amber' | 'red' | 'gray' | 'cyan'

function toneClass(tone: Tone): string {
  switch (tone) {
    case 'green':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    case 'amber':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
    case 'red':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
    case 'cyan':
      return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
    case 'gray':
    default:
      return 'border-slate-600 bg-slate-800/40 text-slate-300'
  }
}

function validationStatusTone(status: string): Tone {
  switch (status) {
    case 'passed':
      return 'green'
    case 'failed':
      return 'red'
    case 'partial':
      return 'amber'
    case 'running':
      return 'cyan'
    default:
      return 'gray'
  }
}

function reconciliationStatusTone(status: string): Tone {
  switch (status) {
    case 'balanced':
      return 'green'
    case 'discrepancy':
    case 'error':
      return 'red'
    default:
      return 'gray'
  }
}

function bugStatusTone(status: string): Tone {
  switch (status) {
    case 'open':
      return 'red'
    case 'in_progress':
      return 'amber'
    case 'fixed':
      return 'green'
    case 'wont_fix':
    case 'duplicate':
    case 'invalid':
      return 'gray'
    default:
      return 'gray'
  }
}

function bugSeverityTone(sev: string): Tone {
  switch (sev) {
    case 'critical':
      return 'red'
    case 'high':
      return 'amber'
    case 'medium':
      return 'cyan'
    case 'low':
      return 'gray'
    default:
      return 'gray'
  }
}

function feedbackStatusTone(status: string): Tone {
  switch (status) {
    case 'new':
      return 'cyan'
    case 'triaged':
      return 'amber'
    case 'in_progress':
      return 'amber'
    case 'resolved':
      return 'green'
    case 'wont_fix':
      return 'gray'
    default:
      return 'gray'
  }
}

function metricStatusTone(status: string): Tone {
  switch (status) {
    case 'ok':
      return 'green'
    case 'warning':
      return 'amber'
    case 'critical':
      return 'red'
    default:
      return 'gray'
  }
}

function invitationStatusTone(status: string): Tone {
  switch (status) {
    case 'accepted':
      return 'green'
    case 'pending':
      return 'amber'
    case 'expired':
    case 'revoked':
      return 'red'
    default:
      return 'gray'
  }
}

function phaseTone(phase: string): Tone {
  switch (phase) {
    case 'alpha':
      return 'cyan'
    case 'closed_beta':
      return 'amber'
    case 'open_beta':
      return 'green'
    default:
      return 'gray'
  }
}

function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wide ${toneClass(tone)}`}
    >
      {label}
    </Badge>
  )
}

function MonoCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-xs text-slate-300 ${className ?? ''}`}>{children}</span>
  )
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function LoadingRow({ cols = 5 }: { cols?: number }) {
  return (
    <TableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full max-w-[160px]" />
        </TableCell>
      ))}
    </TableRow>
  )
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
        <span className="font-mono text-xs text-rose-200">{message}</span>
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 hover:text-rose-100"
        >
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Retry
        </Button>
      )}
    </div>
  )
}

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>
  message: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-800 py-12 text-center">
      <Icon className="h-5 w-5 text-slate-600" />
      <p className="font-mono text-xs text-slate-500">{message}</p>
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  endpoint,
  action,
  accent = 'emerald',
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  endpoint?: string
  action?: React.ReactNode
  accent?: 'emerald' | 'cyan'
}) {
  const accentRing =
    accent === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/10 ring-emerald-500/20'
      : 'border-cyan-500/30 bg-cyan-500/10 ring-cyan-500/20'
  const accentText = accent === 'emerald' ? 'text-emerald-400' : 'text-cyan-400'
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ring-1 ring-inset ${accentRing}`}
        >
          <Icon className={`h-4 w-4 ${accentText}`} />
        </div>
        <div className="space-y-1">
          <h2 className="font-mono text-base font-semibold text-zinc-100">{title}</h2>
          <p className="text-xs text-slate-400">{description}</p>
          {endpoint && <p className="font-mono text-[10px] text-slate-600">{endpoint}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function SpinnerButton({
  loading,
  children,
  onClick,
  variant = 'default',
  size,
  className,
  disabled,
  icon: Icon,
}: {
  loading: boolean
  children: React.ReactNode
  onClick?: () => void
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
  disabled?: boolean
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
    >
      {loading ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        Icon && <Icon className="mr-1.5 h-3.5 w-3.5" />
      )}
      {children}
    </Button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LaunchDashboardPage() {
  return (
    <div className="dark flex min-h-screen flex-col bg-slate-950 text-zinc-100">
      <Toaster theme="dark" position="top-right" richColors closeButton />
      <BackgroundGrid />
      <div className="relative flex flex-1 flex-col">
        <LaunchHeader />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <Tabs defaultValue="alpha" className="w-full">
            <ScrollArea className="w-full whitespace-nowrap">
              <TabsList className="mb-6 inline-flex h-auto w-max gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
                <TabsTrigger
                  value="alpha"
                  className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300"
                >
                  <FlaskConical className="h-3.5 w-3.5" /> Phase A — Internal Alpha
                </TabsTrigger>
                <TabsTrigger
                  value="beta"
                  className="gap-1.5 data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-300"
                >
                  <Users className="h-3.5 w-3.5" /> Phase B — Closed Beta
                </TabsTrigger>
              </TabsList>
            </ScrollArea>

            <TabsContent value="alpha" className="mt-0 space-y-12 focus-visible:outline-none">
              <ValidationSuiteSection />
              <ReconciliationSection />
              <BugTriageSection />
              <PerformanceMetricsSection />
              <SessionReplaysSection />
              <ExitCriteriaSection />
            </TabsContent>

            <TabsContent value="beta" className="mt-0 space-y-12 focus-visible:outline-none">
              <BetaCohortsSection />
              <InvitationsSection />
              <FeedbackPipelineSection />
              <BetaMetricsSection />
            </TabsContent>
          </Tabs>
        </main>
        <LaunchFooter />
      </div>
    </div>
  )
}

// ─── Background ───────────────────────────────────────────────────────────────

function BackgroundGrid() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 h-full w-full bg-[linear-gradient(to_right,rgba(16,185,129,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(16,185,129,0.04)_1px,transparent_1px)] bg-[size:48px_48px]"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/0 via-slate-950/40 to-slate-950" />
      <div className="absolute -top-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute top-1/3 -right-40 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
    </div>
  )
}

// ─── Header / Footer ──────────────────────────────────────────────────────────

function LaunchHeader() {
  return (
    <header className="relative border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono uppercase tracking-[0.25em] text-emerald-400/80">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            playliquid
          </span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">milestone 5</span>
          <span className="text-slate-600">/</span>
          <span className="text-emerald-400">launch &amp; scale</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="font-mono text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
              Launch &amp; <span className="text-emerald-400">Scale</span>
            </h1>
            <p className="max-w-2xl text-sm text-slate-400">
              Operational program for the PlayLiquid rollout — internal alpha
              validation, financial reconciliation, bug triage, and the closed-beta
              feedback pipeline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-300"
            >
              <FlaskConical className="h-3.5 w-3.5" /> Phase A · Internal Alpha
            </Badge>
            <Badge
              variant="outline"
              className="gap-1.5 border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-cyan-300"
            >
              <Users className="h-3.5 w-3.5" /> Phase B · Closed Beta
            </Badge>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 font-mono text-[11px] text-slate-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              <Activity className="h-3 w-3" /> Architecture Dashboard
            </a>
            <a
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 font-mono text-[11px] text-slate-300 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-300"
            >
              <ShieldCheck className="h-3 w-3" /> Admin Console
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}

function LaunchFooter() {
  return (
    <footer className="mt-auto border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
          <span>Launch &amp; Scale Program</span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-500">Phase A → Phase B rollout</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 font-mono text-[10px] text-slate-400">
            /api/launch/alpha/*
          </span>
          <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 font-mono text-[10px] text-slate-400">
            /api/launch/beta/*
          </span>
          <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 font-mono text-[10px] text-slate-400">
            CQRS + Event-Sourced
          </span>
        </div>
      </div>
    </footer>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Phase A — Section 1: Validation Suite Runner ────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ValidationSuiteSection() {
  const [runs, setRuns] = React.useState<readonly ValidationRunRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [runningSuite, setRunningSuite] = React.useState<string | null>(null)
  const [lastResult, setLastResult] = React.useState<Record<string, ValidationRunRecord>>({})

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const data = await apiGet<ListValidationRunsResult>('/api/launch/alpha/validation?limit=20')
      setRuns(data.items)
      const bySuite: Record<string, ValidationRunRecord> = {}
      for (const r of data.items) {
        if (!bySuite[r.suite]) bySuite[r.suite] = r
      }
      setLastResult(bySuite)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load validation runs')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      void load()
    }, 10000)
    return () => window.clearInterval(id)
  }, [load])

  const runSuite = React.useCallback(
    async (suiteKey: string) => {
      setRunningSuite(suiteKey)
      const tid = toast.loading(`Starting ${suiteKey} validation suite…`)
      try {
        const result = await apiPost<ValidationRunRecord>(
          '/api/launch/alpha/validation/start',
          { suite: suiteKey, triggeredBy: ADMIN_USER_ID },
        )
        toast.success(`${suiteKey} suite completed`, {
          id: tid,
          description: `${result.passedChecks}/${result.totalChecks} checks passed · ${formatDuration(result.durationMs)}`,
        })
        setLastResult((prev) => ({ ...prev, [suiteKey]: result }))
        await load()
      } catch (e) {
        toast.error(`${suiteKey} suite failed`, {
          id: tid,
          description: e instanceof Error ? e.message : 'Unknown error',
        })
      } finally {
        setRunningSuite(null)
      }
    },
    [load],
  )

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={FlaskConical}
        title="Validation Suite Runner"
        description="Seven production validation suites. Each suite runs real checks against the event store, ledger, AI, and infrastructure — and persists the result for audit."
        endpoint="GET /api/launch/alpha/validation · POST /api/launch/alpha/validation/start · auto-refresh 10s"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300"
          >
            <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {VALIDATION_SUITES.map((suite) => {
          const latest = lastResult[suite.key]
          const isRunning = runningSuite === suite.key
          const tone = latest ? validationStatusTone(latest.status) : 'gray'
          const Icon = suiteIcon(suite.key)
          return (
            <Card
              key={suite.key}
              className="flex flex-col border-slate-800 bg-slate-900/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60"
            >
              <CardHeader className="gap-1.5 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
                    <Icon className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  {latest ? (
                    <StatusBadge tone={tone} label={latest.status} />
                  ) : (
                    <StatusBadge tone="gray" label="never" />
                  )}
                </div>
                <CardTitle className="font-mono text-sm text-zinc-100">{suite.name}</CardTitle>
                <CardDescription className="text-[11px] leading-snug text-slate-400">
                  {suite.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                <div className="space-y-1.5 font-mono text-[10px] text-slate-500">
                  {latest ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="uppercase tracking-widest">Last run</span>
                        <span className="text-slate-300">
                          {formatRelativeTime(latest.completedAt || latest.startedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="uppercase tracking-widest">Checks</span>
                        <span className="text-slate-300">
                          <span className="text-emerald-300">{latest.passedChecks}</span>
                          {' / '}
                          <span className="text-rose-300">{latest.failedChecks}</span>
                          {' / '}
                          <span className="text-slate-400">{latest.totalChecks}</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="uppercase tracking-widest">Duration</span>
                        <span className="text-slate-300">{formatDuration(latest.durationMs)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="italic text-slate-600">No runs recorded yet.</div>
                  )}
                </div>
                <SpinnerButton
                  loading={isRunning}
                  onClick={() => void runSuite(suite.key)}
                  size="sm"
                  variant="outline"
                  icon={Play}
                  className="mt-auto w-full justify-center border-slate-700 bg-slate-950/60 font-mono text-xs text-emerald-300 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-200"
                >
                  {isRunning ? 'Running…' : 'Run Suite'}
                </SpinnerButton>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardHeader className="gap-1 pb-3">
          <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
            <Activity className="h-3.5 w-3.5 text-cyan-400" /> Recent Validation Runs
          </CardTitle>
          <CardDescription className="text-xs">
            Append-only audit trail. Auto-refreshes every 10 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[360px]">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Suite
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Status
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Checks
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Duration
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Triggered By
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Started
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Run ID
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRow cols={7} />
                ) : runs.length === 0 ? (
                  <TableRow className="border-slate-800/60 hover:bg-transparent">
                    <TableCell colSpan={7}>
                      <EmptyState icon={FlaskConical} message="No validation runs recorded yet." />
                    </TableCell>
                  </TableRow>
                ) : (
                  runs.map((run) => (
                    <TableRow key={run.id} className="border-slate-800/60 hover:bg-slate-800/20">
                      <TableCell>
                        <MonoCell className="text-emerald-300">{run.suite}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={validationStatusTone(run.status)} label={run.status} />
                      </TableCell>
                      <TableCell>
                        <MonoCell>
                          <span className="text-emerald-300">{run.passedChecks}</span>
                          {' / '}
                          <span className="text-rose-300">{run.failedChecks}</span>
                          {' / '}
                          <span className="text-slate-400">{run.totalChecks}</span>
                        </MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell>{formatDuration(run.durationMs)}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">{run.triggeredBy}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">
                          {formatRelativeTime(run.startedAt)}
                        </MonoCell>
                      </TableCell>
                      <TableCell>
                        <code className="block max-w-[180px] truncate font-mono text-[10px] text-slate-500">
                          {run.id}
                        </code>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </section>
  )
}

function suiteIcon(key: string): React.ComponentType<{ className?: string }> {
  switch (key) {
    case 'event-replay':
      return RefreshCw
    case 'ledger-integrity':
      return ShieldCheck
    case 'ai-quality':
      return FlaskConical
    case 'security':
      return ShieldCheck
    case 'extension-runtime':
      return Activity
    case 'session-replay':
      return Play
    case 'data-integrity':
      return CheckCircle
    default:
      return FlaskConical
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Phase A — Section 2: Ledger Reconciliation ──────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ReconciliationSection() {
  const [records, setRecords] = React.useState<readonly ReconciliationRecord[]>([])
  const [latest, setLatest] = React.useState<ReconciliationRecord | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [running, setRunning] = React.useState(false)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const [list, latestResp] = await Promise.all([
        apiGet<ListReconciliationsResult>('/api/launch/alpha/reconciliation?limit=20'),
        apiGet<LatestReconciliationResult>('/api/launch/alpha/reconciliation/latest'),
      ])
      setRecords(list.items)
      setLatest(latestResp.record)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reconciliation data')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const runReconciliation = React.useCallback(async () => {
    setRunning(true)
    const tid = toast.loading('Running Q1 2024 ledger reconciliation…')
    try {
      const result = await apiPost<ReconciliationRecord>(
        '/api/launch/alpha/reconciliation/run',
        { period: '2024-Q1' },
      )
      toast.success('Reconciliation complete', {
        id: tid,
        description: `Status: ${result.status} · discrepancy ${formatBalance(result.discrepancy)}`,
      })
      setLatest(result)
      await load()
    } catch (e) {
      toast.error('Reconciliation failed', {
        id: tid,
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setRunning(false)
    }
  }, [load])

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={ShieldCheck}
        accent="cyan"
        title="Ledger Reconciliation"
        description="Verifies wallet balances against the source-of-truth ledger for a given accounting period."
        endpoint="GET /api/launch/alpha/reconciliation · POST /api/launch/alpha/reconciliation/run · GET /api/launch/alpha/reconciliation/latest"
        action={
          <SpinnerButton
            loading={running}
            onClick={() => void runReconciliation()}
            size="sm"
            icon={RefreshCw}
            className="border-cyan-500/40 bg-cyan-500/10 font-mono text-xs text-cyan-200 hover:bg-cyan-500/20 hover:text-cyan-100"
          >
            Run Reconciliation
          </SpinnerButton>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {/* Latest summary */}
      <Card className="border-slate-800 bg-slate-900/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60">
        <CardHeader className="gap-1.5 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Latest Reconciliation Summary
            </CardTitle>
            {latest && (
              <StatusBadge
                tone={reconciliationStatusTone(latest.status)}
                label={latest.status}
              />
            )}
          </div>
          <CardDescription className="text-xs">
            {latest
              ? `Period ${latest.period} · completed ${formatRelativeTime(latest.completedAt)}`
              : 'No reconciliation runs yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : latest ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile
                label="Expected Balance"
                value={`$${formatBalance(latest.expectedBalance)}`}
                tone="cyan"
              />
              <MetricTile
                label="Actual Balance"
                value={`$${formatBalance(latest.actualBalance)}`}
                tone="cyan"
              />
              <MetricTile
                label="Discrepancy"
                value={`$${formatBalance(latest.discrepancy)}`}
                tone={latest.discrepancy === 0 ? 'green' : 'red'}
              />
              <MetricTile
                label="Matched / Total"
                value={`${latest.matchedTransactions} / ${latest.totalTransactions}`}
                tone={latest.unmatchedTransactions === 0 ? 'green' : 'amber'}
              />
              <div className="sm:col-span-2 lg:col-span-4">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Reconciliation ID
                </p>
                <code className="block break-all rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[11px] text-cyan-300">
                  {latest.id}
                </code>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Details
                </p>
                <pre className="overflow-x-auto rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-2 font-mono text-[10px] text-slate-300">
                  {JSON.stringify(latest.details, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              message="No reconciliation runs recorded yet. Click 'Run Reconciliation' to begin."
            />
          )}
        </CardContent>
      </Card>

      {/* Recent runs table */}
      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardHeader className="gap-1 pb-3">
          <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
            <Activity className="h-3.5 w-3.5 text-cyan-400" /> Recent Reconciliation Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[320px]">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Period
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Status
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Expected
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Actual
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Discrepancy
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Matched
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Completed
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRow cols={7} />
                ) : records.length === 0 ? (
                  <TableRow className="border-slate-800/60 hover:bg-transparent">
                    <TableCell colSpan={7}>
                      <EmptyState
                        icon={ShieldCheck}
                        message="No reconciliation runs recorded yet."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((r) => (
                    <TableRow key={r.id} className="border-slate-800/60 hover:bg-slate-800/20">
                      <TableCell>
                        <MonoCell className="text-emerald-300">{r.period}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={reconciliationStatusTone(r.status)}
                          label={r.status}
                        />
                      </TableCell>
                      <TableCell>
                        <MonoCell>${formatBalance(r.expectedBalance)}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell>${formatBalance(r.actualBalance)}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell
                          className={r.discrepancy === 0 ? 'text-emerald-300' : 'text-rose-300'}
                        >
                          ${formatBalance(r.discrepancy)}
                        </MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell>
                          {r.matchedTransactions} / {r.totalTransactions}
                        </MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">
                          {formatRelativeTime(r.completedAt)}
                        </MonoCell>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </section>
  )
}

function MetricTile({
  label,
  value,
  tone = 'gray',
}: {
  label: string
  value: string
  tone?: Tone
}) {
  const text =
    tone === 'green'
      ? 'text-emerald-300'
      : tone === 'red'
      ? 'text-rose-300'
      : tone === 'amber'
      ? 'text-amber-300'
      : tone === 'cyan'
      ? 'text-cyan-300'
      : 'text-slate-200'
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold ${text}`}>{value}</p>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Phase A — Section 3: Bug Triage ─────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BugTriageSection() {
  const [bugs, setBugs] = React.useState<readonly BugRecord[]>([])
  const [stats, setStats] = React.useState<BugStatsResult | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reportOpen, setReportOpen] = React.useState(false)
  const [resolveTarget, setResolveTarget] = React.useState<BugRecord | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const [list, s] = await Promise.all([
        apiGet<BugListResult>('/api/launch/alpha/bugs?limit=20'),
        apiGet<BugStatsResult>('/api/launch/alpha/bugs/stats'),
      ])
      setBugs(list.items)
      setStats(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bug data')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={Bug}
        title="Bug Triage"
        description="Track and resolve bugs discovered during internal alpha. Reports are append-only; resolutions are immutable."
        endpoint="GET /api/launch/alpha/bugs · GET /api/launch/alpha/bugs/stats · POST /api/launch/alpha/bugs · POST /api/launch/alpha/bugs/resolve"
        action={
          <Button
            size="sm"
            onClick={() => setReportOpen(true)}
            className="border-emerald-500/40 bg-emerald-500/10 font-mono text-xs text-emerald-200 hover:bg-emerald-500/20 hover:text-emerald-100"
          >
            <Plus className="mr-1.5 h-3 w-3" /> Report Bug
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open" value={stats?.byStatus.open ?? 0} tone="red" icon={Bug} />
        <StatCard
          label="In Progress"
          value={stats?.byStatus.in_progress ?? 0}
          tone="amber"
          icon={Activity}
        />
        <StatCard
          label="Fixed"
          value={stats?.byStatus.fixed ?? 0}
          tone="green"
          icon={CheckCircle}
        />
        <StatCard
          label="Won't Fix"
          value={
            (stats?.byStatus.wont_fix ?? 0) +
            (stats?.byStatus.duplicate ?? 0) +
            (stats?.byStatus.invalid ?? 0)
          }
          tone="gray"
          icon={XCircle}
        />
      </div>

      {/* Bug table */}
      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardHeader className="gap-1 pb-3">
          <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
            <Bug className="h-3.5 w-3.5 text-emerald-400" /> Bug Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Title
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Severity
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Category
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Status
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Reported By
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Created
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRow cols={7} />
                ) : bugs.length === 0 ? (
                  <TableRow className="border-slate-800/60 hover:bg-transparent">
                    <TableCell colSpan={7}>
                      <EmptyState icon={CheckCircle} message="No bugs reported. Ship it." />
                    </TableCell>
                  </TableRow>
                ) : (
                  bugs.map((bug) => (
                    <TableRow key={bug.id} className="border-slate-800/60 hover:bg-slate-800/20">
                      <TableCell className="max-w-[280px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="truncate text-xs text-zinc-100">{bug.title}</span>
                          <code className="font-mono text-[10px] text-slate-600">{bug.id}</code>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={bugSeverityTone(bug.severity)} label={bug.severity} />
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">{bug.category}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={bugStatusTone(bug.status)} label={bug.status} />
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">{bug.reportedBy}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">
                          {formatRelativeTime(bug.createdAt)}
                        </MonoCell>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            bug.status === 'fixed' ||
                            bug.status === 'wont_fix' ||
                            bug.status === 'duplicate' ||
                            bug.status === 'invalid'
                          }
                          onClick={() => setResolveTarget(bug)}
                          className="h-7 border-slate-700 bg-slate-950/60 font-mono text-[10px] text-emerald-300 hover:border-emerald-500/40 hover:bg-emerald-500/10"
                        >
                          Resolve
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <ReportBugDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        onSubmitted={() => void load()}
      />
      <ResolveBugDialog
        bug={resolveTarget}
        onOpenChange={(o) => !o && setResolveTarget(null)}
        onResolved={() => void load()}
      />
    </section>
  )
}

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: number
  tone: Tone
  icon: React.ComponentType<{ className?: string }>
}) {
  const text =
    tone === 'green'
      ? 'text-emerald-300'
      : tone === 'red'
      ? 'text-rose-300'
      : tone === 'amber'
      ? 'text-amber-300'
      : tone === 'cyan'
      ? 'text-cyan-300'
      : 'text-slate-200'
  return (
    <Card className="border-slate-800 bg-slate-900/40 py-4 ring-1 ring-inset ring-slate-800/60">
      <CardContent className="px-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
          <Icon className="h-3.5 w-3.5 text-slate-600" />
        </div>
        <p className={`mt-1 font-mono text-2xl font-bold ${text}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function ReportBugDialog({
  open,
  onOpenChange,
  onSubmitted,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSubmitted: () => void
}) {
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [severity, setSeverity] = React.useState<BugSeverity>('medium')
  const [category, setCategory] = React.useState<string>('ui')
  const [reportedBy, setReportedBy] = React.useState(ADMIN_USER_ID)
  const [cohortId, setCohortId] = React.useState('alpha-internal')
  const [submitting, setSubmitting] = React.useState(false)

  const reset = () => {
    setTitle('')
    setDescription('')
    setSeverity('medium')
    setCategory('ui')
    setReportedBy(ADMIN_USER_ID)
    setCohortId('alpha-internal')
  }

  const submit = async () => {
    if (!title.trim() || !description.trim() || !reportedBy.trim() || !cohortId.trim()) {
      toast.error('Please fill in all fields')
      return
    }
    setSubmitting(true)
    const tid = toast.loading('Reporting bug…')
    try {
      await apiPost('/api/launch/alpha/bugs', {
        title: title.trim(),
        description: description.trim(),
        severity,
        category,
        reportedBy: reportedBy.trim(),
        cohortId: cohortId.trim(),
      })
      toast.success('Bug reported', { id: tid, description: title.trim() })
      reset()
      onOpenChange(false)
      onSubmitted()
    } catch (e) {
      toast.error('Failed to report bug', {
        id: tid,
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Bug className="h-4 w-4 text-emerald-400" /> Report Bug
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            File a new bug against the internal alpha build.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
              Title
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short bug summary"
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
              Description
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Reproduction steps, expected vs actual…"
              className="min-h-[100px] resize-none border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Severity
              </Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as BugSeverity)}>
                <SelectTrigger className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus:ring-emerald-500/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                  {BUG_SEVERITY_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Category
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus:ring-emerald-500/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                  {BUG_CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c} className="font-mono text-xs">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Reported By
              </Label>
              <Input
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus-visible:ring-emerald-500/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Cohort ID
              </Label>
              <Input
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus-visible:ring-emerald-500/30"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <SpinnerButton
            loading={submitting}
            onClick={() => void submit()}
            icon={Send}
            className="border-emerald-500/40 bg-emerald-500/10 font-mono text-xs text-emerald-200 hover:bg-emerald-500/20"
          >
            Submit Report
          </SpinnerButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResolveBugDialog({
  bug,
  onOpenChange,
  onResolved,
}: {
  bug: BugRecord | null
  onOpenChange: (o: boolean) => void
  onResolved: () => void
}) {
  const [resolution, setResolution] = React.useState<(typeof BUG_RESOLUTION_OPTIONS)[number]>('fixed')
  const [resolvedBy, setResolvedBy] = React.useState(ADMIN_USER_ID)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (bug) {
      setResolution('fixed')
      setResolvedBy(ADMIN_USER_ID)
    }
  }, [bug])

  const submit = async () => {
    if (!bug) return
    if (!resolvedBy.trim()) {
      toast.error('Please specify who is resolving the bug')
      return
    }
    setSubmitting(true)
    const tid = toast.loading(`Resolving bug ${bug.id}…`)
    try {
      await apiPost('/api/launch/alpha/bugs/resolve', {
        bugId: bug.id,
        resolution,
        resolvedBy: resolvedBy.trim(),
      })
      toast.success('Bug resolved', { id: tid, description: `${bug.title} → ${resolution}` })
      onOpenChange(false)
      onResolved()
    } catch (e) {
      toast.error('Failed to resolve bug', {
        id: tid,
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!bug} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <CheckCircle className="h-4 w-4 text-emerald-400" /> Resolve Bug
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {bug ? bug.title : ''}
          </DialogDescription>
        </DialogHeader>

        {bug && (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                Bug ID
              </p>
              <code className="block break-all font-mono text-[11px] text-cyan-300">{bug.id}</code>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                  Resolution
                </Label>
                <Select
                  value={resolution}
                  onValueChange={(v) =>
                    setResolution(v as (typeof BUG_RESOLUTION_OPTIONS)[number])
                  }
                >
                  <SelectTrigger className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus:ring-emerald-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                    {BUG_RESOLUTION_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r} className="font-mono text-xs">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                  Resolved By
                </Label>
                <Input
                  value={resolvedBy}
                  onChange={(e) => setResolvedBy(e.target.value)}
                  className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus-visible:ring-emerald-500/30"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <SpinnerButton
            loading={submitting}
            onClick={() => void submit()}
            icon={CheckCircle}
            className="border-emerald-500/40 bg-emerald-500/10 font-mono text-xs text-emerald-200 hover:bg-emerald-500/20"
          >
            Confirm Resolution
          </SpinnerButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Phase A — Section 4: Performance Metrics ────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PerformanceMetricsSection() {
  const [summary, setSummary] = React.useState<PerformanceSummaryResult | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const data = await apiGet<PerformanceSummaryResult>('/api/launch/alpha/performance')
      setSummary(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load performance metrics')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const entries = summary ? Object.entries(summary.metrics) : []

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={TrendingUp}
        accent="cyan"
        title="Performance Metrics"
        description="Latest values for key platform metrics. Status reflects thresholds defined per metric."
        endpoint="GET /api/launch/alpha/performance"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {!loading && entries.length === 0 && !error ? (
        <EmptyState icon={Activity} message="No metrics recorded yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
            : entries.map(([metric, m]) => {
                const tone = metricStatusTone(m.status)
                return (
                  <Card
                    key={metric}
                    className="border-slate-800 bg-slate-900/50 ring-1 ring-inset ring-slate-800/60"
                  >
                    <CardHeader className="gap-1.5 pb-2">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                          {metric}
                        </p>
                        <StatusBadge tone={tone} label={m.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="font-mono text-2xl font-bold text-zinc-100">
                        {formatMetricValue(m.value, metric)}
                      </p>
                      {m.threshold != null && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
                            <span>Threshold</span>
                            <span className="text-slate-400">
                              {formatMetricValue(m.threshold, metric)}
                            </span>
                          </div>
                          <ProgressBar
                            value={Math.min(
                              100,
                              Math.max(0, (m.value / Math.max(m.threshold, 1)) * 100),
                            )}
                            className="h-1.5 bg-slate-800"
                            tone={tone}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
        </div>
      )}
    </section>
  )
}

function formatMetricValue(value: number, metric: string): string {
  const lower = metric.toLowerCase()
  if (lower.includes('latency') || lower.includes('duration')) {
    return value < 1000 ? `${value.toFixed(0)}ms` : `${(value / 1000).toFixed(2)}s`
  }
  if (lower.includes('rate') || lower.includes('percentage') || lower.includes('cpu')) {
    return `${value.toFixed(2)}%`
  }
  if (lower.includes('memory') || lower.includes('bytes')) {
    if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`
    if (value > 1024) return `${(value / 1024).toFixed(2)}KB`
    return `${value.toFixed(0)}B`
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * Maps a tone to a Tailwind arbitrary-variant class that targets the inner
 * `data-slot=progress-indicator` element of the shadcn/ui Progress component.
 * The strings are written as full literals so Tailwind's JIT compiler can
 * detect them at build time and generate the corresponding CSS.
 */
function progressToneVariantClass(tone: Tone): string {
  switch (tone) {
    case 'green':
      return '[&>[data-slot=progress-indicator]]:bg-emerald-500'
    case 'amber':
      return '[&>[data-slot=progress-indicator]]:bg-amber-500'
    case 'red':
      return '[&>[data-slot=progress-indicator]]:bg-rose-500'
    case 'cyan':
      return '[&>[data-slot=progress-indicator]]:bg-cyan-500'
    default:
      return '[&>[data-slot=progress-indicator]]:bg-slate-500'
  }
}

/**
 * Local progress bar with a colored indicator. Wraps the shadcn/ui Progress
 * component and applies a tone-specific color via a Tailwind arbitrary variant
 * targeting the inner indicator element.
 */
function ProgressBar({
  value,
  className,
  tone = 'green',
}: {
  value: number
  className?: string
  tone?: Tone
}) {
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <Progress
      value={v}
      className={`${className ?? ''} ${progressToneVariantClass(tone)}`}
    />
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Phase A — Section 5: Session Replays ────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SessionReplaysSection() {
  const [replays, setReplays] = React.useState<readonly SessionReplayRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const data = await apiGet<SessionReplayListResult>(
        '/api/launch/alpha/session-replays?limit=20',
      )
      setReplays(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load session replays')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={Play}
        title="Session Replays"
        description="Recorded player sessions captured during the internal alpha. Storage keys point to immutable replay blobs."
        endpoint="GET /api/launch/alpha/session-replays"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300"
          >
            <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardContent className="pt-4">
          <ScrollArea className="max-h-[360px]">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Session ID
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    User ID
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Cohort
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Duration
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Events
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Recorded
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Storage Key
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRow cols={7} />
                ) : replays.length === 0 ? (
                  <TableRow className="border-slate-800/60 hover:bg-transparent">
                    <TableCell colSpan={7}>
                      <EmptyState icon={Play} message="No session replays recorded yet." />
                    </TableCell>
                  </TableRow>
                ) : (
                  replays.map((r) => (
                    <TableRow key={r.id} className="border-slate-800/60 hover:bg-slate-800/20">
                      <TableCell>
                        <MonoCell className="text-emerald-300">{r.sessionId}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">{r.userId}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">{r.cohortId}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell>{formatDuration(r.durationSeconds * 1000)}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-cyan-300">{r.eventCount}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">
                          {formatRelativeTime(r.recordedAt)}
                        </MonoCell>
                      </TableCell>
                      <TableCell>
                        <code className="block max-w-[200px] truncate font-mono text-[10px] text-slate-600">
                          {r.storageKey}
                        </code>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </section>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Phase A — Section 6: Exit Criteria Checklist ────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ExitCriteriaSection() {
  // Fetch latest reconciliation + validation runs to auto-check items
  const [reconciliation, setReconciliation] = React.useState<ReconciliationRecord | null>(null)
  const [validationRuns, setValidationRuns] = React.useState<readonly ValidationRunRecord[]>([])
  const [bugStats, setBugStats] = React.useState<BugStatsResult | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    try {
      const [rec, val, bstats] = await Promise.all([
        apiGet<LatestReconciliationResult>('/api/launch/alpha/reconciliation/latest').catch(
          () => ({ record: null }) as LatestReconciliationResult,
        ),
        apiGet<ListValidationRunsResult>('/api/launch/alpha/validation?limit=50').catch(
          () => ({ items: [], limit: 50 }) as ListValidationRunsResult,
        ),
        apiGet<BugStatsResult>('/api/launch/alpha/bugs/stats').catch(() => null),
      ])
      setReconciliation(rec.record)
      setValidationRuns(val.items)
      setBugStats(bstats)
    } catch {
      // best-effort — leave defaults
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  // Compute exit criteria status
  const criticalBugsOpen =
    (bugStats?.byStatus.open ?? 0) + (bugStats?.byStatus.in_progress ?? 0)
  // severity breakdown — note stats.bySeverity doesn't filter by status, so be conservative
  const noCriticalBugs = criticalBugsOpen === 0

  const reconciliationBalanced = reconciliation?.status === 'balanced'

  const latestSuiteByStatus = React.useMemo(() => {
    const bySuite: Record<string, ValidationRunRecord> = {}
    for (const r of validationRuns) {
      if (!bySuite[r.suite]) bySuite[r.suite] = r
    }
    return bySuite
  }, [validationRuns])

  const eventReplayPassed = latestSuiteByStatus['event-replay']?.status === 'passed'
  const dataIntegrityPassed = latestSuiteByStatus['data-integrity']?.status === 'passed'
  const noDataCorruption = dataIntegrityPassed

  const items: ReadonlyArray<{
    label: string
    description: string
    status: 'pass' | 'fail' | 'unknown'
  }> = [
    {
      label: 'No critical bugs',
      description: 'Zero open or in-progress critical bugs.',
      status: noCriticalBugs ? 'pass' : 'fail',
    },
    {
      label: 'No data corruption',
      description: 'Data Integrity validation suite passing.',
      status: noDataCorruption ? 'pass' : 'fail',
    },
    {
      label: 'Financial reconciliation at 100%',
      description: 'Latest reconciliation status is balanced.',
      status: reconciliationBalanced ? 'pass' : 'fail',
    },
    {
      label: 'Stable event replay',
      description: 'Event Replay validation suite passing.',
      status: eventReplayPassed ? 'pass' : 'fail',
    },
    {
      label: 'Crash rate below target',
      description: 'Performance metrics within thresholds.',
      status: 'unknown',
    },
  ]

  const passedCount = items.filter((i) => i.status === 'pass').length
  const progress = (passedCount / items.length) * 100

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={CheckCircle}
        title="Exit Criteria Checklist"
        description="Auto-derived gate for promoting Phase A to Phase B. Items refresh with the latest reconciliation and validation runs."
        endpoint="Auto-derived from /api/launch/alpha/reconciliation/latest + /api/launch/alpha/validation + /api/launch/alpha/bugs/stats"
      />

      <Card className="border-slate-800 bg-slate-900/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60">
        <CardHeader className="gap-1.5 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Phase A → Phase B Gate
            </CardTitle>
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] text-emerald-300"
            >
              {passedCount} / {items.length} satisfied
            </Badge>
          </div>
          <ProgressBar
            value={progress}
            className="mt-2 h-1.5 bg-slate-800"
            tone="green"
          />
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.label}
                  className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${
                    item.status === 'pass'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : item.status === 'fail'
                      ? 'border-rose-500/30 bg-rose-500/5'
                      : 'border-slate-800 bg-slate-950/40'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {item.status === 'pass' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : item.status === 'fail' ? (
                      <XCircle className="h-4 w-4 text-rose-400" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <p className="font-mono text-xs text-zinc-100">{item.label}</p>
                    <p className="text-[11px] text-slate-400">{item.description}</p>
                  </div>
                  <StatusBadge
                    tone={
                      item.status === 'pass'
                        ? 'green'
                        : item.status === 'fail'
                        ? 'red'
                        : 'amber'
                    }
                    label={
                      item.status === 'pass'
                        ? 'satisfied'
                        : item.status === 'fail'
                        ? 'blocked'
                        : 'pending'
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Phase B — Section 1: Beta Cohorts ───────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BetaCohortsSection() {
  const [cohorts, setCohorts] = React.useState<readonly BetaCohortView[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [selectedCohort, setSelectedCohort] = React.useState<BetaCohortView | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const data = await apiGet<CohortListResult>('/api/launch/beta/cohorts?limit=50')
      setCohorts(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load beta cohorts')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={Users}
        accent="cyan"
        title="Beta Cohorts"
        description="Cohorts organize participants by phase (alpha, closed beta, open beta). Each cohort tracks invitations, acceptances, and capacity."
        endpoint="GET /api/launch/beta/cohorts · POST /api/launch/beta/cohorts/create"
        action={
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="border-cyan-500/40 bg-cyan-500/10 font-mono text-xs text-cyan-200 hover:bg-cyan-500/20 hover:text-cyan-100"
          >
            <Plus className="mr-1.5 h-3 w-3" /> Create Cohort
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : cohorts.length === 0 ? (
        <EmptyState icon={Users} message="No cohorts created yet. Click 'Create Cohort' to begin." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cohorts.map((c) => {
            const fillPct =
              c.maxParticipants > 0 ? (c.acceptedCount / c.maxParticipants) * 100 : 0
            return (
              <Card
                key={c.cohortId}
                className="cursor-pointer border-slate-800 bg-slate-900/50 ring-1 ring-inset ring-slate-800/60 transition-colors hover:border-cyan-500/40 hover:bg-slate-900/70"
                onClick={() => setSelectedCohort(c)}
              >
                <CardHeader className="gap-1.5 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="truncate font-mono text-sm text-zinc-100">
                      {c.name}
                    </CardTitle>
                    <StatusBadge tone={phaseTone(c.phase)} label={c.phase} />
                  </div>
                  <CardDescription className="text-[11px]">
                    Created {formatRelativeTime(c.createdAt)} by{' '}
                    <span className="font-mono text-slate-300">{c.createdById}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-center">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                        Accepted
                      </p>
                      <p className="mt-0.5 font-mono text-sm font-bold text-emerald-300">
                        {c.acceptedCount}
                      </p>
                    </div>
                    <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-center">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                        Pending
                      </p>
                      <p className="mt-0.5 font-mono text-sm font-bold text-amber-300">
                        {c.pendingCount}
                      </p>
                    </div>
                    <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-center">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                        Max
                      </p>
                      <p className="mt-0.5 font-mono text-sm font-bold text-slate-200">
                        {c.maxParticipants}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
                      <span>Capacity</span>
                      <span className="text-slate-400">{fillPct.toFixed(1)}%</span>
                    </div>
                    <ProgressBar
                      value={fillPct}
                      className="h-1.5 bg-slate-800"
                      tone={
                        fillPct >= 90
                          ? 'red'
                          : fillPct >= 70
                          ? 'amber'
                          : 'cyan'
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-800 pt-2">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] ${
                        c.active
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-slate-600 bg-slate-800/40 text-slate-400'
                      }`}
                    >
                      {c.active ? 'active' : 'inactive'}
                    </Badge>
                    <code className="font-mono text-[10px] text-slate-600">{c.cohortId}</code>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <CreateCohortDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void load()}
      />
      <CohortParticipantsDialog
        cohort={selectedCohort}
        onOpenChange={(o) => !o && setSelectedCohort(null)}
      />
    </section>
  )
}

function CreateCohortDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = React.useState('')
  const [phase, setPhase] = React.useState<LaunchPhase>('closed_beta')
  const [maxParticipants, setMaxParticipants] = React.useState('50')
  const [createdById, setCreatedById] = React.useState(ADMIN_USER_ID)
  const [submitting, setSubmitting] = React.useState(false)

  const reset = () => {
    setName('')
    setPhase('closed_beta')
    setMaxParticipants('50')
    setCreatedById(ADMIN_USER_ID)
  }

  const submit = async () => {
    if (!name.trim() || !createdById.trim()) {
      toast.error('Please fill in all fields')
      return
    }
    const max = parseInt(maxParticipants, 10)
    if (Number.isNaN(max) || max < 1) {
      toast.error('Max participants must be a positive integer')
      return
    }
    setSubmitting(true)
    const tid = toast.loading('Creating cohort…')
    try {
      await apiPost('/api/launch/beta/cohorts/create', {
        name: name.trim(),
        phase,
        maxParticipants: max,
        createdById: createdById.trim(),
      })
      toast.success('Cohort created', { id: tid, description: name.trim() })
      reset()
      onOpenChange(false)
      onCreated()
    } catch (e) {
      toast.error('Failed to create cohort', {
        id: tid,
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Users className="h-4 w-4 text-cyan-400" /> Create Cohort
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Provision a new beta cohort for a specific launch phase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
              Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Founders Beta"
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 placeholder:text-slate-600 focus-visible:ring-cyan-500/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Phase
              </Label>
              <Select value={phase} onValueChange={(v) => setPhase(v as LaunchPhase)}>
                <SelectTrigger className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus:ring-cyan-500/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                  {COHORT_PHASE_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p} className="font-mono text-xs">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Max Participants
              </Label>
              <Input
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                type="number"
                min={1}
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus-visible:ring-cyan-500/30"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
              Created By
            </Label>
            <Input
              value={createdById}
              onChange={(e) => setCreatedById(e.target.value)}
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus-visible:ring-cyan-500/30"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <SpinnerButton
            loading={submitting}
            onClick={() => void submit()}
            icon={Plus}
            className="border-cyan-500/40 bg-cyan-500/10 font-mono text-xs text-cyan-200 hover:bg-cyan-500/20"
          >
            Create Cohort
          </SpinnerButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CohortParticipantsDialog({
  cohort,
  onOpenChange,
}: {
  cohort: BetaCohortView | null
  onOpenChange: (o: boolean) => void
}) {
  const [participants, setParticipants] = React.useState<readonly ParticipantView[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!cohort) {
      setParticipants([])
      setError(null)
      return
    }
    let cancelled = false
    const fetchParticipants = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await apiGet<CohortParticipantsResult>(
          `/api/launch/beta/cohorts/${encodeURIComponent(cohort.cohortId)}/participants`,
        )
        if (!cancelled) setParticipants(data.participants)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load participants')
          setParticipants([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchParticipants()
    return () => {
      cancelled = true
    }
  }, [cohort])

  return (
    <Dialog open={!!cohort} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Users className="h-4 w-4 text-cyan-400" />
            {cohort ? cohort.name : 'Cohort'} Participants
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {cohort
              ? `${cohort.acceptedCount} accepted · ${cohort.pendingCount} pending · ${cohort.maxParticipants} max`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <ErrorBanner message={error} />
        ) : (
          <ScrollArea className="max-h-[420px]">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Invitation ID
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    User ID
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Email
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Role
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Status
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Invited
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRow cols={6} />
                ) : participants.length === 0 ? (
                  <TableRow className="border-slate-800/60 hover:bg-transparent">
                    <TableCell colSpan={6}>
                      <EmptyState
                        icon={Users}
                        message="No participants in this cohort yet, or the participants endpoint is not exposed."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  participants.map((p) => (
                    <TableRow key={p.invitationId} className="border-slate-800/60 hover:bg-slate-800/20">
                      <TableCell>
                        <code className="block max-w-[180px] truncate font-mono text-[10px] text-cyan-300">
                          {p.invitationId}
                        </code>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">{p.userId}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-300">{p.email}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={p.role === 'creator' ? 'cyan' : 'gray'} label={p.role} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={invitationStatusTone(p.status)} label={p.status} />
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">
                          {formatRelativeTime(p.invitedAt)}
                        </MonoCell>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Phase B — Section 2: Invitations ────────────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function InvitationsSection() {
  const [cohorts, setCohorts] = React.useState<readonly BetaCohortView[]>([])
  const [invitations, setInvitations] = React.useState<
    ReadonlyArray<{ cohort: BetaCohortView; participants: readonly ParticipantView[] }>
  >([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const cohortData = await apiGet<CohortListResult>('/api/launch/beta/cohorts?limit=50')
      setCohorts(cohortData.items)
      // Best-effort: fetch participants per cohort to surface pending invitations
      const results = await Promise.all(
        cohortData.items.map(async (c) => {
          try {
            const data = await apiGet<CohortParticipantsResult>(
              `/api/launch/beta/cohorts/${encodeURIComponent(c.cohortId)}/participants`,
            )
            return { cohort: c, participants: data.participants }
          } catch {
            return { cohort: c, participants: [] as readonly ParticipantView[] }
          }
        }),
      )
      setInvitations(results)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invitations')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const acceptInvitation = React.useCallback(
    async (invitationId: string, userId: string, cohortName: string) => {
      const tid = toast.loading(`Accepting invitation ${invitationId}…`)
      try {
        await apiPost('/api/launch/beta/invitations/accept', { invitationId, userId })
        toast.success('Invitation accepted', {
          id: tid,
          description: `${cohortName} → ${userId}`,
        })
        await load()
      } catch (e) {
        toast.error('Failed to accept invitation', {
          id: tid,
          description: e instanceof Error ? e.message : 'Unknown error',
        })
      }
    },
    [load],
  )

  const revokeInvitation = React.useCallback(
    async (invitationId: string, cohortName: string) => {
      const tid = toast.loading(`Revoking invitation ${invitationId}…`)
      try {
        await apiPost('/api/launch/beta/invitations/revoke', {
          invitationId,
          revokedBy: ADMIN_USER_ID,
          reason: 'Revoked via launch dashboard',
        })
        toast.success('Invitation revoked', { id: tid, description: cohortName })
        await load()
      } catch (e) {
        toast.error('Failed to revoke invitation', {
          id: tid,
          description: e instanceof Error ? e.message : 'Unknown error',
        })
      }
    },
    [load],
  )

  const pendingInvitations = React.useMemo(() => {
    const out: Array<{ cohort: BetaCohortView; participant: ParticipantView }> = []
    for (const entry of invitations) {
      for (const p of entry.participants) {
        if (p.status === 'pending') {
          out.push({ cohort: entry.cohort, participant: p })
        }
      }
    }
    return out as ReadonlyArray<{ cohort: BetaCohortView; participant: ParticipantView }>
  }, [invitations])

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={Send}
        accent="cyan"
        title="Invitations"
        description="Invite players and creators to specific cohorts. Pending invitations can be accepted or revoked."
        endpoint="POST /api/launch/beta/invitations/invite · POST /api/launch/beta/invitations/accept · POST /api/launch/beta/invitations/revoke"
        action={
          <Button
            size="sm"
            onClick={() => setInviteOpen(true)}
            disabled={cohorts.length === 0}
            className="border-cyan-500/40 bg-cyan-500/10 font-mono text-xs text-cyan-200 hover:bg-cyan-500/20 hover:text-cyan-100"
          >
            <Send className="mr-1.5 h-3 w-3" /> Invite Participant
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardHeader className="gap-1 pb-3">
          <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
            <Users className="h-3.5 w-3.5 text-cyan-400" /> Pending Invitations
          </CardTitle>
          <CardDescription className="text-xs">
            {pendingInvitations.length} pending across {cohorts.length} cohorts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[420px]">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Cohort
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Invitation ID
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    User
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Email
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Role
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Invited
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRow cols={7} />
                ) : pendingInvitations.length === 0 ? (
                  <TableRow className="border-slate-800/60 hover:bg-transparent">
                    <TableCell colSpan={7}>
                      <EmptyState
                        icon={Send}
                        message="No pending invitations. Either none exist, or the participants endpoint is not exposed."
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingInvitations.map(({ cohort, participant }) => (
                    <TableRow
                      key={participant.invitationId}
                      className="border-slate-800/60 hover:bg-slate-800/20"
                    >
                      <TableCell>
                        <MonoCell className="text-cyan-300">{cohort.name}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <code className="block max-w-[180px] truncate font-mono text-[10px] text-slate-500">
                          {participant.invitationId}
                        </code>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">{participant.userId}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-300">{participant.email}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={participant.role === 'creator' ? 'cyan' : 'gray'}
                          label={participant.role}
                        />
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">
                          {formatRelativeTime(participant.invitedAt)}
                        </MonoCell>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void acceptInvitation(
                                participant.invitationId,
                                participant.userId,
                                cohort.name,
                              )
                            }
                            className="h-7 border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] text-emerald-300 hover:bg-emerald-500/20"
                          >
                            <CheckCircle className="mr-1 h-3 w-3" /> Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void revokeInvitation(participant.invitationId, cohort.name)
                            }
                            className="h-7 border-rose-500/40 bg-rose-500/10 font-mono text-[10px] text-rose-300 hover:bg-rose-500/20"
                          >
                            <XCircle className="mr-1 h-3 w-3" /> Revoke
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <InviteParticipantDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        cohorts={cohorts}
        onInvited={() => void load()}
      />
    </section>
  )
}

function InviteParticipantDialog({
  open,
  onOpenChange,
  cohorts,
  onInvited,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  cohorts: readonly BetaCohortView[]
  onInvited: () => void
}) {
  const [cohortId, setCohortId] = React.useState('')
  const [userId, setUserId] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<ParticipantRole>('player')
  const [invitedBy, setInvitedBy] = React.useState(ADMIN_USER_ID)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open && !cohortId && cohorts.length > 0) {
      setCohortId(cohorts[0].cohortId)
    }
  }, [open, cohortId, cohorts])

  const reset = () => {
    setCohortId(cohorts[0]?.cohortId ?? '')
    setUserId('')
    setEmail('')
    setRole('player')
    setInvitedBy(ADMIN_USER_ID)
  }

  const submit = async () => {
    if (!cohortId || !userId.trim() || !email.trim() || !invitedBy.trim()) {
      toast.error('Please fill in all fields')
      return
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!emailOk) {
      toast.error('Please enter a valid email address')
      return
    }
    // expiresAt = +7 days, ISO datetime
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    setSubmitting(true)
    const tid = toast.loading('Sending invitation…')
    try {
      await apiPost('/api/launch/beta/invitations/invite', {
        cohortId,
        userId: userId.trim(),
        email: email.trim(),
        role,
        invitedBy: invitedBy.trim(),
        expiresAt,
      })
      toast.success('Invitation sent', {
        id: tid,
        description: `${email.trim()} → ${cohortId}`,
      })
      reset()
      onOpenChange(false)
      onInvited()
    } catch (e) {
      toast.error('Failed to send invitation', {
        id: tid,
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Send className="h-4 w-4 text-cyan-400" /> Invite Participant
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Send a beta invitation to a new participant. Invitation expires in 7 days.
          </DialogDescription>
        </DialogHeader>

        {cohorts.length === 0 ? (
          <EmptyState icon={Users} message="Create a cohort first." />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Cohort
              </Label>
              <Select value={cohortId} onValueChange={setCohortId}>
                <SelectTrigger className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus:ring-cyan-500/30">
                  <SelectValue placeholder="Select cohort" />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                  {cohorts.map((c) => (
                    <SelectItem key={c.cohortId} value={c.cohortId} className="font-mono text-xs">
                      {c.name} ({c.phase})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                  User ID
                </Label>
                <Input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="user_xxxx"
                  className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 placeholder:text-slate-600 focus-visible:ring-cyan-500/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                  Role
                </Label>
                <Select value={role} onValueChange={(v) => setRole(v as ParticipantRole)}>
                  <SelectTrigger className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus:ring-cyan-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                    {PARTICIPANT_ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r} className="font-mono text-xs">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Email
              </Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="user@example.com"
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 placeholder:text-slate-600 focus-visible:ring-cyan-500/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Invited By
              </Label>
              <Input
                value={invitedBy}
                onChange={(e) => setInvitedBy(e.target.value)}
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus-visible:ring-cyan-500/30"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <SpinnerButton
            loading={submitting}
            onClick={() => void submit()}
            icon={Send}
            disabled={cohorts.length === 0}
            className="border-cyan-500/40 bg-cyan-500/10 font-mono text-xs text-cyan-200 hover:bg-cyan-500/20"
          >
            Send Invitation
          </SpinnerButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Phase B — Section 3: Feedback Pipeline ──────────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function FeedbackPipelineSection() {
  const [feedback, setFeedback] = React.useState<readonly FeedbackRecord[]>([])
  const [stats, setStats] = React.useState<FeedbackStatsResult | null>(null)
  const [cohorts, setCohorts] = React.useState<readonly BetaCohortView[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [submitOpen, setSubmitOpen] = React.useState(false)
  const [triageTarget, setTriageTarget] = React.useState<FeedbackRecord | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const [list, s, c] = await Promise.all([
        apiGet<FeedbackListResult>('/api/launch/beta/feedback?limit=20'),
        apiGet<FeedbackStatsResult>('/api/launch/beta/feedback/stats').catch(() => null),
        apiGet<CohortListResult>('/api/launch/beta/cohorts?limit=50').catch(
          () => ({ items: [], total: 0, limit: 50, offset: 0 }) as CohortListResult,
        ),
      ])
      setFeedback(list.items)
      setStats(s)
      setCohorts(c.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={FileText}
        title="Feedback Pipeline"
        description="Triage and resolve feedback submitted by beta participants. Each item is append-only; triage writes status + notes."
        endpoint="GET /api/launch/beta/feedback · GET /api/launch/beta/feedback/stats · POST /api/launch/beta/feedback · POST /api/launch/beta/feedback/triage"
        action={
          <Button
            size="sm"
            onClick={() => setSubmitOpen(true)}
            className="border-emerald-500/40 bg-emerald-500/10 font-mono text-xs text-emerald-200 hover:bg-emerald-500/20 hover:text-emerald-100"
          >
            <Plus className="mr-1.5 h-3 w-3" /> Submit Feedback
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="New" value={stats?.byStatus.new ?? 0} tone="cyan" icon={FileText} />
        <StatCard
          label="Triaged"
          value={stats?.byStatus.triaged ?? 0}
          tone="amber"
          icon={Activity}
        />
        <StatCard
          label="In Progress"
          value={stats?.byStatus.in_progress ?? 0}
          tone="amber"
          icon={RefreshCw}
        />
        <StatCard
          label="Resolved"
          value={stats?.byStatus.resolved ?? 0}
          tone="green"
          icon={CheckCircle}
        />
        <StatCard
          label="Won't Fix"
          value={stats?.byStatus.wont_fix ?? 0}
          tone="gray"
          icon={XCircle}
        />
      </div>

      {/* Feedback table */}
      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardHeader className="gap-1 pb-3">
          <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
            <FileText className="h-3.5 w-3.5 text-emerald-400" /> Feedback Submissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[420px]">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Title
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Category
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Severity
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Status
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Submitted By
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Created
                  </TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRow cols={7} />
                ) : feedback.length === 0 ? (
                  <TableRow className="border-slate-800/60 hover:bg-transparent">
                    <TableCell colSpan={7}>
                      <EmptyState icon={FileText} message="No feedback submitted yet." />
                    </TableCell>
                  </TableRow>
                ) : (
                  feedback.map((f) => (
                    <TableRow key={f.id} className="border-slate-800/60 hover:bg-slate-800/20">
                      <TableCell className="max-w-[280px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="truncate text-xs text-zinc-100">{f.title}</span>
                          <code className="font-mono text-[10px] text-slate-600">{f.id}</code>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={feedbackCategoryTone(f.category)} label={f.category} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={bugSeverityTone(f.severity)} label={f.severity} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={feedbackStatusTone(f.status)} label={f.status} />
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">{f.userId}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <MonoCell className="text-slate-400">
                          {formatRelativeTime(f.createdAt)}
                        </MonoCell>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={f.status === 'resolved' || f.status === 'wont_fix'}
                          onClick={() => setTriageTarget(f)}
                          className="h-7 border-slate-700 bg-slate-950/60 font-mono text-[10px] text-emerald-300 hover:border-emerald-500/40 hover:bg-emerald-500/10"
                        >
                          Triage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <SubmitFeedbackDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        cohorts={cohorts}
        onSubmitted={() => void load()}
      />
      <TriageFeedbackDialog
        feedback={triageTarget}
        onOpenChange={(o) => !o && setTriageTarget(null)}
        onTriaged={() => void load()}
      />
    </section>
  )
}

function feedbackCategoryTone(cat: string): Tone {
  switch (cat) {
    case 'bug':
      return 'red'
    case 'feature_request':
      return 'cyan'
    case 'experience':
      return 'green'
    case 'performance':
      return 'amber'
    case 'other':
    default:
      return 'gray'
  }
}

function SubmitFeedbackDialog({
  open,
  onOpenChange,
  cohorts,
  onSubmitted,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  cohorts: readonly BetaCohortView[]
  onSubmitted: () => void
}) {
  const [cohortId, setCohortId] = React.useState('')
  const [userId, setUserId] = React.useState('')
  const [category, setCategory] = React.useState<FeedbackCategory>('bug')
  const [severity, setSeverity] = React.useState<FeedbackSeverity>('medium')
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open && !cohortId && cohorts.length > 0) {
      setCohortId(cohorts[0].cohortId)
    }
  }, [open, cohortId, cohorts])

  const reset = () => {
    setCohortId(cohorts[0]?.cohortId ?? '')
    setUserId('')
    setCategory('bug')
    setSeverity('medium')
    setTitle('')
    setDescription('')
  }

  const submit = async () => {
    if (!cohortId || !userId.trim() || !title.trim() || !description.trim()) {
      toast.error('Please fill in all fields')
      return
    }
    setSubmitting(true)
    const tid = toast.loading('Submitting feedback…')
    try {
      await apiPost('/api/launch/beta/feedback', {
        cohortId,
        userId: userId.trim(),
        category,
        severity,
        title: title.trim(),
        description: description.trim(),
      })
      toast.success('Feedback submitted', { id: tid, description: title.trim() })
      reset()
      onOpenChange(false)
      onSubmitted()
    } catch (e) {
      toast.error('Failed to submit feedback', {
        id: tid,
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <FileText className="h-4 w-4 text-emerald-400" /> Submit Feedback
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            File new feedback from a beta participant.
          </DialogDescription>
        </DialogHeader>

        {cohorts.length === 0 ? (
          <EmptyState icon={Users} message="Create a cohort first to submit feedback." />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                  Cohort
                </Label>
                <Select value={cohortId} onValueChange={setCohortId}>
                  <SelectTrigger className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus:ring-emerald-500/30">
                    <SelectValue placeholder="Select cohort" />
                  </SelectTrigger>
                  <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                    {cohorts.map((c) => (
                      <SelectItem key={c.cohortId} value={c.cohortId} className="font-mono text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                  User ID
                </Label>
                <Input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="user_xxxx"
                  className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                  Category
                </Label>
                <Select value={category} onValueChange={(v) => setCategory(v as FeedbackCategory)}>
                  <SelectTrigger className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus:ring-emerald-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                    {FEEDBACK_CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c} className="font-mono text-xs">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                  Severity
                </Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as FeedbackSeverity)}>
                  <SelectTrigger className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus:ring-emerald-500/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                    {FEEDBACK_SEVERITY_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} className="font-mono text-xs">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Title
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary"
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Description
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed description…"
                className="min-h-[100px] resize-none border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <SpinnerButton
            loading={submitting}
            onClick={() => void submit()}
            icon={Send}
            disabled={cohorts.length === 0}
            className="border-emerald-500/40 bg-emerald-500/10 font-mono text-xs text-emerald-200 hover:bg-emerald-500/20"
          >
            Submit Feedback
          </SpinnerButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TriageFeedbackDialog({
  feedback,
  onOpenChange,
  onTriaged,
}: {
  feedback: FeedbackRecord | null
  onOpenChange: (o: boolean) => void
  onTriaged: () => void
}) {
  const [status, setStatus] = React.useState<FeedbackStatus>('triaged')
  const [assignedTo, setAssignedTo] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (feedback) {
      setStatus(feedback.status === 'new' ? 'triaged' : feedback.status)
      setAssignedTo(feedback.assignedTo ?? ADMIN_USER_ID)
      setNotes(feedback.triageNotes ?? '')
    }
  }, [feedback])

  const submit = async () => {
    if (!feedback) return
    if (!assignedTo.trim()) {
      toast.error('Please specify an assignee')
      return
    }
    setSubmitting(true)
    const tid = toast.loading(`Triaging feedback ${feedback.id}…`)
    try {
      await apiPost('/api/launch/beta/feedback/triage', {
        feedbackId: feedback.id,
        status,
        assignedTo: assignedTo.trim(),
        triagedBy: ADMIN_USER_ID,
        notes: notes.trim(),
      })
      toast.success('Feedback triaged', { id: tid, description: feedback.title })
      onOpenChange(false)
      onTriaged()
    } catch (e) {
      toast.error('Failed to triage feedback', {
        id: tid,
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!feedback} onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Activity className="h-4 w-4 text-emerald-400" /> Triage Feedback
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {feedback ? feedback.title : ''}
          </DialogDescription>
        </DialogHeader>

        {feedback && (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                Feedback ID
              </p>
              <code className="block break-all font-mono text-[11px] text-cyan-300">
                {feedback.id}
              </code>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Status
              </Label>
              <Select value={status} onValueChange={(v) => setStatus(v as FeedbackStatus)}>
                <SelectTrigger className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus:ring-emerald-500/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                  {FEEDBACK_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Assigned To
              </Label>
              <Input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 focus-visible:ring-emerald-500/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                Notes
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Triage notes…"
                className="min-h-[80px] resize-none border-slate-700 bg-slate-900/60 font-mono text-xs text-zinc-100 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <SpinnerButton
            loading={submitting}
            onClick={() => void submit()}
            icon={CheckCircle}
            className="border-emerald-500/40 bg-emerald-500/10 font-mono text-xs text-emerald-200 hover:bg-emerald-500/20"
          >
            Confirm Triage
          </SpinnerButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ─── Phase B — Section 4: Beta Metrics Summary ───────────────────────────────
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BetaMetricsSection() {
  const [metrics, setMetrics] = React.useState<BetaMetricsResult | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const data = await apiGet<BetaMetricsResult>('/api/launch/beta/metrics')
      setMetrics(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load beta metrics')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const totalCohorts = metrics?.cohorts?.items?.length ?? 0
  const totalParticipants =
    metrics?.cohorts?.items?.reduce((sum, c) => sum + c.acceptedCount, 0) ?? 0

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={TrendingUp}
        accent="cyan"
        title="Beta Metrics Summary"
        description="Aggregated metrics across all cohorts — participation, feedback status, and bug status."
        endpoint="GET /api/launch/beta/metrics"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Cohorts" value={totalCohorts} tone="cyan" icon={Users} />
        <StatCard
          label="Total Participants"
          value={totalParticipants}
          tone="green"
          icon={Users}
        />
        <StatCard
          label="Open Feedback"
          value={
            (metrics?.feedbackByStatus?.new ?? 0) +
            (metrics?.feedbackByStatus?.triaged ?? 0) +
            (metrics?.feedbackByStatus?.in_progress ?? 0)
          }
          tone="amber"
          icon={FileText}
        />
        <StatCard
          label="Open Bugs"
          value={
            (metrics?.bugsByStatus?.open ?? 0) + (metrics?.bugsByStatus?.in_progress ?? 0)
          }
          tone="red"
          icon={Bug}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
              <FileText className="h-3.5 w-3.5 text-emerald-400" /> Feedback by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <Skeleton className="h-32" />
            ) : metrics?.feedbackByStatus &&
              Object.keys(metrics.feedbackByStatus).length > 0 ? (
              <StatusBreakdown
                title="feedback"
                data={metrics.feedbackByStatus}
                toneResolver={feedbackStatusTone}
              />
            ) : (
              <EmptyState icon={FileText} message="No feedback recorded yet." />
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
              <Bug className="h-3.5 w-3.5 text-cyan-400" /> Bugs by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <Skeleton className="h-32" />
            ) : metrics?.bugsByStatus && Object.keys(metrics.bugsByStatus).length > 0 ? (
              <StatusBreakdown
                title="bugs"
                data={metrics.bugsByStatus}
                toneResolver={bugStatusTone}
              />
            ) : (
              <EmptyState icon={Bug} message="No bugs recorded yet." />
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function StatusBreakdown({
  title,
  data,
  toneResolver,
}: {
  title: string
  data: Record<string, number>
  toneResolver: (s: string) => Tone
}) {
  const entries = Object.entries(data).filter(([, v]) => v > 0)
  const total = entries.reduce((sum, [, v]) => sum + v, 0)
  if (entries.length === 0) {
    return <EmptyState icon={Activity} message={`No ${title} recorded yet.`} />
  }
  return (
    <ul className="space-y-2">
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0
          return (
            <li
              key={status}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <StatusBadge tone={toneResolver(status)} label={status} />
                <span className="font-mono text-[11px] text-slate-400">
                  {count} {count === 1 ? 'item' : 'items'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ProgressBar
                  value={pct}
                  className="h-1.5 w-24 bg-slate-800"
                  tone={toneResolver(status)}
                />
                <span className="w-10 text-right font-mono text-[10px] text-slate-500">
                  {pct.toFixed(0)}%
                </span>
              </div>
            </li>
          )
        })}
    </ul>
  )
}
