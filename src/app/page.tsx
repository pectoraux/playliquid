'use client'

import * as React from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowDown,
  Boxes,
  CheckCircle2,
  Database,
  GitBranch,
  Layers,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  Terminal,
  Zap,
  Radio,
  Cpu,
  Network,
  HardDrive,
  Cloud,
  Workflow,
  Send,
  Inbox,
  Search,
  CircleDot,
  Clock,
  Plug,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthCheck {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  latencyMs: number
  details?: Record<string, unknown>
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  checks: HealthCheck[]
}

interface ArchitectureBinding {
  token: string
  lifetime: string
}

interface ArchitectureResponse {
  layers: string[]
  eventTypes: string[]
  commandTypes: string[]
  queryTypes: string[]
  bindings: ArchitectureBinding[]
  timestamp: string
}

interface CommandResponse {
  ok: boolean
  data?: { gameId: string }
  error?: string
  code?: string
  category?: string
}

interface QueryResponse {
  ok: boolean
  data?: GameView
  error?: string
  code?: string
  category?: string
}

interface GameView {
  gameId: string
  title: string
  creatorId: string
  status: string
  publishedAt: string | null
}

interface OutboxResponse {
  published: number
  pending: number
  failed: number
}

interface ProjectionsResponse {
  processed: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ARCHITECTURE_LAYERS = [
  {
    name: 'Shared',
    icon: Boxes,
    accent: 'emerald',
    description: 'Cross-cutting primitives with zero domain dependencies.',
    components: ['ids', 'types', 'Result', 'config', 'logging', 'utils'],
  },
  {
    name: 'Domain',
    icon: Shield,
    accent: 'emerald',
    description: 'Pure business model — the heart of the bounded context.',
    components: ['AggregateRoot', 'Entity', 'ValueObject', 'DomainEvent', 'Repository', 'Specification'],
  },
  {
    name: 'Application',
    icon: Workflow,
    accent: 'cyan',
    description: 'Orchestrates use cases via buses and middleware pipelines.',
    components: ['CommandBus', 'QueryBus', 'Pipelines', 'Handlers', 'Validation', 'Authorization'],
  },
  {
    name: 'Infrastructure',
    icon: Server,
    accent: 'cyan',
    description: 'Technical implementations of all application ports.',
    components: ['EventStore', 'Outbox', 'EventBus', 'UoW', 'DI Container', 'Projections', 'Cache'],
  },
  {
    name: 'Interfaces',
    icon: Network,
    accent: 'emerald',
    description: 'Entry points — HTTP routes, health probes, and workers.',
    components: ['API Routes', 'Health Checks', 'Workers'],
  },
] as const

const COMMAND_PIPELINE = [
  'Correlation',
  'Logging',
  'Metrics',
  'Idempotency',
  'Validation',
  'Authorization',
  'Transaction',
  'Handler',
]

const QUERY_PIPELINE = ['Logging', 'Metrics', 'Cache', 'Handler']

const COMPONENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  database: Database,
  'event-store': HardDrive,
  'event-bus': Radio,
  outbox: Inbox,
  cache: Cpu,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomGameId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `game_${crypto.randomUUID().slice(0, 8)}`
  }
  return `game_${Math.random().toString(36).slice(2, 10)}`
}

