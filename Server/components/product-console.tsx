"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  clearServerSession,
  fetchTargets,
  restoreServerSession,
  type Session,
  type Target,
} from "@/lib/client"
import { randomSession } from "@/lib/gateway"
import {
  auditEvents,
  changes,
  metrics,
  product,
  prompts,
  resources,
  runs,
  type ProductResource,
  type ResourceStatus,
} from "@/lib/product-data"
import { ConnectScreen } from "./connect-screen"
import { AgentConversation } from "./agent-conversation"
import {
  ActivityIcon,
  ClockIcon,
  FileTextIcon,
  HistoryIcon,
  LayersIcon,
  LogoutIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  ServerIcon,
  ShieldIcon,
  TerminalIcon,
} from "./icons"
import { TargetSwitcher } from "./target-switcher"

type ConsoleTab = "agent" | "resources" | "runs" | "changes" | "audit"

const tabs: { id: ConsoleTab; label: string; icon: typeof ActivityIcon }[] = [
  { id: "agent", label: "Agent", icon: TerminalIcon },
  { id: "resources", label: product.resourceLabel, icon: ServerIcon },
  { id: "runs", label: product.runLabel, icon: ActivityIcon },
  { id: "changes", label: product.changeLabel, icon: FileTextIcon },
  { id: "audit", label: "审计", icon: HistoryIcon },
]

