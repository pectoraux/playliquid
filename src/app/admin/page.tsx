'use client'

import * as React from 'react'
import { toast, Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertTriangle,
  Building2,
  CheckCircle,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  FileText,
  Key,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaitlistEntry {
  id: string
  email: string
  username: string
  status: 'pending' | 'email_verified' | 'approved' | 'rejected' | 'converted'
  verificationToken: string | null
  verifiedAt: string | null
  approvalNotes: string | null
  rejectionReason: string | null
  invitedById: string | null
  createdAt: string
  updatedAt: string
}

interface WaitlistStats {
  total: number
  byStatus: Record<string, number>
}

interface ListResult<T> {
  items: readonly T[]
  total: number
  limit: number
  offset: number
}

interface UserRoleView {
  roleId: string
  roleName: string
  assignedAt: string
}

interface UserMembershipView {
  organizationId: string
  roleId: string
  joinedAt: string
}

interface UserView {
  userId: string
  email: string
  username: string
  displayName: string
  country: string
  timezone: string
  locale: string
  status: string
  emailVerified: boolean
  mfaEnabled: boolean
  mfaMethod: string | null
  roles: readonly UserRoleView[]
  memberships: readonly UserMembershipView[]
  createdAt: string
  updatedAt: string
}

interface OrganizationView {
  organizationId: string
  name: string
  slug: string
  type: string
  createdById: string
  memberCount: number
  active: boolean
  createdAt: string
  updatedAt: string
}

interface OrgMemberView {
  userId: string
  roleId: string
  joinedAt: string
  status: string
  email: string | null
  displayName: string | null
}

interface RoleData {
  id: string
  name: string
  description: string
  permissions: string[]
  isSystem: boolean
  createdAt: string
}

interface PermissionData {
  id: string
  resource: string
  action: string
  description: string
  isSystem: boolean
  createdAt: string
}

interface ApiKeyView {
  id: string
  userId: string
  name: string
  keyPrefix: string
  scopes: readonly string[]
  expiresAt: string | null
  lastUsedAt: string | null
  lastUsedIp: string | null
  createdAt: string
  revokedAt: string | null
  active: boolean
}

interface CreateApiKeyResult {
  apiKeyId: string
  plaintextKey: string
  keyPrefix: string
}

interface AuditLogEntry {
  id: string
  action: string
  actorId: string
  actorType: 'user' | 'system' | 'api_key'
  targetType: string
  targetId: string
  timestamp: string
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
  correlationId: string | null
}

interface AuditListResult {
  items: readonly AuditLogEntry[]
  limit: number
  offset: number
}

interface ArchitectureBinding {
  token: string
  lifetime: string
}

interface ArchitectureResponse {
  milestone: string
  layers: string[]
  eventTypes: string[]
  commandTypes: string[]
  queryTypes: string[]
  bindings: ArchitectureBinding[]
  timestamp: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = 'admin'

const USER_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'deleted', label: 'Deleted' },
] as const

const ORG_TYPE_OPTIONS = [
  'creator_studio',
  'platform_operations',
  'moderation_team',
  'enterprise_customer',
  'tournament_organizer',
] as const

const IDENTITY_VALUE_OBJECTS = [
  'UserId',
  'RoleId',
  'PermissionId',
  'DeviceId',
  'Email',
  'Username',
  'DisplayName',
  'Country',
  'Timezone',
  'Locale',
  'PhoneNumber',
  'PasswordHash',
]

const IDENTITY_AGGREGATES = [
  { name: 'UserAggregate', description: 'User lifecycle, roles, memberships, MFA, email verification.' },
  { name: 'OrganizationAggregate', description: 'Org membership, type, active state.' },
]

const IDENTITY_EVENTS = [
  'UserCreated',
  'UserApproved',
  'UserRejected',
  'UserSuspendedM3',
  'UserReactivated',
  'UserDeleted',
  'UserProfileUpdated',
  'UserEmailChanged',
  'UserPasswordChanged',
  'UserEmailVerified',
  'UserMfaEnabled',
  'UserMfaDisabled',
  'RoleAssigned',
  'RoleRemoved',
  'OrganizationJoined',
  'OrganizationLeft',
  'SessionStarted',
  'SessionEnded',
  'OrganizationCreated',
  'MemberAdded',
  'MemberRemoved',
  'ApiKeyCreated',
  'ApiKeyRotated',
  'ApiKeyDisabled',
  'AuditRecorded',
]

const IDENTITY_REPOSITORIES = [
  'UserRepository',
  'OrganizationRepository',
  'RoleRepository',
  'PermissionRepository',
  'ApiKeyRepository',
  'AuditLogRepository',
  'WaitlistRepository',
  'DeviceRepository',
]

const AUTHZ_ENGINE_CLASSES = [
  { name: 'RbacEngine', description: 'Role-Based Access Control — resolves effective permission sets from role assignments.' },
  { name: 'AbacEngine', description: 'Attribute-Based Access Control — conditional policies evaluated against context.' },
  { name: 'PolicyEngine', description: 'Composes RBAC + ABAC into a single authorization decision (allow / deny / conditional).' },
]

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