function statusColor(status: string): string {
  switch (status) {
    case 'healthy':
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    case 'degraded':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    case 'unhealthy':
      return 'text-rose-400 bg-rose-500/10 border-rose-500/30'
    default:
      return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30'
  }
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'healthy'
      ? 'bg-emerald-400'
      : status === 'degraded'
      ? 'bg-amber-400'
      : 'bg-rose-400'
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span
        className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${color}`}
      />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  )
}

function accentClasses(accent: string): { text: string; bg: string; border: string; ring: string } {
  if (accent === 'cyan') {
    return {
      text: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/30',
      ring: 'ring-cyan-500/20',
    }
  }
  return {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    ring: 'ring-emerald-500/20',
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="dark flex min-h-screen flex-col bg-slate-950 text-zinc-100">
      <BackgroundGrid />
      <div className="relative flex flex-1 flex-col">
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
          <ArchitectureLayers />
          <Separator className="my-12 bg-slate-800" />
          <HealthDashboard />
          <Separator className="my-12 bg-slate-800" />
          <EventSourcingDemo />
          <Separator className="my-12 bg-slate-800" />
          <RegistryDisplay />
          <Separator className="my-12 bg-slate-800" />
          <PipelineVisualization />
        </main>
        <Footer />
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

// ─── Header / Hero ────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="relative border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono uppercase tracking-[0.25em] text-emerald-400/80">
          <span className="inline-flex items-center gap-1.5">
            <CircleDot className="h-3.5 w-3.5" />
            playliquid
          </span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">milestone 1</span>
        </div>
        <div className="flex flex-col gap-4">
          <h1 className="font-mono text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl">
            Play<span className="text-emerald-400">Liquid</span>
          </h1>
          <p className="font-mono text-base text-cyan-300/90 sm:text-lg">
            Production-Grade Event-Driven Architecture
          </p>
          <p className="max-w-3xl text-sm text-slate-400 sm:text-base">
            A reference implementation of a gaming platform built on strict
            Domain-Driven Design, Command-Query Responsibility Segregation,
            Event Sourcing, and the Transactional Outbox pattern.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2 font-mono text-xs text-slate-400">
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              DDD
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              CQRS
            </Badge>
            <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              Event Sourcing
            </Badge>
            <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              Outbox Pattern
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Badge
            variant="outline"
            className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-300"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Boundaries Verified
          </Badge>
          <Badge
            variant="outline"
            className="gap-1.5 border-slate-700 bg-slate-900/60 px-3 py-1 font-mono text-slate-400"
          >
            <Layers className="h-3.5 w-3.5" />
            5-Layer Onion
          </Badge>
          <Badge
            variant="outline"
            className="gap-1.5 border-slate-700 bg-slate-900/60 px-3 py-1 font-mono text-slate-400"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Strict Dependency Rules
          </Badge>
        </div>
      </div>
    </header>
  )
}

// ─── Architecture Layers ──────────────────────────────────────────────────────

function ArchitectureLayers() {
  return (
    <section id="architecture" className="scroll-mt-8">
      <SectionHeading
        index="01"
        title="Architecture Layers"
        description="A strict onion architecture — each layer may only depend on layers below it. Boundary rules are enforced by ESLint and a CI checker."
        icon={Layers}
      />
      <div className="mt-8 grid gap-4 lg:grid-cols-5">
        {ARCHITECTURE_LAYERS.map((layer, idx) => {
          const Icon = layer.icon
          const accent = accentClasses(layer.accent)
          return (
            <Card
              key={layer.name}
              className={`relative border-slate-800 bg-slate-900/50 py-5 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60 transition-colors hover:border-slate-700`}
            >
              <CardHeader className="gap-3 px-5">
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent.bg} ${accent.border} border ring-1 ring-inset ${accent.ring}`}
                  >
                    <Icon className={`h-4.5 w-4.5 ${accent.text}`} />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
                    L{idx + 1}
                  </span>
                </div>
                <CardTitle className="font-mono text-base text-zinc-100">
                  {layer.name}
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  {layer.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-5">
                <div className="flex flex-wrap gap-1.5">
                  {layer.components.map((c) => (
                    <Badge
                      key={c}
                      variant="outline"
                      className={`border-slate-700 bg-slate-950/60 px-2 py-0.5 font-mono text-[10px] text-slate-300`}
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              {idx < ARCHITECTURE_LAYERS.length - 1 && (
                <div className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 lg:block">
                  <ArrowRight className="h-4 w-4 text-slate-700" />
                </div>
              )}
            </Card>
          )
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 font-mono text-xs text-slate-400">
        <Terminal className="h-3.5 w-3.5 text-emerald-400" />
        <span>
          Dependency direction:{' '}
          <span className="text-emerald-300">Shared</span> ←{' '}
          <span className="text-emerald-300">Domain</span> ←{' '}
          <span className="text-cyan-300">Application</span> ←{' '}
          <span className="text-cyan-300">Infrastructure</span> ←{' '}
          <span className="text-emerald-300">Interfaces</span>
        </span>
      </div>
    </section>
  )
}

// ─── Health Dashboard ─────────────────────────────────────────────────────────

function HealthDashboard() {
  const { toast } = useToast()
  const [health, setHealth] = React.useState<HealthResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null)
  const [paused, setPaused] = React.useState(false)

  const fetchHealth = React.useCallback(async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = (await res.json()) as HealthResponse
      setHealth(data)
      setError(null)
      setLastUpdated(new Date())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch health'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void fetchHealth()
    if (paused) return
    const interval = setInterval(() => void fetchHealth(), 5000)
    return () => clearInterval(interval)
  }, [fetchHealth, paused])

  const overall = health?.status ?? 'unhealthy'

  const handleRefresh = () => {
    setLoading(true)
    void fetchHealth()
    toast({
      title: 'Health refreshed',
      description: 'Re-ran all infrastructure health checks.',
    })
  }

  return (
    <section id="health" className="scroll-mt-8">
      <SectionHeading
        index="02"
        title="Live Health Dashboard"
        description="Real-time status of every infrastructure component. Auto-refreshes every 5 seconds."
        icon={Activity}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaused((p) => !p)}
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-300 hover:bg-slate-800 hover:text-zinc-100"
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-300 hover:bg-slate-800 hover:text-zinc-100"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_2fr]">
        {/* Overall status */}
        <Card className="border-slate-800 bg-slate-900/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-sm uppercase tracking-wider text-slate-300">
                Overall Status
              </CardTitle>
              <StatusDot status={overall} />
            </div>
            <CardDescription className="text-xs">
              Aggregated from all registered health checks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`rounded-lg border px-4 py-3 ${statusColor(overall)}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold uppercase">
                  {loading && !health ? '...' : overall}
                </span>
                <Activity className="h-5 w-5 opacity-70" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
                <div className="text-slate-500">Checks</div>
                <div className="text-zinc-200">{health?.checks.length ?? 0}</div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
                <div className="text-slate-500">Last Updated</div>
                <div className="text-zinc-200">
                  {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
                </div>
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="font-mono">{error}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per-component */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {loading && !health ? (
            <HealthCardSkeletons />
          ) : health && health.checks.length > 0 ? (
            health.checks.map((check) => (
              <HealthCheckCard key={check.name} check={check} />
            ))
          ) : (
            <div className="col-span-full flex items-center justify-center rounded-lg border border-dashed border-slate-800 py-12 text-sm text-slate-500">
              No health checks registered.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function HealthCheckCard({ check }: { check: HealthCheck }) {
  const Icon = COMPONENT_ICONS[check.name] ?? Server
  const details = check.details ?? {}
  return (
    <Card className="border-slate-800 bg-slate-900/40 py-4 ring-1 ring-inset ring-slate-800/40">
      <CardHeader className="gap-2 px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-950/60">
              <Icon className="h-3.5 w-3.5 text-slate-300" />
            </div>
            <span className="font-mono text-sm text-zinc-100">{check.name}</span>
          </div>
          <StatusDot status={check.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-slate-500">Status</span>
          <span
            className={`rounded border px-1.5 py-0.5 uppercase ${statusColor(check.status)}`}
          >
            {check.status}
          </span>
        </div>
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-slate-500">Latency</span>
          <span className="text-cyan-300">{check.latencyMs} ms</span>
        </div>
        {Object.keys(details).length > 0 && (
          <div className="mt-2 border-t border-slate-800 pt-2">
            <pre className="overflow-x-auto font-mono text-[10px] leading-tight text-slate-400">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HealthCardSkeletons() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <Card
          key={i}
          className="border-slate-800 bg-slate-900/40 py-4 ring-1 ring-inset ring-slate-800/40"
        >
          <CardContent className="flex items-center gap-2 px-4">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400/60" />
            <span className="font-mono text-xs text-slate-500">Loading…</span>
          </CardContent>
        </Card>
      ))}
    </>
  )
}

// ─── Event Sourcing Demo ──────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'success' | 'error'

interface StepState {
  status: StepStatus
  result?: unknown
  error?: string
  timestamp?: string
}

function EventSourcingDemo() {
  const { toast } = useToast()
  const [gameId, setGameId] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [creatorId, setCreatorId] = React.useState('')
  const [steps, setSteps] = React.useState<Record<number, StepState>>({
    1: { status: 'pending' },
    2: { status: 'pending' },
    3: { status: 'pending' },
    4: { status: 'pending' },
  })

  React.useEffect(() => {
    setGameId(randomGameId())
    setCreatorId(`creator_${Math.random().toString(36).slice(2, 8)}`)
    setTitle('Liquid Tournament — Season 1')
  }, [])

  const updateStep = (n: number, patch: Partial<StepState>) =>
    setSteps((s) => ({ ...s, [n]: { ...s[n], ...patch } }))

  const resetSteps = (keepCommand = false) =>
    setSteps({
      1: keepCommand ? steps[1] : { status: 'pending' },
      2: { status: 'pending' },
      3: { status: 'pending' },
      4: { status: 'pending' },
    })

  // Step 1: Dispatch command
  const handleDispatch = async () => {
    if (!gameId.trim() || !title.trim() || !creatorId.trim()) {
      toast({
        title: 'Validation error',
        description: 'Game ID, Title, and Creator ID are all required.',
        variant: 'destructive',
      })
      return
    }
    updateStep(1, { status: 'running', error: undefined, result: undefined })
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandType: 'PublishGame',
          payload: { gameId, title, creatorId },
        }),
      })
      const data = (await res.json()) as CommandResponse
      if (!data.ok) {
        throw new Error(data.error ?? 'Command failed')
      }
      updateStep(1, {
        status: 'success',
        result: data.data,
        timestamp: new Date().toISOString(),
      })
      // Reset downstream steps since we have new events
      setSteps((s) => ({
        1: s[1],
        2: { status: 'pending' },
        3: { status: 'pending' },
        4: { status: 'pending' },
      }))
      toast({
        title: 'Command dispatched',
        description: `PublishGame appended to stream GameAggregate:${gameId}`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      updateStep(1, { status: 'error', error: msg })
      toast({ title: 'Command failed', description: msg, variant: 'destructive' })
    }
  }

  // Step 2: Process outbox
  const handleOutbox = async () => {
    updateStep(2, { status: 'running', error: undefined, result: undefined })
    try {
      const res = await fetch('/api/workers/outbox', { method: 'POST' })
      const data = (await res.json()) as OutboxResponse
      updateStep(2, {
        status: 'success',
        result: data,
        timestamp: new Date().toISOString(),
      })
      toast({
        title: 'Outbox processed',
        description: `Published ${data.published} event(s).`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      updateStep(2, { status: 'error', error: msg })
      toast({ title: 'Outbox failed', description: msg, variant: 'destructive' })
    }
  }

  // Step 3: Run projections
  const handleProjections = async () => {
    updateStep(3, { status: 'running', error: undefined, result: undefined })
    try {
      const res = await fetch('/api/workers/projections', { method: 'POST' })
      const data = (await res.json()) as ProjectionsResponse
      updateStep(3, {
        status: 'success',
        result: data,
        timestamp: new Date().toISOString(),
      })
      toast({
        title: 'Projections ran',
        description: `Projected ${data.processed} event(s) into read models.`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      updateStep(3, { status: 'error', error: msg })
      toast({
        title: 'Projections failed',
        description: msg,
        variant: 'destructive',
      })
    }
  }

  // Step 4: Query read model
  const handleQuery = async () => {
    updateStep(4, { status: 'running', error: undefined, result: undefined })
    try {
      const res = await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryType: 'GetGame',
          payload: { gameId },
        }),
      })
      const data = (await res.json()) as QueryResponse
      if (!data.ok) {
        throw new Error(data.error ?? 'Query failed')
      }
      updateStep(4, {
        status: 'success',
        result: data.data,
        timestamp: new Date().toISOString(),
      })
      toast({
        title: 'Query executed',
        description: `Read model returned for game ${gameId}.`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      updateStep(4, { status: 'error', error: msg })
      toast({ title: 'Query failed', description: msg, variant: 'destructive' })
    }
  }

  const resetAll = () => {
    setGameId(randomGameId())
    setCreatorId(`creator_${Math.random().toString(36).slice(2, 8)}`)
    setTitle('Liquid Tournament — Season 1')
    resetSteps(false)
  }

  return (
    <section id="demo" className="scroll-mt-8">
      <SectionHeading
        index="03"
        title="Event Sourcing Demo"
        description="Dispatch a command, publish the outbox, run projections, then query the materialized read model — the full CQRS + Event Sourcing round trip."
        icon={Zap}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={resetAll}
            className="font-mono text-xs text-slate-400 hover:bg-slate-800/60 hover:text-zinc-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reset
          </Button>
        }
      />

      {/* Flow indicator */}
      <FlowIndicator steps={steps} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Step 1: Dispatch Command */}
        <Card className="border-slate-800 bg-slate-900/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60">
          <CardHeader>
            <StepHeader
              n={1}
              title="Dispatch Command"
              subtitle="POST /api/commands"
              icon={Send}
              status={steps[1].status}
            />
            <CardDescription className="text-xs">
              Validates payload, runs authorization, opens a transaction,
              appends events to the EventStore, and writes to the Outbox — all
              atomically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="gameId" className="font-mono text-xs text-slate-400">
                Game ID
              </Label>
              <Input
                id="gameId"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                className="border-slate-700 bg-slate-950/60 font-mono text-xs text-emerald-300 focus-visible:ring-emerald-500/30"
                spellCheck={false}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="title" className="font-mono text-xs text-slate-400">
                Title
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border-slate-700 bg-slate-950/60 font-mono text-xs text-zinc-100 focus-visible:ring-emerald-500/30"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="creatorId" className="font-mono text-xs text-slate-400">
                Creator ID
              </Label>
              <Input
                id="creatorId"
                value={creatorId}
                onChange={(e) => setCreatorId(e.target.value)}
                className="border-slate-700 bg-slate-950/60 font-mono text-xs text-cyan-300 focus-visible:ring-emerald-500/30"
                spellCheck={false}
              />
            </div>
            <Button
              onClick={handleDispatch}
              disabled={steps[1].status === 'running'}
              className="bg-emerald-600 font-mono text-xs text-white hover:bg-emerald-500"
            >
              {steps[1].status === 'running' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Dispatch PublishGame
            </Button>
            <StepResult step={steps[1]} />
          </CardContent>
        </Card>

        {/* Step 2: Process Outbox */}
        <Card className="border-slate-800 bg-slate-900/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60">
          <CardHeader>
            <StepHeader
              n={2}
              title="Process Outbox"
              subtitle="POST /api/workers/outbox"
              icon={Inbox}
              status={steps[2].status}
            />
            <CardDescription className="text-xs">
              The OutboxPublisher drains pending messages from the outbox table
              and publishes them to the EventBus — guaranteeing at-least-once
              delivery.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleOutbox}
              disabled={steps[2].status === 'running' || steps[1].status !== 'success'}
              variant="outline"
              className="border-cyan-500/40 bg-cyan-500/10 font-mono text-xs text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200"
            >
              {steps[2].status === 'running' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Inbox className="h-3.5 w-3.5" />
              )}
              Process Outbox Batch
            </Button>
            {steps[1].status !== 'success' && (
              <p className="font-mono text-[10px] text-amber-400/80">
                Dispatch a command first to populate the outbox.
              </p>
            )}
            <StepResult step={steps[2]} />
          </CardContent>
        </Card>

        {/* Step 3: Run Projections */}
        <Card className="border-slate-800 bg-slate-900/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60">
          <CardHeader>
            <StepHeader
              n={3}
              title="Run Projections"
              subtitle="POST /api/workers/projections"
              icon={GitBranch}
              status={steps[3].status}
            />
            <CardDescription className="text-xs">
              The ProjectionEngine replays published events through registered
              projectors, materializing them into optimized read models.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleProjections}
              disabled={steps[3].status === 'running' || steps[2].status !== 'success'}
              variant="outline"
              className="border-cyan-500/40 bg-cyan-500/10 font-mono text-xs text-cyan-300 hover:bg-cyan-500/20 hover:text-cyan-200"
            >
              {steps[3].status === 'running' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitBranch className="h-3.5 w-3.5" />
              )}
              Run Projection Batch
            </Button>
            {steps[2].status !== 'success' && (
              <p className="font-mono text-[10px] text-amber-400/80">
                Process the outbox first so events are available to projectors.
              </p>
            )}
            <StepResult step={steps[3]} />
          </CardContent>
        </Card>

        {/* Step 4: Query Read Model */}
        <Card className="border-slate-800 bg-slate-900/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60">
          <CardHeader>
            <StepHeader
              n={4}
              title="Query Read Model"
              subtitle="POST /api/queries"
              icon={Search}
              status={steps[4].status}
            />
            <CardDescription className="text-xs">
              Executes a GetGame query through the QueryBus pipeline. Reads
              exclusively from the materialized GameReadModel — never touches the
              event stream.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={handleQuery}
              disabled={steps[4].status === 'running' || steps[3].status !== 'success'}
              className="bg-emerald-600 font-mono text-xs text-white hover:bg-emerald-500"
            >
              {steps[4].status === 'running' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Query Game Read Model
            </Button>
            {steps[3].status !== 'success' && (
              <p className="font-mono text-[10px] text-amber-400/80">
                Run projections first so the read model is up to date.
              </p>
            )}
            <StepResult step={steps[4]} />
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function StepHeader({
  n,
  title,
  subtitle,
  icon: Icon,
  status,
}: {
  n: number
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  status: StepStatus
}) {
  const ringColor =
    status === 'success'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : status === 'error'
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
      : status === 'running'
      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
      : 'border-slate-700 bg-slate-900/60 text-slate-400'
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-md border font-mono text-sm font-bold ${ringColor}`}
        >
          {n}
        </div>
        <div>
          <CardTitle className="font-mono text-base text-zinc-100">
            {title}
          </CardTitle>
          <p className="mt-0.5 font-mono text-[10px] text-slate-500">{subtitle}</p>
        </div>
      </div>
      <Icon className="h-4 w-4 text-slate-600" />
    </div>
  )
}