export function ProductConsole() {
  const [session, setSession] = useState<Session | null>(null)
  const [defaultGateway, setDefaultGateway] = useState("default")
  const [targets, setTargets] = useState<Target[]>([])
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null)
  const [targetLoading, setTargetLoading] = useState(false)
  const [targetError, setTargetError] = useState("")
  const [tab, setTab] = useState<ConsoleTab>("agent")
  const [query, setQuery] = useState("")
  const [selectedResourceId, setSelectedResourceId] = useState(resources[0]?.id || "")
  const [sessionId, setSessionId] = useState(randomSession(product.sessionPrefix))
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const savedGateway = localStorage.getItem(`${product.sessionPrefix}.gateway`)
    if (savedGateway) setDefaultGateway(savedGateway)
    let canceled = false
    restoreServerSession()
      .then((restored) => {
        if (!canceled && restored) setSession(restored)
      })
      .catch(() => undefined)
    return () => {
      canceled = true
    }
  }, [])

  const refreshTargets = useCallback(async () => {
    if (!session) return
    setTargetLoading(true)
    setTargetError("")
    try {
      const nextTargets = await fetchTargets(session)
      setTargets(nextTargets)
      setSelectedTarget((current) => {
        if (current) {
          const stillOnline = nextTargets.find((target) => target.key === current.key)
          if (stillOnline) return stillOnline
        }
        return nextTargets[0] || null
      })
    } catch (error) {
      setTargetError((error as Error).message)
      setTargets([])
      setSelectedTarget(null)
    } finally {
      setTargetLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (!session) return
    refreshTargets()
    const id = window.setInterval(refreshTargets, 10000)
    return () => window.clearInterval(id)
  }, [session, refreshTargets])

  const filteredResources = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return resources
    return resources.filter((item) =>
      [item.name, item.endpoint, item.owner, item.kind, item.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q),
    )
  }, [query])

  const selectedResource =
    filteredResources.find((item) => item.id === selectedResourceId) || filteredResources[0] || resources[0]

  function handleConnected(nextSession: Session) {
    localStorage.setItem(`${product.sessionPrefix}.gateway`, nextSession.gateway)
    setSession(nextSession)
  }

  async function logout() {
    setTargetError("")
    try {
      await clearServerSession()
    } catch (error) {
      setTargetError((error as Error).message)
      return
    }
    setSession(null)
    setTargets([])
    setSelectedTarget(null)
  }

  function selectTarget(target: Target) {
    setSelectedTarget(target)
    setSessionId(randomSession(product.sessionPrefix))
    setTab("agent")
  }

  async function refreshAll() {
    setRefreshing(true)
    await refreshTargets()
    window.setTimeout(() => setRefreshing(false), 400)
  }

  if (!session) {
    return <ConnectScreen defaultGateway={defaultGateway} onConnected={handleConnected} />
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ShieldIcon width={16} height={16} />
          </div>
          <span className="hidden truncate text-sm font-semibold text-foreground sm:inline">
            {product.name} Console
          </span>
          <TargetSwitcher
            targets={targets}
            selected={selectedTarget}
            onSelect={selectTarget}
            onRefresh={refreshTargets}
            loading={targetLoading}
          />
          <div className="ml-1 hidden shrink-0 rounded-lg border bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground md:block">
            {selectedTarget ? selectedTarget.cluster : product.sessionPrefix}
          </div>
          <div className="ml-1 flex shrink-0 items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5 sm:ml-2">
            <button className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
              控制台
            </button>
            <button className="flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <TerminalIcon width={13} height={13} />
              智能体
            </button>
            <button className="flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              <LayersIcon width={13} height={13} />
              结构化记录
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {session.username && <span className="hidden text-xs text-muted-foreground sm:inline">{session.username}</span>}
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshIcon width={14} height={14} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">刷新</span>
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
          >
            <LogoutIcon width={14} height={14} />
            <span className="hidden sm:inline">断开</span>
          </button>
        </div>
      </header>

      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b bg-card px-2">
        {tabs.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon width={16} height={16} />
              {item.label}
            </button>
          )
        })}
      </nav>

      {targetError && (
        <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{targetError}</div>
      )}

      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-4">
            <HeroSummary onRunAgent={() => setTab("agent")} disabled={!selectedTarget} />
            {tab === "agent" && (
              <AgentConversation
                session={session}
                target={selectedTarget}
                sessionId={sessionId}
                onSessionChange={setSessionId}
                sessionPrefix={product.sessionPrefix}
                title={product.agentName}
                hint={product.agentHint}
                initialInstruction={prompts[0]?.text || ""}
                promptTemplates={prompts}
                buildInstruction={(text) => `${product.agentInstruction}

当前控制台上下文：
- 产品：${product.name}
- 当前对象：${selectedResource?.name || "未选择"}
- 当前对象端点：${selectedResource?.endpoint || "无"}
- 操作约束：先解释计划和风险，需要变更时用用户能看懂的语言确认，不要只让用户确认命令或 SQL。

用户请求：
${text}`}
              />
            )}
            {tab === "resources" && (
              <ResourceTable
                query={query}
                onQueryChange={setQuery}
                resources={filteredResources}
                selectedId={selectedResource?.id}
                onSelect={(resource) => setSelectedResourceId(resource.id)}
              />
            )}
            {tab === "runs" && <RunTimeline />}
            {tab === "changes" && <ChangeLedger />}
            {tab === "audit" && <AuditPanel />}
          </section>

          <aside className="space-y-4">
            <ResourceDetail resource={selectedResource} />
            <RunTimeline compact />
          </aside>
        </div>
      </main>
    </div>
  )
}