function statusTone(status: string): { className: string; label: string } {
  const s = status.toLowerCase()
  if (['active', 'approved', 'converted', 'email_verified'].includes(s)) {
    return {
      className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
      label: status,
    }
  }
  if (['pending', 'waitlist'].includes(s)) {
    return {
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
      label: status,
    }
  }
  if (['rejected', 'suspended', 'deleted', 'revoked'].includes(s)) {
    return {
      className: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
      label: status,
    }
  }
  return {
    className: 'border-slate-600 bg-slate-800/40 text-slate-300',
    label: status,
  }
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status)
  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] uppercase tracking-wide ${tone.className}`}
    >
      {tone.label}
    </Badge>
  )
}

function copyToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    void navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  } else {
    toast.error('Clipboard not available')
  }
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

function EmptyState({ icon: Icon, message }: { icon: React.ComponentType<{ className?: string }>; message: string }) {
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
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  endpoint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20">
          <Icon className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="space-y-1">
          <h2 className="font-mono text-base font-semibold text-zinc-100">{title}</h2>
          <p className="text-xs text-slate-400">{description}</p>
          {endpoint && (
            <p className="font-mono text-[10px] text-slate-600">{endpoint}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  )
}

function MonoCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-xs text-slate-300 ${className ?? ''}`}>{children}</span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminConsolePage() {
  return (
    <div className="dark flex min-h-screen flex-col bg-slate-950 text-zinc-100">
      <Toaster theme="dark" position="top-right" richColors closeButton />
      <BackgroundGrid />
      <div className="relative flex flex-1 flex-col">
        <AdminHeader />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <Tabs defaultValue="waitlist" className="w-full">
            <ScrollArea className="w-full whitespace-nowrap">
              <TabsList className="mb-6 inline-flex h-auto w-max gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
                <TabsTrigger value="waitlist" className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
                  <Clock className="h-3.5 w-3.5" /> Waitlist
                </TabsTrigger>
                <TabsTrigger value="users" className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
                  <Users className="h-3.5 w-3.5" /> Users
                </TabsTrigger>
                <TabsTrigger value="organizations" className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
                  <Building2 className="h-3.5 w-3.5" /> Organizations
                </TabsTrigger>
                <TabsTrigger value="roles" className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
                  <Shield className="h-3.5 w-3.5" /> Roles &amp; Permissions
                </TabsTrigger>
                <TabsTrigger value="apikeys" className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
                  <Key className="h-3.5 w-3.5" /> API Keys
                </TabsTrigger>
                <TabsTrigger value="audit" className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
                  <FileText className="h-3.5 w-3.5" /> Audit Log
                </TabsTrigger>
                <TabsTrigger value="architecture" className="gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
                  <Layers className="h-3.5 w-3.5" /> Architecture
                </TabsTrigger>
              </TabsList>
            </ScrollArea>

            <TabsContent value="waitlist" className="mt-0 focus-visible:outline-none">
              <WaitlistTab />
            </TabsContent>
            <TabsContent value="users" className="mt-0 focus-visible:outline-none">
              <UsersTab />
            </TabsContent>
            <TabsContent value="organizations" className="mt-0 focus-visible:outline-none">
              <OrganizationsTab />
            </TabsContent>
            <TabsContent value="roles" className="mt-0 focus-visible:outline-none">
              <RolesPermissionsTab />
            </TabsContent>
            <TabsContent value="apikeys" className="mt-0 focus-visible:outline-none">
              <ApiKeysTab />
            </TabsContent>
            <TabsContent value="audit" className="mt-0 focus-visible:outline-none">
              <AuditTab />
            </TabsContent>
            <TabsContent value="architecture" className="mt-0 focus-visible:outline-none">
              <ArchitectureTab />
            </TabsContent>
          </Tabs>
        </main>
        <AdminFooter />
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

function AdminHeader() {
  return (
    <header className="relative border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono uppercase tracking-[0.25em] text-emerald-400/80">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            playliquid
          </span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">milestone 3</span>
          <span className="text-slate-600">/</span>
          <span className="text-emerald-400">admin console</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="font-mono text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
              Identity <span className="text-emerald-400">Admin</span>
            </h1>
            <p className="max-w-2xl text-sm text-slate-400">
              Operational console for the PlayLiquid identity &amp; access management
              domain — waitlist approval, user lifecycle, organizations, RBAC,
              API keys, and the audit trail.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-emerald-300">
              <CheckCircle className="h-3.5 w-3.5" /> DDD / CQRS
            </Badge>
            <Badge variant="outline" className="gap-1.5 border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-cyan-300">
              <Shield className="h-3.5 w-3.5" /> RBAC + ABAC
            </Badge>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1 font-mono text-[11px] text-slate-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              <Layers className="h-3 w-3" /> Architecture Dashboard
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}

function AdminFooter() {
  return (
    <footer className="mt-auto border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <span className="text-emerald-400">Play</span>
          <span>Liquid</span>
          <span className="text-slate-600">·</span>
          <span>Admin Console</span>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[10px] text-slate-500">
          <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">/api/admin/*</span>
          <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">Event-Sourced</span>
          <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1">Audit Logged</span>
        </div>
      </div>
    </footer>
  )
}

// ─── Tab 1: Waitlist ──────────────────────────────────────────────────────────

function WaitlistTab() {
  const [stats, setStats] = React.useState<WaitlistStats | null>(null)
  const [entries, setEntries] = React.useState<readonly WaitlistEntry[]>([])
  const [loadingStats, setLoadingStats] = React.useState(true)
  const [loadingList, setLoadingList] = React.useState(true)
  const [statsError, setStatsError] = React.useState<string | null>(null)
  const [listError, setListError] = React.useState<string | null>(null)
  const [approveTarget, setApproveTarget] = React.useState<WaitlistEntry | null>(null)
  const [rejectTarget, setRejectTarget] = React.useState<WaitlistEntry | null>(null)

  const loadStats = React.useCallback(async () => {
    setLoadingStats(true)
    setStatsError(null)
    try {
      const data = await apiGet<WaitlistStats>('/api/admin/waitlist/stats')
      setStats(data)
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : 'Failed to load stats')
    } finally {
      setLoadingStats(false)
    }
  }, [])

  const loadList = React.useCallback(async () => {
    setLoadingList(true)
    setListError(null)
    try {
      const data = await apiGet<ListResult<WaitlistEntry>>('/api/admin/waitlist?limit=20')
      setEntries(data.items)
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Failed to load waitlist')
    } finally {
      setLoadingList(false)
    }
  }, [])

  React.useEffect(() => {
    void loadStats()
    void loadList()
  }, [loadStats, loadList])

  const statCards = [
    { key: 'total', label: 'Total', value: stats?.total, accent: 'text-zinc-100' },
    { key: 'pending', label: 'Pending', value: stats?.byStatus?.pending ?? 0, accent: 'text-amber-300' },
    { key: 'email_verified', label: 'Email Verified', value: stats?.byStatus?.email_verified ?? 0, accent: 'text-cyan-300' },
    { key: 'approved', label: 'Approved', value: stats?.byStatus?.approved ?? 0, accent: 'text-emerald-300' },
    { key: 'rejected', label: 'Rejected', value: stats?.byStatus?.rejected ?? 0, accent: 'text-rose-300' },
  ]

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={Clock}
        title="Waitlist Management"
        description="Review and act on users waiting for access approval."
        endpoint="GET /api/admin/waitlist/stats · GET /api/admin/waitlist"
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => { void loadStats(); void loadList() }}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300"
          >
            <RefreshCw className="mr-1.5 h-3 w-3" /> Refresh
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((s) => (
          <Card key={s.key} className="border-slate-800 bg-slate-900/50 py-4 ring-1 ring-inset ring-slate-800/60">
            <CardContent className="px-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{s.label}</p>
              {loadingStats ? (
                <Skeleton className="mt-1.5 h-7 w-12" />
              ) : (
                <p className={`mt-1 font-mono text-2xl font-bold ${s.accent}`}>{s.value ?? 0}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {statsError && <ErrorBanner message={statsError} onRetry={() => void loadStats()} />}

      {/* Table */}
      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardHeader className="gap-1 pb-3">
          <CardTitle className="font-mono text-sm text-zinc-100">Waitlist Entries</CardTitle>
          <CardDescription className="text-xs">Most recent 20 entries. Approve or reject inline.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {listError ? (
            <div className="px-4 pb-4"><ErrorBanner message={listError} onRetry={() => void loadList()} /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="pl-4 text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-400">Username</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    <TableHead className="pr-4 text-right text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingList ? (
                    <>
                      <LoadingRow cols={5} />
                      <LoadingRow cols={5} />
                      <LoadingRow cols={5} />
                    </>
                  ) : entries.length === 0 ? (
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableCell colSpan={5} className="py-10">
                        <EmptyState icon={Clock} message="No waitlist entries found." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry) => (
                      <TableRow key={entry.id} className="border-slate-800/60 hover:bg-slate-800/20">
                        <TableCell className="pl-4">
                          <div className="flex flex-col">
                            <MonoCell className="text-emerald-200">{entry.email}</MonoCell>
                            <MonoCell className="text-[10px] text-slate-600">{entry.id}</MonoCell>
                          </div>
                        </TableCell>
                        <TableCell><MonoCell>{entry.username}</MonoCell></TableCell>
                        <TableCell><StatusBadge status={entry.status} /></TableCell>
                        <TableCell><MonoCell className="text-slate-400">{formatRelativeTime(entry.createdAt)}</MonoCell></TableCell>
                        <TableCell className="pr-4">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setApproveTarget(entry)}
                              disabled={entry.status === 'approved' || entry.status === 'converted'}
                              className="h-7 gap-1 border-emerald-500/40 bg-emerald-500/10 px-2 text-[11px] text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 disabled:opacity-40"
                            >
                              <CheckCircle className="h-3 w-3" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRejectTarget(entry)}
                              disabled={entry.status === 'rejected'}
                              className="h-7 gap-1 border-rose-500/40 bg-rose-500/10 px-2 text-[11px] text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-40"
                            >
                              <XCircle className="h-3 w-3" /> Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ApproveDialog
        entry={approveTarget}
        onClose={() => setApproveTarget(null)}
        onDone={() => { setApproveTarget(null); void loadStats(); void loadList() }}
      />
      <RejectDialog
        entry={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onDone={() => { setRejectTarget(null); void loadStats(); void loadList() }}
      />
    </section>
  )
}

function ApproveDialog({
  entry,
  onClose,
  onDone,
}: {
  entry: WaitlistEntry | null
  onClose: () => void
  onDone: () => void
}) {
  const [notes, setNotes] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (entry) setNotes('')
  }, [entry])

  const submit = async () => {
    if (!entry) return
    setSubmitting(true)
    try {
      await apiPost('/api/admin/waitlist/approve', {
        userId: entry.id,
        approvedBy: ADMIN_USER_ID,
        notes: notes.trim() || 'Approved via admin console',
      })
      toast.success(`Approved ${entry.email}`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <CheckCircle className="h-4 w-4 text-emerald-400" /> Approve Waitlist Entry
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            The user will transition from <span className="font-mono text-amber-300">waitlist</span> to{' '}
            <span className="font-mono text-emerald-300">active</span> and receive a welcome email.
          </DialogDescription>
        </DialogHeader>
        {entry && (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="flex items-center justify-between">
                <MonoCell className="text-emerald-200">{entry.email}</MonoCell>
                <StatusBadge status={entry.status} />
              </div>
              <MonoCell className="text-[10px] text-slate-600">@{entry.username} · {entry.id}</MonoCell>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approve-notes" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
                Approval Notes
              </Label>
              <Textarea
                id="approve-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for the audit trail…"
                className="resize-none border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting}
            className="gap-1.5 border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 hover:text-emerald-100"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            Confirm Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({
  entry,
  onClose,
  onDone,
}: {
  entry: WaitlistEntry | null
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (entry) setReason('')
  }, [entry])

  const submit = async () => {
    if (!entry) return
    if (!reason.trim()) {
      toast.error('A rejection reason is required')
      return
    }
    setSubmitting(true)
    try {
      await apiPost('/api/admin/waitlist/reject', {
        userId: entry.id,
        rejectedBy: ADMIN_USER_ID,
        reason: reason.trim(),
      })
      toast.success(`Rejected ${entry.email}`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reject failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <XCircle className="h-4 w-4 text-rose-400" /> Reject Waitlist Entry
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            This action is recorded in the audit log and is not reversible from this console.
          </DialogDescription>
        </DialogHeader>
        {entry && (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <MonoCell className="text-rose-200">{entry.email}</MonoCell>
              <MonoCell className="text-[10px] text-slate-600">@{entry.username} · {entry.id}</MonoCell>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
                Rejection Reason <span className="text-rose-400">*</span>
              </Label>
              <Textarea
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this request is being rejected…"
                className="resize-none border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-rose-500/30"
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting}
            className="gap-1.5 border border-rose-500/40 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 hover:text-rose-100"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Confirm Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tab 2: Users ─────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = React.useState<readonly UserView[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<string>('all')
  const [detailUser, setDetailUser] = React.useState<UserView | null>(null)
  const [suspendTarget, setSuspendTarget] = React.useState<UserView | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<UserView | null>(null)
  const [reactivateTarget, setReactivateTarget] = React.useState<UserView | null>(null)
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = React.useCallback(async (searchVal?: string, statusVal?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '20' })
      const sv = searchVal ?? search
      const stv = statusVal ?? status
      if (sv.trim()) params.set('search', sv.trim())
      if (stv && stv !== 'all') params.set('status', stv)
      const data = await apiGet<ListResult<UserView>>(`/api/admin/users?${params.toString()}`)
      setUsers(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [search, status])

  React.useEffect(() => {
    void load()
  }, [load])

  const onSearchChange = (val: string) => {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => void load(val, status), 350)
  }

  const onStatusChange = (val: string) => {
    setStatus(val)
    void load(search, val)
  }

  const refreshAfterAction = () => {
    setDetailUser(null)
    setSuspendTarget(null)
    setDeleteTarget(null)
    setReactivateTarget(null)
    void load()
  }

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={Users}
        title="User Management"
        description="Search, inspect, and manage the full user lifecycle."
        endpoint="GET /api/admin/users"
      />

      {/* Filters */}
      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by email or username…"
              className="border-slate-700 bg-slate-950/60 pl-9 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="w-full border-slate-700 bg-slate-950/60 font-mono text-xs text-slate-200 sm:w-[180px] focus:ring-emerald-500/30">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
              {USER_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="font-mono text-xs focus:bg-emerald-500/10 focus:text-emerald-300">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void load()}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300"
          >
            <RefreshCw className="mr-1.5 h-3 w-3" /> Refresh
          </Button>
        </CardContent>
      </Card>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="pl-4 text-slate-400">Email</TableHead>
                  <TableHead className="text-slate-400">Username</TableHead>
                  <TableHead className="text-slate-400">Display Name</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Country</TableHead>
                  <TableHead className="text-slate-400">MFA</TableHead>
                  <TableHead className="text-slate-400">Created</TableHead>
                  <TableHead className="pr-4 text-right text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <>
                    <LoadingRow cols={8} />
                    <LoadingRow cols={8} />
                    <LoadingRow cols={8} />
                  </>
                ) : users.length === 0 ? (
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableCell colSpan={8} className="py-10">
                      <EmptyState icon={Users} message="No users match the current filters." />
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.userId} className="border-slate-800/60 hover:bg-slate-800/20">
                      <TableCell className="pl-4">
                        <button
                          onClick={() => setDetailUser(u)}
                          className="flex flex-col text-left transition-colors hover:text-emerald-300"
                        >
                          <MonoCell className="text-emerald-200">{u.email}</MonoCell>
                          <MonoCell className="text-[10px] text-slate-600">{u.userId}</MonoCell>
                        </button>
                      </TableCell>
                      <TableCell><MonoCell>{u.username}</MonoCell></TableCell>
                      <TableCell><MonoCell className="text-slate-200">{u.displayName}</MonoCell></TableCell>
                      <TableCell><StatusBadge status={u.status} /></TableCell>
                      <TableCell><MonoCell>{u.country || '—'}</MonoCell></TableCell>
                      <TableCell>
                        {u.mfaEnabled ? (
                          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] text-emerald-300">
                            <ShieldCheck className="mr-1 h-2.5 w-2.5" />{u.mfaMethod || 'on'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-700 bg-slate-800/40 font-mono text-[10px] text-slate-500">
                            off
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell><MonoCell className="text-slate-400">{formatRelativeTime(u.createdAt)}</MonoCell></TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailUser(u)}
                            className="h-7 px-2 text-[11px] text-slate-400 hover:bg-slate-700/40 hover:text-emerald-300"
                            aria-label="View user details"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          {u.status === 'suspended' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setReactivateTarget(u)}
                              className="h-7 px-2 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
                              aria-label="Reactivate user"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSuspendTarget(u)}
                              disabled={u.status === 'deleted'}
                              className="h-7 px-2 text-[11px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-30"
                              aria-label="Suspend user"
                            >
                              <AlertTriangle className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(u)}
                            disabled={u.status === 'deleted'}
                            className="h-7 px-2 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"
                            aria-label="Delete user"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <UserDetailDialog user={detailUser} onClose={() => setDetailUser(null)} />
      <SuspendDialog user={suspendTarget} onClose={() => setSuspendTarget(null)} onDone={refreshAfterAction} />
      <ReactivateDialog user={reactivateTarget} onClose={() => setReactivateTarget(null)} onDone={refreshAfterAction} />
      <DeleteUserDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} onDone={refreshAfterAction} />
    </section>
  )
}

function UserDetailDialog({ user, onClose }: { user: UserView | null; onClose: () => void }) {
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Users className="h-4 w-4 text-emerald-400" /> User Profile
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Full read-model projection of the user aggregate.
          </DialogDescription>
        </DialogHeader>
        {user && (
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Email" value={user.email} accent />
                <DetailField label="Username" value={user.username} />
                <DetailField label="Display Name" value={user.displayName} />
                <DetailField label="Country" value={user.country || '—'} />
                <DetailField label="Timezone" value={user.timezone || '—'} />
                <DetailField label="Locale" value={user.locale || '—'} />
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusBadge status={user.status} />
                {user.emailVerified ? (
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] text-emerald-300">
                    <CheckCircle className="mr-1 h-2.5 w-2.5" /> Email Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-300">
                    <AlertTriangle className="mr-1 h-2.5 w-2.5" /> Email Unverified
                  </Badge>
                )}
                {user.mfaEnabled && (
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] text-emerald-300">
                    <ShieldCheck className="mr-1 h-2.5 w-2.5" /> MFA: {user.mfaMethod || 'on'}
                  </Badge>
                )}
              </div>

              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">User ID</p>
                <code className="block break-all rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[11px] text-cyan-300">
                  {user.userId}
                </code>
              </div>

              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Roles ({user.roles.length})
                </p>
                {user.roles.length === 0 ? (
                  <MonoCell className="text-slate-600">No roles assigned.</MonoCell>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {user.roles.map((r) => (
                      <Badge key={r.roleId} variant="outline" className="border-emerald-500/30 bg-emerald-500/5 font-mono text-[10px] text-emerald-200">
                        <Shield className="mr-1 h-2.5 w-2.5" />{r.roleName}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Memberships ({user.memberships.length})
                </p>
                {user.memberships.length === 0 ? (
                  <MonoCell className="text-slate-600">No organization memberships.</MonoCell>
                ) : (
                  <div className="space-y-1">
                    {user.memberships.map((m, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5">
                        <MonoCell className="text-cyan-300">{m.organizationId}</MonoCell>
                        <MonoCell className="text-[10px] text-slate-500">role: {m.roleId}</MonoCell>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator className="bg-slate-800" />
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Created" value={formatRelativeTime(user.createdAt)} />
                <DetailField label="Updated" value={formatRelativeTime(user.updatedAt)} />
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DetailField({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`font-mono text-xs ${accent ? 'text-emerald-200' : 'text-slate-200'}`}>{value}</p>
    </div>
  )
}

function SuspendDialog({
  user,
  onClose,
  onDone,
}: {
  user: UserView | null
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (user) setReason('')
  }, [user])

  const submit = async () => {
    if (!user) return
    if (!reason.trim()) {
      toast.error('A suspension reason is required')
      return
    }
    setSubmitting(true)
    try {
      await apiPost('/api/admin/users/suspend', {
        userId: user.userId,
        suspendedBy: ADMIN_USER_ID,
        reason: reason.trim(),
      })
      toast.success(`Suspended ${user.email}`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Suspend failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> Suspend User
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            The user will be prevented from authenticating until reactivated.
          </DialogDescription>
        </DialogHeader>
        {user && (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <MonoCell className="text-amber-200">{user.email}</MonoCell>
              <MonoCell className="text-[10px] text-slate-600">@{user.username} · {user.userId}</MonoCell>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suspend-reason" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
                Suspension Reason <span className="text-rose-400">*</span>
              </Label>
              <Textarea
                id="suspend-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this user being suspended?"
                className="resize-none border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-amber-500/30"
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200">Cancel</Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting}
            className="gap-1.5 border border-amber-500/40 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 hover:text-amber-100"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            Confirm Suspend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReactivateDialog({
  user,
  onClose,
  onDone,
}: {
  user: UserView | null
  onClose: () => void
  onDone: () => void
}) {
  const [submitting, setSubmitting] = React.useState(false)

  const submit = async () => {
    if (!user) return
    setSubmitting(true)
    try {
      await apiPost('/api/admin/users/reactivate', {
        userId: user.userId,
        reactivatedBy: ADMIN_USER_ID,
      })
      toast.success(`Reactivated ${user.email}`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reactivate failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <CheckCircle className="h-4 w-4 text-emerald-400" /> Reactivate User
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Restore full access for this user.
          </DialogDescription>
        </DialogHeader>
        {user && (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
            <MonoCell className="text-emerald-200">{user.email}</MonoCell>
            <MonoCell className="text-[10px] text-slate-600">@{user.username}</MonoCell>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200">Cancel</Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting}
            className="gap-1.5 border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 hover:text-emerald-100"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            Confirm Reactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteUserDialog({
  user,
  onClose,
  onDone,
}: {
  user: UserView | null
  onClose: () => void
  onDone: () => void
}) {
  const [confirmText, setConfirmText] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (user) setConfirmText('')
  }, [user])

  const submit = async () => {
    if (!user) return
    setSubmitting(true)
    try {
      await apiPost('/api/admin/users/delete', {
        userId: user.userId,
        deletedBy: ADMIN_USER_ID,
      })
      toast.success(`Deleted ${user.email}`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-rose-500/30 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Trash2 className="h-4 w-4 text-rose-400" /> Delete User
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            This is a soft-delete event. The user will be permanently marked as deleted.
          </DialogDescription>
        </DialogHeader>
        {user && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              <p className="font-mono text-[11px] text-rose-200">
                You are about to delete <span className="text-rose-100">{user.email}</span>. This action is recorded in the audit log.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
                Type <span className="text-rose-300">DELETE</span> to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-rose-500/30"
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200">Cancel</Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting || confirmText !== 'DELETE'}
            className="gap-1.5 border border-rose-500/40 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 hover:text-rose-100 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete Permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tab 3: Organizations ─────────────────────────────────────────────────────

function OrganizationsTab() {
  const [orgs, setOrgs] = React.useState<readonly OrganizationView[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [selectedOrg, setSelectedOrg] = React.useState<OrganizationView | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<ListResult<OrganizationView>>('/api/admin/organizations?limit=20')
      setOrgs(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load organizations')
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
        icon={Building2}
        title="Organizations"
        description="Manage organizations, their type, and membership."
        endpoint="GET /api/admin/organizations"
        action={
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="gap-1.5 border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:text-emerald-100"
          >
            <Plus className="h-3.5 w-3.5" /> New Organization
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-slate-800 bg-slate-900/40">
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <EmptyState icon={Building2} message="No organizations found. Create one to get started." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <Card
              key={org.organizationId}
              className="group cursor-pointer border-slate-800 bg-slate-900/40 py-4 ring-1 ring-inset ring-slate-800/60 transition-colors hover:border-emerald-500/40 hover:bg-slate-900/70"
              onClick={() => setSelectedOrg(org)}
            >
              <CardContent className="space-y-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10">
                      <Building2 className="h-3.5 w-3.5 text-cyan-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-zinc-100">{org.name}</p>
                      <p className="truncate font-mono text-[10px] text-slate-500">{org.slug}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-emerald-400" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-300">
                    {org.type}
                  </Badge>
                  {org.active ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] text-emerald-300">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-slate-600 bg-slate-800/40 font-mono text-[10px] text-slate-400">
                      Inactive
                    </Badge>
                  )}
                </div>
                <Separator className="bg-slate-800" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-slate-500" />
                    <MonoCell className="text-slate-300">{org.memberCount} member{org.memberCount === 1 ? '' : 's'}</MonoCell>
                  </div>
                  <MonoCell className="text-[10px] text-slate-600">{formatRelativeTime(org.createdAt)}</MonoCell>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateOrganizationDialog open={createOpen} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load() }} />
      <OrganizationMembersDialog org={selectedOrg} onClose={() => setSelectedOrg(null)} />
    </section>
  )
}

function CreateOrganizationDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = React.useState('')
  const [slug, setSlug] = React.useState('')
  const [type, setType] = React.useState<string>(ORG_TYPE_OPTIONS[0])
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName('')
      setSlug('')
      setType(ORG_TYPE_OPTIONS[0])
    }
  }, [open])

  const autoSlug = (val: string) => {
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
  }

  const submit = async () => {
    if (!name.trim() || !slug.trim()) {
      toast.error('Name and slug are required')
      return
    }
    setSubmitting(true)
    try {
      await apiPost('/api/admin/organizations/create', {
        name: name.trim(),
        slug: slug.trim(),
        type,
        createdById: ADMIN_USER_ID,
      })
      toast.success(`Created organization "${name.trim()}"`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Plus className="h-4 w-4 text-emerald-400" /> Create Organization
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Organizations group users and scopes. A type governs default policies.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="org-name" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => { setName(e.target.value); autoSlug(e.target.value) }}
              placeholder="Acme Studios"
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-slug" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-studios"
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 focus:ring-emerald-500/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-800 bg-slate-950 text-zinc-100">
                {ORG_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t} className="font-mono text-xs focus:bg-emerald-500/10 focus:text-emerald-300">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200">Cancel</Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting}
            className="gap-1.5 border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 hover:text-emerald-100"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OrganizationMembersDialog({
  org,
  onClose,
}: {
  org: OrganizationView | null
  onClose: () => void
}) {
  const [members, setMembers] = React.useState<OrgMemberView[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!org) {
      setMembers([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    apiGet<OrgMemberView[]>(`/api/admin/organizations/${org.organizationId}/members`)
      .then((data) => {
        if (!cancelled) setMembers([...data])
      })
      .catch((e) => {
        if (!cancelled) {
          setMembers([])
          setError(e instanceof Error ? e.message : 'Members endpoint unavailable')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [org])

  return (
    <Dialog open={!!org} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Building2 className="h-4 w-4 text-cyan-400" /> {org?.name}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {org && (
              <span className="font-mono">
                {org.slug} · {org.type} · {org.memberCount} member{org.memberCount === 1 ? '' : 's'}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {org && (
          <div className="space-y-3">
            <code className="block break-all rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[11px] text-cyan-300">
              {org.organizationId}
            </code>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <p className="font-mono text-[11px] text-amber-200">{error}. Showing recorded member count: {org.memberCount}.</p>
              </div>
            ) : members.length === 0 ? (
              <EmptyState icon={Users} message="No members projected yet for this organization." />
            ) : (
              <ScrollArea className="max-h-[40vh] pr-2">
                <div className="space-y-1.5">
                  {members.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
                      <div className="min-w-0">
                        <MonoCell className="text-emerald-200">{m.displayName || m.email || m.userId}</MonoCell>
                        {m.email && m.email !== m.displayName && (
                          <MonoCell className="block text-[10px] text-slate-500">{m.email}</MonoCell>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={m.status} />
                        <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-300">
                          {m.roleId}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Tab 4: Roles & Permissions ───────────────────────────────────────────────

function RolesPermissionsTab() {
  const [roles, setRoles] = React.useState<RoleData[]>([])
  const [permissions, setPermissions] = React.useState<PermissionData[]>([])
  const [loadingRoles, setLoadingRoles] = React.useState(true)
  const [loadingPerms, setLoadingPerms] = React.useState(true)
  const [rolesError, setRolesError] = React.useState<string | null>(null)
  const [permsError, setPermsError] = React.useState<string | null>(null)
  const [createRoleOpen, setCreateRoleOpen] = React.useState(false)
  const [createPermOpen, setCreatePermOpen] = React.useState(false)

  const loadRoles = React.useCallback(async () => {
    setLoadingRoles(true)
    setRolesError(null)
    try {
      const data = await apiGet<RoleData[]>('/api/admin/roles')
      setRoles([...data])
    } catch (e) {
      setRolesError(e instanceof Error ? e.message : 'Failed to load roles')
    } finally {
      setLoadingRoles(false)
    }
  }, [])

  const loadPerms = React.useCallback(async () => {
    setLoadingPerms(true)
    setPermsError(null)
    try {
      const data = await apiGet<PermissionData[]>('/api/admin/permissions')
      setPermissions([...data])
    } catch (e) {
      setPermsError(e instanceof Error ? e.message : 'Failed to load permissions')
    } finally {
      setLoadingPerms(false)
    }
  }, [])

  React.useEffect(() => {
    void loadRoles()
    void loadPerms()
  }, [loadRoles, loadPerms])

  const permsByResource = React.useMemo(() => {
    const map = new Map<string, PermissionData[]>()
    for (const p of permissions) {
      const arr = map.get(p.resource) ?? []
      arr.push(p)
      map.set(p.resource, arr)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [permissions])

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={Shield}
        title="Roles &amp; Permissions"
        description="Data-driven RBAC model — roles bundle permissions, permissions are scoped by resource+action."
        endpoint="GET /api/admin/roles · GET /api/admin/permissions"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Roles */}
        <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
                <Shield className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <CardTitle className="font-mono text-sm text-zinc-100">Roles ({roles.length})</CardTitle>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateRoleOpen(true)}
              className="h-7 gap-1 border-emerald-500/40 bg-emerald-500/10 px-2 text-[11px] text-emerald-300 hover:bg-emerald-500/20"
            >
              <Plus className="h-3 w-3" /> New Role
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {rolesError ? (
              <ErrorBanner message={rolesError} onRetry={() => void loadRoles()} />
            ) : loadingRoles ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : roles.length === 0 ? (
              <EmptyState icon={Shield} message="No roles defined." />
            ) : (
              roles.map((role) => (
                <div key={role.id} className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-emerald-400" />
                      <MonoCell className="text-emerald-200">{role.name}</MonoCell>
                      {role.isSystem && (
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 font-mono text-[9px] text-amber-300">
                          system
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-300">
                      {role.permissions.length} perms
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{role.description}</p>
                  <code className="mt-1 block truncate font-mono text-[10px] text-slate-600">{role.id}</code>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Permissions */}
        <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <CardTitle className="font-mono text-sm text-zinc-100">Permissions ({permissions.length})</CardTitle>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreatePermOpen(true)}
              className="h-7 gap-1 border-cyan-500/40 bg-cyan-500/10 px-2 text-[11px] text-cyan-300 hover:bg-cyan-500/20"
            >
              <Plus className="h-3 w-3" /> New Permission
            </Button>
          </CardHeader>
          <CardContent>
            {permsError ? (
              <ErrorBanner message={permsError} onRetry={() => void loadPerms()} />
            ) : loadingPerms ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : permissions.length === 0 ? (
              <EmptyState icon={ShieldCheck} message="No permissions defined." />
            ) : (
              <ScrollArea className="max-h-[480px] pr-2">
                <div className="space-y-3">
                  {permsByResource.map(([resource, perms]) => (
                    <div key={resource}>
                      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-cyan-400/80">{resource}</p>
                      <div className="space-y-1">
                        {perms.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/40 px-2.5 py-1.5">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <MonoCell className="text-cyan-300">{p.action}</MonoCell>
                                {p.isSystem && (
                                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 font-mono text-[9px] text-amber-300">
                                    system
                                  </Badge>
                                )}
                              </div>
                              <p className="truncate text-[10px] text-slate-500">{p.description}</p>
                            </div>
                            <code className="shrink-0 font-mono text-[9px] text-slate-600">{p.id}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateRoleDialog
        open={createRoleOpen}
        onClose={() => setCreateRoleOpen(false)}
        onDone={() => { setCreateRoleOpen(false); void loadRoles() }}
      />
      <CreatePermissionDialog
        open={createPermOpen}
        onClose={() => setCreatePermOpen(false)}
        onDone={() => { setCreatePermOpen(false); void loadPerms() }}
      />
    </section>
  )
}

function CreateRoleDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [permsRaw, setPermsRaw] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setPermsRaw('')
    }
  }, [open])

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Role name is required')
      return
    }
    const permissions = permsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    setSubmitting(true)
    try {
      await apiPost('/api/admin/roles/create', {
        name: name.trim(),
        description: description.trim(),
        permissions,
      })
      toast.success(`Created role "${name.trim()}"`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Plus className="h-4 w-4 text-emerald-400" /> Create Role
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            A role bundles permission IDs. Assign it to users to grant the union of its permissions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="role-name" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="content_moderator"
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-desc" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Description</Label>
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Moderates user-generated content"
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-perms" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
              Permissions (comma-separated IDs)
            </Label>
            <Textarea
              id="role-perms"
              value={permsRaw}
              onChange={(e) => setPermsRaw(e.target.value)}
              placeholder="perm_content_read, perm_content_delete"
              className="resize-none border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200">Cancel</Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting}
            className="gap-1.5 border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 hover:text-emerald-100"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreatePermissionDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [resource, setResource] = React.useState('')
  const [action, setAction] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setResource('')
      setAction('')
      setDescription('')
    }
  }, [open])

  const submit = async () => {
    if (!resource.trim() || !action.trim()) {
      toast.error('Resource and action are required')
      return
    }
    setSubmitting(true)
    try {
      await apiPost('/api/admin/permissions/create', {
        resource: resource.trim(),
        action: action.trim(),
        description: description.trim(),
      })
      toast.success(`Created permission ${resource.trim()}.${action.trim()}`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Plus className="h-4 w-4 text-cyan-400" /> Create Permission
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            A permission is a (resource, action) tuple that can be attached to roles.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="perm-resource" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Resource</Label>
              <Input
                id="perm-resource"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
                placeholder="game"
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perm-action" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Action</Label>
              <Input
                id="perm-action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="publish"
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500/30"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="perm-desc" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Description</Label>
            <Input
              id="perm-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Publish a new game"
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyan-500/30"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200">Cancel</Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting}
            className="gap-1.5 border border-cyan-500/40 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 hover:text-cyan-100"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create Permission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tab 5: API Keys ──────────────────────────────────────────────────────────

function ApiKeysTab() {
  const [keys, setKeys] = React.useState<ApiKeyView[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createdKey, setCreatedKey] = React.useState<CreateApiKeyResult | null>(null)
  const [disableTarget, setDisableTarget] = React.useState<ApiKeyView | null>(null)
  const [includeRevoked, setIncludeRevoked] = React.useState(true)

  const visibleKeys = React.useMemo(
    () => (includeRevoked ? keys : keys.filter((k) => k.active)),
    [keys, includeRevoked],
  )

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<ApiKeyView[]>(`/api/admin/api-keys?userId=${encodeURIComponent(ADMIN_USER_ID)}`)
      setKeys([...data])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API keys')
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
        icon={Key}
        title="API Keys"
        description="Long-lived credentials for service-to-service authentication. Plaintext is shown exactly once at creation."
        endpoint={`GET /api/admin/api-keys?userId=${ADMIN_USER_ID}`}
        action={
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="gap-1.5 border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:text-emerald-100"
          >
            <Plus className="h-3.5 w-3.5" /> New API Key
          </Button>
        }
      />

      <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2.5">
        <Switch
          checked={includeRevoked}
          onCheckedChange={setIncludeRevoked}
          className="data-[state=checked]:bg-emerald-500/60"
        />
        <Label htmlFor="include-revoked" className="cursor-pointer font-mono text-xs text-slate-300">
          {includeRevoked ? 'Showing all keys (active + revoked)' : 'Showing active keys only'}
        </Label>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-slate-800 bg-slate-900/40">
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : visibleKeys.length === 0 ? (
        <EmptyState icon={Key} message={includeRevoked ? 'No API keys issued. Create one to authenticate services.' : 'No active API keys.'} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleKeys.map((k) => (
            <Card key={k.id} className="border-slate-800 bg-slate-900/40 py-4 ring-1 ring-inset ring-slate-800/60">
              <CardContent className="space-y-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
                      <Key className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-mono text-sm text-zinc-100">{k.name}</p>
                      <button
                        onClick={() => copyToClipboard(k.keyPrefix)}
                        className="font-mono text-[10px] text-slate-500 transition-colors hover:text-emerald-300"
                        title="Copy prefix"
                      >
                        {k.keyPrefix}…
                      </button>
                    </div>
                  </div>
                  {k.active ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] text-emerald-300">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 font-mono text-[10px] text-rose-300">
                      Revoked
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {k.scopes.length === 0 ? (
                    <MonoCell className="text-[10px] text-slate-600">no scopes</MonoCell>
                  ) : (
                    k.scopes.map((s) => (
                      <Badge key={s} variant="outline" className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-300">
                        {s}
                      </Badge>
                    ))
                  )}
                </div>
                <Separator className="bg-slate-800" />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-slate-600">Created</p>
                    <MonoCell className="text-[10px] text-slate-400">{formatRelativeTime(k.createdAt)}</MonoCell>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-slate-600">Last Used</p>
                    <MonoCell className="text-[10px] text-slate-400">{formatRelativeTime(k.lastUsedAt)}</MonoCell>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-slate-600">Expires</p>
                    <MonoCell className="text-[10px] text-slate-400">{k.expiresAt ? formatRelativeTime(k.expiresAt) : 'never'}</MonoCell>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-slate-600">Last IP</p>
                    <MonoCell className="text-[10px] text-slate-400">{k.lastUsedIp || '—'}</MonoCell>
                  </div>
                </div>
                <code className="block truncate font-mono text-[9px] text-slate-600">{k.id}</code>
                {k.active && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDisableTarget(k)}
                    className="h-7 w-full gap-1 border-rose-500/40 bg-rose-500/10 text-[11px] text-rose-300 hover:bg-rose-500/20 hover:text-rose-200"
                  >
                    <Trash2 className="h-3 w-3" /> Disable Key
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateApiKeyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(result) => {
          setCreateOpen(false)
          setCreatedKey(result)
          void load()
        }}
      />
      <PlaintextKeyDialog result={createdKey} onClose={() => setCreatedKey(null)} />
      <DisableApiKeyDialog target={disableTarget} onClose={() => setDisableTarget(null)} onDone={() => { setDisableTarget(null); void load() }} />
    </section>
  )
}

function CreateApiKeyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (result: CreateApiKeyResult) => void
}) {
  const [name, setName] = React.useState('')
  const [scopesRaw, setScopesRaw] = React.useState('')
  const [expiresAt, setExpiresAt] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName('')
      setScopesRaw('')
      setExpiresAt('')
    }
  }, [open])

  const submit = async () => {
    if (!name.trim()) {
      toast.error('A key name is required')
      return
    }
    const scopes = scopesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    if (scopes.length === 0) {
      toast.error('At least one scope is required')
      return
    }
    setSubmitting(true)
    try {
      const result = await apiPost<CreateApiKeyResult>('/api/admin/api-keys/create', {
        userId: ADMIN_USER_ID,
        name: name.trim(),
        scopes,
        expiresAt: expiresAt.trim() || undefined,
      })
      toast.success('API key created')
      onCreated(result)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Plus className="h-4 w-4 text-emerald-400" /> Create API Key
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            The plaintext key will be shown once after creation. Store it securely.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="key-name" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">Name</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ci-deploy-key"
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key-scopes" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
              Scopes (comma-separated) <span className="text-rose-400">*</span>
            </Label>
            <Textarea
              id="key-scopes"
              value={scopesRaw}
              onChange={(e) => setScopesRaw(e.target.value)}
              placeholder="games:read, games:write"
              className="resize-none border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key-expiry" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
              Expiry (optional, ISO date)
            </Label>
            <Input
              id="key-expiry"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              placeholder="2026-01-01T00:00:00Z"
              className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200">Cancel</Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting}
            className="gap-1.5 border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 hover:text-emerald-100"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
            Generate Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlaintextKeyDialog({
  result,
  onClose,
}: {
  result: CreateApiKeyResult | null
  onClose: () => void
}) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (result) setCopied(false)
  }, [result])

  const handleCopy = () => {
    if (!result) return
    void navigator.clipboard.writeText(result.plaintextKey).then(() => {
      setCopied(true)
      toast.success('API key copied')
    })
  }

  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-emerald-500/40 bg-slate-950 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> Save Your API Key Now
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            This key will <span className="font-semibold text-amber-300">not be shown again</span>. Only a hashed copy is stored.
          </DialogDescription>
        </DialogHeader>
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <p className="font-mono text-[11px] text-amber-200">
                Copy the plaintext key below and store it in a secret manager. Closing this dialog removes it from view.
              </p>
            </div>
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">Plaintext Key</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md border border-emerald-500/30 bg-slate-900/60 px-3 py-2 font-mono text-xs text-emerald-300">
                  {result.plaintextKey}
                </code>
                <Button
                  size="sm"
                  onClick={handleCopy}
                  className="shrink-0 gap-1.5 border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 hover:text-emerald-100"
                >
                  {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DetailField label="Key ID" value={result.apiKeyId} accent />
              <DetailField label="Prefix" value={result.keyPrefix} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            size="sm"
            onClick={onClose}
            className="gap-1.5 border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 hover:text-emerald-100"
          >
            <CheckCircle className="h-3.5 w-3.5" /> I&apos;ve Saved It
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DisableApiKeyDialog({
  target,
  onClose,
  onDone,
}: {
  target: ApiKeyView | null
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (target) setReason('')
  }, [target])

  const submit = async () => {
    if (!target) return
    setSubmitting(true)
    try {
      await apiPost('/api/admin/api-keys/disable', {
        apiKeyId: target.id,
        reason: reason.trim() || 'Disabled via admin console',
      })
      toast.success(`Disabled key "${target.name}"`)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Disable failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Trash2 className="h-4 w-4 text-rose-400" /> Disable API Key
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            The key will be revoked immediately. Any service using it will fail to authenticate.
          </DialogDescription>
        </DialogHeader>
        {target && (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
              <MonoCell className="text-rose-200">{target.name}</MonoCell>
              <MonoCell className="text-[10px] text-slate-600">{target.keyPrefix}… · {target.id}</MonoCell>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="disable-reason" className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
                Reason (optional)
              </Label>
              <Input
                id="disable-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Rotating credentials"
                className="border-slate-700 bg-slate-900/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-rose-500/30"
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-200">Cancel</Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting}
            className="gap-1.5 border border-rose-500/40 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 hover:text-rose-100"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Disable Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tab 6: Audit Log ─────────────────────────────────────────────────────────

function AuditTab() {
  const [entries, setEntries] = React.useState<readonly AuditLogEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [actorId, setActorId] = React.useState('')
  const [targetType, setTargetType] = React.useState('')
  const [action, setAction] = React.useState('')
  const [fromDate, setFromDate] = React.useState('')
  const [toDate, setToDate] = React.useState('')
  const [detailEntry, setDetailEntry] = React.useState<AuditLogEntry | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (actorId.trim()) params.set('actorId', actorId.trim())
      if (targetType.trim()) params.set('targetType', targetType.trim())
      if (action.trim()) params.set('action', action.trim())
      if (fromDate) params.set('fromTimestamp', new Date(fromDate).toISOString())
      if (toDate) params.set('toTimestamp', new Date(toDate).toISOString())
      const data = await apiGet<AuditListResult>(`/api/admin/audit?${params.toString()}`)
      setEntries(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }, [actorId, targetType, action, fromDate, toDate])

  React.useEffect(() => {
    void load()
  }, [])

  const onFilter = () => void load()

  const onReset = () => {
    setActorId('')
    setTargetType('')
    setAction('')
    setFromDate('')
    setToDate('')
    setTimeout(() => void load(), 0)
  }

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={FileText}
        title="Audit Log"
        description="Append-only trail of every privileged action across the identity domain."
        endpoint="GET /api/admin/audit"
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => void load()}
            className="border-slate-700 bg-slate-900/60 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300"
          >
            <RefreshCw className="mr-1.5 h-3 w-3" /> Refresh
          </Button>
        }
      />

      {/* Filters */}
      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-wide text-slate-500">Actor ID</Label>
            <Input
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              placeholder="user_…"
              className="border-slate-700 bg-slate-950/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-wide text-slate-500">Target Type</Label>
            <Input
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              placeholder="User, ApiKey…"
              className="border-slate-700 bg-slate-950/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-wide text-slate-500">Action</Label>
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="user.suspend…"
              className="border-slate-700 bg-slate-950/60 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-wide text-slate-500">From</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border-slate-700 bg-slate-950/60 font-mono text-xs text-slate-200 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-wide text-slate-500">To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border-slate-700 bg-slate-950/60 font-mono text-xs text-slate-200 focus-visible:ring-emerald-500/30"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={onFilter} className="flex-1 gap-1.5 border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25">
              <Search className="h-3 w-3" /> Filter
            </Button>
            <Button size="sm" variant="ghost" onClick={onReset} className="text-slate-400 hover:text-slate-200">
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="pl-4 text-slate-400">Timestamp</TableHead>
                  <TableHead className="text-slate-400">Action</TableHead>
                  <TableHead className="text-slate-400">Actor</TableHead>
                  <TableHead className="text-slate-400">Target Type</TableHead>
                  <TableHead className="text-slate-400">Target ID</TableHead>
                  <TableHead className="pr-4 text-slate-400">IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <>
                    <LoadingRow cols={6} />
                    <LoadingRow cols={6} />
                    <LoadingRow cols={6} />
                  </>
                ) : entries.length === 0 ? (
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableCell colSpan={6} className="py-10">
                      <EmptyState icon={FileText} message="No audit entries match the current filters." />
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => (
                    <TableRow
                      key={entry.id}
                      onClick={() => setDetailEntry(entry)}
                      className="cursor-pointer border-slate-800/60 hover:bg-slate-800/20"
                    >
                      <TableCell className="pl-4">
                        <MonoCell className="text-slate-400">{formatRelativeTime(entry.timestamp)}</MonoCell>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-300">
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <MonoCell className="text-emerald-200">{entry.actorId}</MonoCell>
                          <MonoCell className="text-[10px] text-slate-600">{entry.actorType}</MonoCell>
                        </div>
                      </TableCell>
                      <TableCell><MonoCell className="text-slate-300">{entry.targetType}</MonoCell></TableCell>
                      <TableCell><MonoCell className="text-slate-400">{entry.targetId}</MonoCell></TableCell>
                      <TableCell className="pr-4"><MonoCell className="text-slate-500">{entry.ipAddress || '—'}</MonoCell></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AuditDetailDialog entry={detailEntry} onClose={() => setDetailEntry(null)} />
    </section>
  )
}

function AuditDetailDialog({ entry, onClose }: { entry: AuditLogEntry | null; onClose: () => void }) {
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-slate-800 bg-slate-950 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <FileText className="h-4 w-4 text-emerald-400" /> Audit Entry
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Immutable record of a privileged action.
          </DialogDescription>
        </DialogHeader>
        {entry && (
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Action" value={entry.action} accent />
                <DetailField label="Timestamp" value={formatRelativeTime(entry.timestamp)} />
                <DetailField label="Actor ID" value={entry.actorId} />
                <DetailField label="Actor Type" value={entry.actorType} />
                <DetailField label="Target Type" value={entry.targetType} />
                <DetailField label="Target ID" value={entry.targetId} />
                <DetailField label="IP Address" value={entry.ipAddress || '—'} />
                <DetailField label="Correlation ID" value={entry.correlationId || '—'} />
              </div>
              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">Entry ID</p>
                <code className="block break-all rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[11px] text-cyan-300">
                  {entry.id}
                </code>
              </div>
              {entry.userAgent && (
                <div>
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">User Agent</p>
                  <code className="block break-all rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 font-mono text-[10px] text-slate-400">
                    {entry.userAgent}
                  </code>
                </div>
              )}
              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">Metadata</p>
                <pre className="overflow-x-auto rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-2 font-mono text-[10px] text-slate-300">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Tab 7: Architecture Info ─────────────────────────────────────────────────

function ArchitectureTab() {
  const [arch, setArch] = React.useState<ArchitectureResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<ArchitectureResponse>('/api/architecture')
      setArch(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load architecture')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const counts = [
    { label: 'Commands', value: arch?.commandTypes.length, icon: Shield, accent: 'text-emerald-300' },
    { label: 'Queries', value: arch?.queryTypes.length, icon: Search, accent: 'text-cyan-300' },
    { label: 'Events', value: arch?.eventTypes.length, icon: Layers, accent: 'text-emerald-300' },
    { label: 'Bindings', value: arch?.bindings.length, icon: Building2, accent: 'text-cyan-300' },
  ]

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={Layers}
        title="Identity Domain Architecture"
        description="The bounded context backing this console — value objects, aggregates, events, repositories, and the authorization engine."
        endpoint="GET /api/architecture"
      />

      {/* Counts */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.label} className="border-slate-800 bg-slate-900/40 py-4 ring-1 ring-inset ring-slate-800/60">
              <CardContent className="px-4">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{c.label}</p>
                  <Icon className="h-3.5 w-3.5 text-slate-600" />
                </div>
                {loading ? (
                  <Skeleton className="mt-1.5 h-7 w-12" />
                ) : (
                  <p className={`mt-1 font-mono text-2xl font-bold ${c.accent}`}>{c.value ?? 0}</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Value Objects */}
        <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
                <Layers className="h-3 w-3 text-emerald-400" />
              </div>
              Value Objects
            </CardTitle>
            <CardDescription className="text-xs">Invariants enforced at construction.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {IDENTITY_VALUE_OBJECTS.map((vo) => (
                <Badge key={vo} variant="outline" className="border-slate-700 bg-slate-950/60 font-mono text-[10px] text-slate-300">
                  {vo}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Aggregates */}
        <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10">
                <Building2 className="h-3 w-3 text-cyan-400" />
              </div>
              Aggregates
            </CardTitle>
            <CardDescription className="text-xs">Consistency boundaries and transaction roots.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {IDENTITY_AGGREGATES.map((a) => (
              <div key={a.name} className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2">
                <MonoCell className="text-cyan-300">{a.name}</MonoCell>
                <p className="mt-0.5 text-[11px] text-slate-400">{a.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Events */}
        <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
                <Clock className="h-3 w-3 text-emerald-400" />
              </div>
              Domain Events
              <Badge variant="outline" className="ml-1 border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300">
                {IDENTITY_EVENTS.length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">Emitted by aggregates, persisted to the event store, projected to read models.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[280px] pr-2">
              <div className="flex flex-wrap gap-1.5">
                {IDENTITY_EVENTS.map((ev) => (
                  <Badge key={ev} variant="outline" className="border-emerald-500/20 bg-emerald-500/5 font-mono text-[10px] text-emerald-200">
                    {ev}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Repositories */}
        <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10">
                <FileText className="h-3 w-3 text-cyan-400" />
              </div>
              Repositories
            </CardTitle>
            <CardDescription className="text-xs">Domain contracts; implemented by infrastructure adapters.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {IDENTITY_REPOSITORIES.map((r) => (
                <div key={r} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/40 px-2.5 py-1.5">
                  <ShieldCheck className="h-3 w-3 text-cyan-400" />
                  <MonoCell className="text-cyan-200">{r}</MonoCell>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Authorization Engine */}
        <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60 lg:col-span-2">
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
              </div>
              Authorization Engine
            </CardTitle>
            <CardDescription className="text-xs">
              Hybrid RBAC + ABAC policy engine wired into the application authorization pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3">
              {AUTHZ_ENGINE_CLASSES.map((c) => (
                <div key={c.name} className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2.5">
                  <MonoCell className="text-emerald-200">{c.name}</MonoCell>
                  <p className="mt-1 text-[11px] text-slate-400">{c.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Command & Query registries */}
      {arch && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
            <CardHeader className="gap-1 pb-3">
              <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
                <Shield className="h-3.5 w-3.5 text-emerald-400" /> Registered Commands
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300">
                  {arch.commandTypes.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[320px] pr-2">
                <div className="flex flex-wrap gap-1.5">
                  {arch.commandTypes.map((c) => (
                    <Badge key={c} variant="outline" className="border-slate-700 bg-slate-950/60 font-mono text-[10px] text-emerald-200">
                      {c}
                    </Badge>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          <Card className="border-slate-800 bg-slate-900/40 ring-1 ring-inset ring-slate-800/60">
            <CardHeader className="gap-1 pb-3">
              <CardTitle className="flex items-center gap-2 font-mono text-sm text-zinc-100">
                <Search className="h-3.5 w-3.5 text-cyan-400" /> Registered Queries
                <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 font-mono text-[10px] text-cyan-300">
                  {arch.queryTypes.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[320px] pr-2">
                <div className="flex flex-wrap gap-1.5">
                  {arch.queryTypes.map((q) => (
                    <Badge key={q} variant="outline" className="border-slate-700 bg-slate-950/60 font-mono text-[10px] text-cyan-200">
                      {q}
                    </Badge>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}