function StepResult({ step }: { step: StepState }) {
  if (step.status === 'pending') return null
  if (step.status === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 font-mono text-xs text-cyan-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        Executing…
      </div>
    )
  }
  if (step.status === 'error') {
    return (
      <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-xs text-rose-300">
          <AlertCircle className="h-3 w-3" />
          Error
        </div>
        <p className="mt-1 font-mono text-[11px] text-rose-300/80">{step.error}</p>
      </div>
    )
  }
  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          Success
        </div>
        {step.timestamp && (
          <span className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
            <Clock className="h-2.5 w-2.5" />
            {new Date(step.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
      <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950/80 p-2 font-mono text-[10px] leading-tight text-slate-300">
        {JSON.stringify(step.result, null, 2)}
      </pre>
    </div>
  )
}

function FlowIndicator({ steps }: { steps: Record<number, StepState> }) {
  const items = [
    { n: 1, label: 'Command', icon: Send },
    { n: 2, label: 'Outbox', icon: Inbox },
    { n: 3, label: 'Projection', icon: GitBranch },
    { n: 4, label: 'Query', icon: Search },
  ]
  return (
    <div className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-4">
      {items.map((item, idx) => {
        const state = steps[item.n]
        const Icon = item.icon
        const color =
          state.status === 'success'
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
            : state.status === 'error'
            ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
            : state.status === 'running'
            ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
            : 'border-slate-800 bg-slate-900/40 text-slate-500'
        return (
          <React.Fragment key={item.n}>
            <div
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${color}`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                <span className="font-mono text-xs">
                  <span className="opacity-60">{item.n}.</span> {item.label}
                </span>
              </div>
              {state.status === 'success' && <CheckCircle2 className="h-3.5 w-3.5" />}
              {state.status === 'error' && <AlertCircle className="h-3.5 w-3.5" />}
              {state.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {state.status === 'pending' && <CircleDot className="h-3.5 w-3.5 opacity-40" />}
            </div>
            {idx < items.length - 1 && (
              <div className="hidden items-center justify-center sm:flex">
                <ArrowRight className="h-4 w-4 text-slate-700" />
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Registry Display ─────────────────────────────────────────────────────────

function RegistryDisplay() {
  const { toast } = useToast()
  const [arch, setArch] = React.useState<ArchitectureResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const fetchArch = React.useCallback(async () => {
    try {
      const res = await fetch('/api/architecture', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ArchitectureResponse
      setArch(data)
      setError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch architecture'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void fetchArch()
  }, [fetchArch])

  const handleRefresh = () => {
    setLoading(true)
    void fetchArch()
    toast({ title: 'Registry refreshed' })
  }

  return (
    <section id="registry" className="scroll-mt-8">
      <SectionHeading
        index="04"
        title="Registry Display"
        description="Live introspection of the DI container — registered event types, commands, queries, and bindings."
        icon={Plug}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-300 hover:bg-slate-800 hover:text-zinc-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />
      {error ? (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="font-mono">{error}</span>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <RegistryCard
            title="Event Types"
            count={arch?.eventTypes.length ?? 0}
            items={arch?.eventTypes}
            loading={loading}
            icon={Radio}
            accent="emerald"
          />
          <RegistryCard
            title="Command Types"
            count={arch?.commandTypes.length ?? 0}
            items={arch?.commandTypes}
            loading={loading}
            icon={Send}
            accent="cyan"
          />
          <RegistryCard
            title="Query Types"
            count={arch?.queryTypes.length ?? 0}
            items={arch?.queryTypes}
            loading={loading}
            icon={Search}
            accent="cyan"
          />
          <BindingsCard bindings={arch?.bindings} loading={loading} />
        </div>
      )}
    </section>
  )
}

function RegistryCard({
  title,
  count,
  items,
  loading,
  icon: Icon,
  accent,
}: {
  title: string
  count: number
  items?: string[]
  loading: boolean
  icon: React.ComponentType<{ className?: string }>
  accent: 'emerald' | 'cyan'
}) {
  const a = accentClasses(accent)
  return (
    <Card className="border-slate-800 bg-slate-900/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-md border ${a.bg} ${a.border}`}>
              <Icon className={`h-3.5 w-3.5 ${a.text}`} />
            </div>
            <CardTitle className="font-mono text-sm text-zinc-100">{title}</CardTitle>
          </div>
          <Badge variant="outline" className="border-slate-700 bg-slate-950/60 font-mono text-xs text-slate-300">
            {loading ? '…' : count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48 rounded-md">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
            </div>
          ) : items && items.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pr-2">
              {items.map((item) => (
                <Badge
                  key={item}
                  variant="outline"
                  className={`border-slate-700 bg-slate-950/60 px-2 py-0.5 font-mono text-[10px] ${a.text}`}
                >
                  {item}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center font-mono text-xs text-slate-500">
              No items registered.
            </p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function BindingsCard({
  bindings,
  loading,
}: {
  bindings?: ArchitectureBinding[]
  loading: boolean
}) {
  const singletonCount = bindings?.filter((b) => b.lifetime === 'singleton').length ?? 0
  const transientCount = bindings?.filter((b) => b.lifetime === 'transient').length ?? 0
  return (
    <Card className="border-slate-800 bg-slate-900/50 shadow-lg shadow-black-20 ring-1 ring-inset ring-slate-800/60">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <Boxes className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <CardTitle className="font-mono text-sm text-zinc-100">DI Bindings</CardTitle>
          </div>
          <Badge variant="outline" className="border-slate-700 bg-slate-950/60 font-mono text-xs text-slate-300">
            {loading ? '…' : bindings?.length ?? 0}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-xs">
            <div className="text-slate-500">Singleton</div>
            <div className="text-emerald-300">{singletonCount}</div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-xs">
            <div className="text-slate-500">Transient</div>
            <div className="text-cyan-300">{transientCount}</div>
          </div>
        </div>
        <ScrollArea className="h-36 rounded-md">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
            </div>
          ) : bindings && bindings.length > 0 ? (
            <div className="space-y-1 pr-2">
              {bindings.map((b, i) => (
                <div
                  key={`${b.token}-${i}`}
                  className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/40 px-2 py-1"
                >
                  <span className="truncate font-mono text-[10px] text-slate-300">
                    {b.token}
                  </span>
                  <Badge
                    variant="outline"
                    className={`ml-2 shrink-0 border-transparent px-1.5 py-0 font-mono text-[9px] ${
                      b.lifetime === 'singleton'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-cyan-500/15 text-cyan-300'
                    }`}
                  >
                    {b.lifetime}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center font-mono text-xs text-slate-500">
              No bindings registered.
            </p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

// ─── Pipeline Visualization ───────────────────────────────────────────────────

function PipelineVisualization() {
  return (
    <section id="pipelines" className="scroll-mt-8">
      <SectionHeading
        index="05"
        title="Pipeline Visualization"
        description="Every command and query flows through a chain of cross-cutting middleware before reaching its handler."
        icon={Workflow}
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PipelineCard
          title="Command Bus Pipeline"
          subtitle="7 middleware stages"
          stages={COMMAND_PIPELINE}
          accent="emerald"
          icon={Send}
        />
        <PipelineCard
          title="Query Bus Pipeline"
          subtitle="3 middleware stages"
          stages={QUERY_PIPELINE}
          accent="cyan"
          icon={Search}
        />
      </div>
    </section>
  )
}

function PipelineCard({
  title,
  subtitle,
  stages,
  accent,
  icon: Icon,
}: {
  title: string
  subtitle: string
  stages: string[]
  accent: 'emerald' | 'cyan'
  icon: React.ComponentType<{ className?: string }>
}) {
  const a = accentClasses(accent)
  return (
    <Card className="border-slate-800 bg-slate-900/50 shadow-lg shadow-black/20 ring-1 ring-inset ring-slate-800/60">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-md border ${a.bg} ${a.border}`}>
              <Icon className={`h-3.5 w-3.5 ${a.text}`} />
            </div>
            <CardTitle className="font-mono text-sm text-zinc-100">{title}</CardTitle>
          </div>
          <Badge variant="outline" className="border-slate-700 bg-slate-950/60 font-mono text-[10px] text-slate-400">
            {subtitle}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {stages.map((stage, idx) => {
            const isHandler = stage === 'Handler'
            return (
              <React.Fragment key={stage}>
                <div
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    isHandler
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : `${a.border} ${a.bg}`
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded font-mono text-[10px] font-bold ${
                      isHandler
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-950/60 text-slate-400'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span
                    className={`font-mono text-xs ${
                      isHandler ? 'font-semibold text-emerald-300' : a.text
                    }`}
                  >
                    {stage}
                  </span>
                  {isHandler && (
                    <Badge
                      variant="outline"
                      className="ml-auto border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 font-mono text-[9px] text-emerald-300"
                    >
                      terminal
                    </Badge>
                  )}
                </div>
                {idx < stages.length - 1 && (
                  <div className="flex justify-center">
                    <ArrowDown className={`h-3 w-3 ${isHandler ? 'text-emerald-500/40' : 'text-slate-700'}`} />
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Section Heading ──────────────────────────────────────────────────────────

function SectionHeading({
  index,
  title,
  description,
  icon: Icon,
  action,
}: {
  index: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20">
            <Icon className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-slate-600">{index}</span>
            <h2 className="font-mono text-2xl font-semibold tracking-tight text-zinc-50">
              {title}
            </h2>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-slate-400">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-mono text-sm text-zinc-100">
              <span className="text-emerald-400">Play</span>
              <span>Liquid</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">Architecture Foundation</span>
            </div>
            <p className="font-mono text-xs text-slate-500">
              Milestone 1 — Production-grade event-driven platform.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
              Health Endpoints
            </p>
            <div className="flex flex-wrap gap-2">
              <FooterLink href="/api/health" label="/api/health" icon={Activity} />
              <FooterLink href="/api/ready" label="/api/ready" icon={CheckCircle2} />
              <FooterLink href="/api/live" label="/api/live" icon={Zap} />
            </div>
          </div>
        </div>
        <Separator className="bg-slate-800" />
        <div className="flex flex-col items-center justify-between gap-2 font-mono text-[10px] text-slate-600 sm:flex-row">
          <span>
            Built with DDD · CQRS · Event Sourcing · Outbox Pattern
          </span>
          <span className="flex items-center gap-1.5">
            <Cloud className="h-3 w-3" />
            Next.js · TypeScript · Prisma · shadcn/ui
          </span>
        </div>
      </div>
    </footer>
  )
}

function FooterLink({
  href,
  label,
  icon: Icon,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1 font-mono text-[11px] text-slate-400 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
    >
      <Icon className="h-3 w-3" />
      {label}
    </a>
  )
}