function HeroSummary({ onRunAgent, disabled }: { onRunAgent: () => void; disabled: boolean }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{product.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{product.description}</p>
        </div>
        <button
          onClick={onRunAgent}
          disabled={disabled}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SendIcon width={15} height={15} />
          交给 Agent
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border bg-background p-3">
            <div className="text-xs text-muted-foreground">{metric.label}</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{metric.hint}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ResourceTable({
  query,
  onQueryChange,
  resources: rows,
  selectedId,
  onSelect,
}: {
  query: string
  onQueryChange: (value: string) => void
  resources: ProductResource[]
  selectedId?: string
  onSelect: (resource: ProductResource) => void
}) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{product.resourceLabel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">所有对象都以结构化记录维护，Agent 执行时会引用这些上下文。</p>
        </div>
        <label className="relative w-full sm:w-72">
          <SearchIcon width={15} height={15} className="absolute left-3 top-2.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索名称、端点、负责人"
            className="input w-full pl-9"
          />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">名称</th>
              <th className="px-4 py-3 text-left font-medium">类型</th>
              <th className="px-4 py-3 text-left font-medium">端点</th>
              <th className="px-4 py-3 text-left font-medium">状态</th>
              <th className="px-4 py-3 text-left font-medium">负责人</th>
              <th className="px-4 py-3 text-right font-medium">风险/待办</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((resource) => (
              <tr
                key={resource.id}
                onClick={() => onSelect(resource)}
                className={`cursor-pointer border-t transition-colors hover:bg-muted/40 ${
                  selectedId === resource.id ? "bg-primary/10" : ""
                }`}
              >
                <td className="px-4 py-3 font-medium text-foreground">{resource.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{resource.kind}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{resource.endpoint}</td>
                <td className="px-4 py-3">
                  <StatusPill status={resource.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{resource.owner}</td>
                <td className="px-4 py-3 text-right text-foreground">{resource.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">
          没有匹配的记录。可以让 Agent 从项目文档、配置或目标机器上自动发现并导入。
        </div>
      )}
    </section>
  )
}

function ResourceDetail({ resource }: { resource?: ProductResource }) {
  if (!resource) {
    return (
      <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        还没有可展示的对象。
      </section>
    )
  }
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{resource.name}</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{resource.endpoint}</p>
        </div>
        <StatusPill status={resource.status} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="类型" value={resource.kind} />
        <Field label="负责人" value={resource.owner} />
        <Field label="风险/待办" value={resource.risk} />
        <Field label="最近执行" value={resource.lastRun} />
      </div>
      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-muted-foreground">上下文标签</div>
        <div className="flex flex-wrap gap-2">
          {resource.tags.map((tag) => (
            <span key={tag} className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-lg border bg-background p-3 text-sm leading-6 text-muted-foreground">
        {resource.note}
      </div>
    </section>
  )
}

function RunTimeline({ compact = false }: { compact?: boolean }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b p-4">
        <h2 className="text-base font-semibold text-foreground">{product.runLabel}</h2>
      </div>
      <div className={compact ? "p-3" : "p-4"}>
        <div className="space-y-3">
          {runs.slice(0, compact ? 4 : runs.length).map((run) => (
            <div key={run.id} className="rounded-lg border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{run.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{run.scope}</div>
                </div>
                <StatusPill status={run.status} />
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <ClockIcon width={13} height={13} />
                {run.time}
                <span>{run.operator}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ChangeLedger() {
  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b p-4">
        <h2 className="text-base font-semibold text-foreground">{product.changeLabel}</h2>
        <p className="mt-1 text-sm text-muted-foreground">变更必须保留用户可读说明、执行证据和回滚点。</p>
      </div>
      <div className="divide-y">
        {changes.map((change) => (
          <div key={change.id} className="grid gap-2 p-4 md:grid-cols-[120px_1fr_120px]">
            <div className="font-mono text-xs text-muted-foreground">{change.id}</div>
            <div>
              <div className="text-sm font-medium text-foreground">{change.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{change.summary}</div>
            </div>
            <div className="text-left md:text-right">
              <StatusPill status={change.status} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AuditPanel() {
  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b p-4">
        <h2 className="text-base font-semibold text-foreground">审计</h2>
      </div>
      <div className="divide-y">
        {auditEvents.map((event) => (
          <div key={event.id} className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <HistoryIcon width={14} height={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground">{event.action}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {event.actor} · {event.target} · {event.time}
              </div>
            </div>
            <StatusPill status={event.status} />
          </div>
        ))}
      </div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: ResourceStatus }) {
  const style =
    status === "healthy" || status === "approved" || status === "success"
      ? "border-success/40 bg-success/10 text-success"
      : status === "warning" || status === "review" || status === "pending"
        ? "border-warning/40 bg-warning/10 text-warning"
        : status === "blocked" || status === "failed" || status === "critical"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground"
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${style}`}>{statusLabel(status)}</span>
}

function statusLabel(status: ResourceStatus): string {
  const labels: Record<ResourceStatus, string> = {
    healthy: "正常",
    warning: "关注",
    critical: "高危",
    pending: "待确认",
    approved: "已确认",
    review: "待复核",
    blocked: "已阻断",
    failed: "失败",
    success: "成功",
  }
  return labels[status] || status
}
