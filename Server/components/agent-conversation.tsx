"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import { callTool, extractText, type Session, type Target } from "@/lib/client"
import { randomSession, TOOLS } from "@/lib/gateway"
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  PlusIcon,
  SendIcon,
  ServerIcon,
  StopIcon,
  TerminalIcon,
} from "./icons"

export interface AgentPromptTemplate {
  label: string
  text: string
}

interface Turn {
  id: string
  user: string
  process: string
  answer: string
  reportPath?: string
  error?: string
  running: boolean
  elapsed?: number
}

interface AgentChannelStatus {
  name?: string
  status?: "ok" | "error" | "unknown" | string
  message?: string
}

interface AgentMessage {
  role?: string
  content?: unknown
}

interface AgentHistory {
  sessionId?: string
  source?: string
  messageCount?: number
  messages?: AgentMessage[]
}

interface AgentMetadata {
  source?: string
  status?: "connected" | "configured" | "unconfigured" | "unavailable" | string
  provider?: string
  model?: string
  models?: string[]
  channels?: AgentChannelStatus[]
  metadata?: {
    provider?: string
    model?: string
    models?: string[]
  }
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text
          return typeof text === "string" ? text : ""
        }
        if (item && typeof item === "object" && "content" in item) {
          return messageText((item as { content?: unknown }).content)
        }
        return ""
      })
      .filter(Boolean)
      .join("\n")
  }
  if (content && typeof content === "object" && "text" in content) {
    const text = (content as { text?: unknown }).text
    return typeof text === "string" ? text : ""
  }
  return ""
}

function historyToTurns(history: AgentHistory): Turn[] {
  const messages = Array.isArray(history.messages) ? history.messages : []
  const turns: Turn[] = []
  let pendingUser: string | null = null

  for (const msg of messages) {
    const role = typeof msg.role === "string" ? msg.role : ""
    const text = messageText(msg.content).trim()
    if (!text || role === "system" || role === "tool") continue
    if (role === "user") {
      if (pendingUser) {
        turns.push({
          id: `history-${turns.length}`,
          user: pendingUser,
          process: "",
          answer: "",
          running: false,
        })
      }
      pendingUser = text
      continue
    }
    if (role === "assistant") {
      const parsed = assistantTextAndReport(text)
      if (pendingUser) {
        turns.push({
          id: `history-${turns.length}`,
          user: pendingUser,
          process: "",
          answer: parsed.answer,
          reportPath: parsed.reportPath,
          running: false,
        })
        pendingUser = null
      } else {
        turns.push({
          id: `history-${turns.length}`,
          user: "历史对话",
          process: "",
          answer: parsed.answer,
          reportPath: parsed.reportPath,
          running: false,
        })
      }
    }
  }

  if (pendingUser) {
    turns.push({
      id: `history-${turns.length}`,
      user: pendingUser,
      process: "",
      answer: "",
      running: false,
    })
  }

  return turns
}

function assistantTextAndReport(text: string): { answer: string; reportPath?: string } {
  const reportPath = extractReportPath(text)
  const answer = reportPath
    ? text
        .split("\n")
        .filter((line) => !line.includes(reportPath))
        .join("\n")
        .trim()
    : text.trim()
  return { answer, reportPath }
}

function latestAssistantFromHistory(history: AgentHistory): { answer: string; reportPath?: string } | null {
  const messages = Array.isArray(history.messages) ? history.messages : []
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    const text = messageText(msg.content).trim()
    if (!text) continue
    return assistantTextAndReport(text)
  }
  return null
}

function isOperationCompleteText(text: string): boolean {
  return /^operation complete\.?$/i.test(text.trim())
}

function appendProcessLine(process: string, line: string): string {
  const text = line.trim()
  if (!text) return process
  return process ? `${process}\n${text}` : text
}

function extractReportPath(text: string): string | undefined {
  const idx = text.indexOf("/root/ws/")
  if (idx < 0) return undefined
  const rest = text.slice(idx)
  const match = rest.match(/^\/root\/ws\/\S+\.(?:html|md|json|pdf)/)
  return match?.[0]?.replace(/[，,。；;）)\]}>]+$/, "")
}

function metadataModelLabel(meta: AgentMetadata): string {
  const provider = meta.provider || meta.metadata?.provider
  const model = meta.model || meta.metadata?.model
  if (provider && model && !model.startsWith(`${provider}/`)) return `${provider}/${model}`
  return model || provider || ""
}

function normalizeChannelStatus(channels: AgentChannelStatus[] | undefined): AgentChannelStatus[] {
  return Array.isArray(channels) ? channels.filter((c) => c && typeof c.name === "string") : []
}

function metadataIsConnected(meta: AgentMetadata, model: string, channels: AgentChannelStatus[]): boolean {
  if (!model) return false
  if (meta.status === "connected") return true
  if (meta.status === "configured") return !channels.some((c) => c.status === "error")
  if (meta.status === "unconfigured" || meta.status === "unavailable") return false
  return channels.length === 0 || !channels.some((c) => c.status === "error")
}

function channelLabel(name?: string): string {
  if (name === "acp") return "ACP"
  if (name === "model") return "模型"
  if (name === "tool") return "工具"
  return name || "通道"
}

function statusLabel(status?: string): string {
  if (status === "ok") return "正常"
  if (status === "error") return "异常"
  if (status === "unknown") return "未知"
  return status || "未知"
}

export function AgentConversation({
  session,
  target,
  sessionId,
  onSessionChange,
  sessionPrefix,
  title,
  hint,
  initialInstruction,
  promptTemplates,
  buildInstruction,
}: {
  session: Session
  target: Target | null
  sessionId: string
  onSessionChange: (value: string) => void
  sessionPrefix: string
  title: string
  hint: string
  initialInstruction: string
  promptTemplates: AgentPromptTemplate[]
  buildInstruction: (input: string) => string
}) {
  const [instruction, setInstruction] = useState(initialInstruction)
  const [turns, setTurns] = useState<Turn[]>([])
  const [running, setRunning] = useState(false)
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [modelStatus, setModelStatus] = useState<"loading" | "connected" | "unconfigured">("loading")
  const [modelChannels, setModelChannels] = useState<AgentChannelStatus[]>([])
  const [modelStatusText, setModelStatusText] = useState("")
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "empty" | "error">("loading")
  const [historyError, setHistoryError] = useState("")
  const [openProcess, setOpenProcess] = useState<Record<string, boolean>>({})
  const [copiedTurnId, setCopiedTurnId] = useState("")
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setInstruction(initialInstruction)
  }, [initialInstruction])

  useEffect(() => {
    if (!target) {
      setActiveModel(null)
      setModelChannels([])
      setModelStatusText("")
      setModelStatus("unconfigured")
      return
    }
    let cancelled = false
    let buf = ""
    setModelStatus("loading")
    setActiveModel(null)
    setModelChannels([])
    setModelStatusText("")
    callTool(
      session,
      {
        cluster: target.cluster,
        instance: target.instance,
        tool: TOOLS.prompt,
        arguments: { session_id: sessionId, mode: "metadata" },
      },
      (ev) => {
        if (ev.type === "output") buf += ev.data
        else if (ev.type === "result") buf += extractText(ev.result)
        else if (ev.type === "error") setModelStatusText(ev.error)
      },
    )
      .then(() => {
        if (cancelled) return
        try {
          const meta = JSON.parse(buf || "{}") as AgentMetadata
          const model = metadataModelLabel(meta)
          const channels = normalizeChannelStatus(meta.channels)
          setModelChannels(channels)
          setModelStatusText(channels.find((c) => c.status === "error")?.message || "")
          if (metadataIsConnected(meta, model, channels)) {
            setActiveModel(model)
            setModelStatus("connected")
          } else {
            setActiveModel(model || null)
            setModelStatus("unconfigured")
          }
        } catch {
          setModelStatusText("无法解析 doagent metadata")
          setModelStatus("unconfigured")
        }
      })
      .catch(() => {
        if (!cancelled) {
          setModelStatusText("无法读取 doagent metadata")
          setModelStatus("unconfigured")
        }
      })
    return () => {
      cancelled = true
    }
  }, [session, target?.cluster, target?.instance, sessionId])

  useEffect(() => {
    if (!target) {
      setTurns([])
      setHistoryStatus("empty")
      setHistoryError("")
      return
    }
    let cancelled = false
    let buf = ""
    setHistoryStatus("loading")
    setHistoryError("")
    callTool(
      session,
      {
        cluster: target.cluster,
        instance: target.instance,
        tool: TOOLS.prompt,
        arguments: { session_id: sessionId, mode: "history" },
      },
      (ev) => {
        if (ev.type === "output") buf += ev.data
        else if (ev.type === "result") buf += extractText(ev.result)
        else if (ev.type === "error") setHistoryError(ev.error)
      },
    )
      .then(() => {
        if (cancelled) return
        try {
          const restored = historyToTurns(JSON.parse(buf || "{}") as AgentHistory)
          setTurns(restored)
          setHistoryStatus(restored.length > 0 ? "ready" : "empty")
        } catch (error) {
          setTurns([])
          setHistoryStatus("error")
          setHistoryError((error as Error).message)
        }
      })
      .catch((error) => {
        if (cancelled) return
        setTurns([])
        setHistoryStatus("error")
        setHistoryError((error as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [session, target?.cluster, target?.instance, sessionId])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" })
  }, [turns])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`
  }, [instruction])

  const patchLast = useCallback((fn: (turn: Turn) => Turn) => {
    setTurns((current) => {
      if (current.length === 0) return current
      const next = current.slice()
      next[next.length - 1] = fn(next[next.length - 1])
      return next
    })
  }, [])

  async function run() {
    const text = instruction.trim()
    if (!text || !target || running || modelStatus !== "connected") return
    setInstruction("")
    setRunning(true)
    setHistoryStatus("ready")
    const started = Date.now()
    const ac = new AbortController()
    abortRef.current = ac
    const turnId = crypto.randomUUID()
    setOpenProcess((current) => ({ ...current, [turnId]: true }))
    setTurns((current) => [
      ...current,
      { id: turnId, user: text, process: "", answer: "", running: true },
    ])
    try {
      await callTool(
        session,
        {
          cluster: target.cluster,
          instance: target.instance,
          tool: TOOLS.prompt,
          arguments: { session_id: sessionId, instruction: buildInstruction(text) },
          signal: ac.signal,
        },
        (ev) => {
          if (ev.type === "open") {
            patchLast((turn) => ({ ...turn, process: appendProcessLine(turn.process, "gateway · rpc opened") }))
          } else if (ev.type === "output" && ev.kind === "assistant_delta") {
            patchLast((turn) => ({ ...turn, answer: turn.answer + ev.data }))
          } else if (ev.type === "output" && ev.kind === "tool") {
            const tool = ev.tool || ev.data.replace(/^\[tool:|\]$/g, "") || "tool"
            const status = ev.status === "in_progress" ? "执行中" : ev.status || "事件"
            patchLast((turn) => ({ ...turn, process: appendProcessLine(turn.process, `${tool} · ${status}`) }))
          } else if (ev.type === "output" && ev.kind === "report") {
            const reportPath = ev.path || ev.data.replace(/^report:\s*/, "")
            patchLast((turn) => ({
              ...turn,
              reportPath,
              process: appendProcessLine(turn.process, `report · ${reportPath}`),
            }))
          } else if (ev.type === "output" && ev.kind === "error") {
            patchLast((turn) => ({ ...turn, error: ev.data }))
          } else if (ev.type === "output") {
            patchLast((turn) => ({ ...turn, process: appendProcessLine(turn.process, ev.data) }))
          } else if (ev.type === "result") {
            const result = extractText(ev.result)
            if (result && !isOperationCompleteText(result)) {
              patchLast((turn) => ({ ...turn, answer: turn.answer || result }))
            }
          } else if (ev.type === "error") {
            patchLast((turn) => ({ ...turn, error: ev.error }))
          }
        },
      )
      let historyBuf = ""
      await callTool(
        session,
        {
          cluster: target.cluster,
          instance: target.instance,
          tool: TOOLS.prompt,
          arguments: { session_id: sessionId, mode: "history" },
          signal: ac.signal,
        },
        (ev) => {
          if (ev.type === "output") historyBuf += ev.data
          else if (ev.type === "result") historyBuf += extractText(ev.result)
        },
      )
      if (historyBuf.trim()) {
        const finalFromHistory = latestAssistantFromHistory(JSON.parse(historyBuf) as AgentHistory)
        if (finalFromHistory) {
          patchLast((turn) => ({
            ...turn,
            answer: finalFromHistory.answer || turn.answer,
            reportPath: finalFromHistory.reportPath || turn.reportPath,
          }))
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        patchLast((turn) => ({ ...turn, error: (error as Error).message }))
      }
    } finally {
      patchLast((turn) => ({ ...turn, running: false, elapsed: Math.round((Date.now() - started) / 1000) }))
      setRunning(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  function newConversation() {
    abortRef.current?.abort()
    setTurns([])
    setHistoryStatus("empty")
    setHistoryError("")
    setInstruction("")
    onSessionChange(randomSession(sessionPrefix))
    requestAnimationFrame(() => taRef.current?.focus())
  }

  function useQuick(text: string) {
    setInstruction(text)
    requestAnimationFrame(() => taRef.current?.focus())
  }

  async function copyAnswer(turn: Turn) {
    if (!turn.answer) return
    await navigator.clipboard.writeText(turn.answer)
    setCopiedTurnId(turn.id)
    window.setTimeout(() => setCopiedTurnId(""), 1200)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    run()
  }

  const sendDisabled = !target || running || !instruction.trim() || modelStatus !== "connected"

  return (
    <section className="flex min-h-[680px] flex-col rounded-xl border bg-card">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <TerminalIcon width={17} height={17} className="text-primary" />
            ACP 对话
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ModelBadge status={modelStatus} model={activeModel} message={modelStatusText} />
          <label className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-2 py-1">
            <span className="text-xs text-muted-foreground">Session</span>
            <input
              value={sessionId}
              onChange={(event) => onSessionChange(event.target.value)}
              className="w-32 bg-transparent font-mono text-xs text-foreground outline-none sm:w-44"
            />
          </label>
          <button
            onClick={newConversation}
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
          >
            <PlusIcon width={14} height={14} />
            新会话
          </button>
        </div>
      </header>

      <div ref={logRef} className="min-h-0 flex-1 overflow-auto p-4">
        {!target ? (
          <EmptyState
            title="请选择在线机器"
            description="先从顶部选择 doops target，再把任务交给该机器上的 doagent。"
            templates={[]}
            onPick={useQuick}
          />
        ) : modelStatus === "loading" ? (
          <EmptyState title="正在检查 doagent" description="读取 metadata，确认 ACP 通道和模型配置。" templates={[]} onPick={useQuick} />
        ) : modelStatus !== "connected" ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border bg-background text-muted-foreground">
              <ServerIcon width={20} height={20} />
            </div>
            <h3 className="text-sm font-semibold text-foreground">doagent 模型未就绪</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              当前节点没有返回可用模型或 ACP metadata。请先在 DoOps 配置中心完成模型配置，再发起对话。
            </p>
            {modelStatusText && <p className="mt-2 max-w-md text-xs text-destructive">{modelStatusText}</p>}
            <ChannelStatusList channels={modelChannels} />
          </div>
        ) : historyStatus === "loading" ? (
          <EmptyState title="正在读取历史" description="使用当前 session 从 doagent 拉取对话上下文。" templates={[]} onPick={useQuick} />
        ) : turns.length === 0 ? (
          <EmptyState
            title={title}
            description={
              historyStatus === "error"
                ? `历史记录读取失败：${historyError}`
                : "用自然语言描述目标，Agent 会先梳理计划、风险和确认点，再通过 Skill/CLI 执行。"
            }
            templates={promptTemplates}
            onPick={useQuick}
          />
        ) : (
          <div className="space-y-4">
            {turns.map((turn) => (
              <TurnView
                key={turn.id}
                turn={turn}
                processOpen={openProcess[turn.id] ?? Boolean(turn.process)}
                copied={copiedTurnId === turn.id}
                onToggleProcess={() =>
                  setOpenProcess((current) => ({ ...current, [turn.id]: !(current[turn.id] ?? Boolean(turn.process)) }))
                }
                onCopy={() => copyAnswer(turn)}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t p-3">
        <div className="rounded-xl border bg-background p-2 shadow-sm">
          <textarea
            ref={taRef}
            aria-label="Agent instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="把要巡检、变更、查询或发布的目标告诉 Agent..."
            className="max-h-44 min-h-11 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="px-2 text-xs text-muted-foreground">
              Enter 发送 · Shift + Enter 换行 · 同一 session 保持上下文
            </span>
            <div className="flex items-center gap-2">
              {running && (
                <button
                  onClick={stop}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <StopIcon width={15} height={15} />
                  停止
                </button>
              )}
              <button
                onClick={run}
                disabled={sendDisabled}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendIcon width={15} height={15} />
                发送
              </button>
            </div>
          </div>
        </div>
      </footer>
    </section>
  )
}

function ModelBadge({
  status,
  model,
  message,
}: {
  status: "loading" | "connected" | "unconfigured"
  model: string | null
  message: string
}) {
  const label = status === "loading" ? "检查中" : status === "connected" ? model || "已连接" : "未配置"
  const cls =
    status === "connected"
      ? "border-success/40 bg-success/10 text-success"
      : status === "loading"
        ? "border-border bg-muted text-muted-foreground"
        : "border-warning/40 bg-warning/10 text-warning"
  return (
    <span title={message || label} className={`max-w-56 truncate rounded-lg border px-2.5 py-1.5 text-xs ${cls}`}>
      {label}
    </span>
  )
}

function ChannelStatusList({ channels }: { channels: AgentChannelStatus[] }) {
  if (channels.length === 0) return null
  return (
    <div className="mt-4 grid w-full max-w-md gap-2">
      {channels.map((channel) => (
        <div key={channel.name} className="rounded-lg border bg-background px-3 py-2 text-left text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-foreground">{channelLabel(channel.name)}</span>
            <span className={channel.status === "error" ? "text-destructive" : "text-muted-foreground"}>
              {statusLabel(channel.status)}
            </span>
          </div>
          {channel.message && <div className="mt-1 text-muted-foreground">{channel.message}</div>}
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  title,
  description,
  templates,
  onPick,
}: {
  title: string
  description: string
  templates: AgentPromptTemplate[]
  onPick: (text: string) => void
}) {
  return (
    <div className="flex h-full min-h-[460px] flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border bg-background text-primary">
        <TerminalIcon width={22} height={22} />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
      {templates.length > 0 && (
        <div className="mt-5 grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-3">
          {templates.map((template) => (
            <button
              key={template.label}
              onClick={() => onPick(template.text)}
              className="rounded-lg border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{template.label}</span>
                <CheckIcon width={14} height={14} className="text-muted-foreground" />
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{template.text}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TurnView({
  turn,
  processOpen,
  copied,
  onToggleProcess,
  onCopy,
}: {
  turn: Turn
  processOpen: boolean
  copied: boolean
  onToggleProcess: () => void
  onCopy: () => void
}) {
  return (
    <article className="space-y-3">
      <div className="ml-auto max-w-3xl rounded-xl border bg-primary/10 px-4 py-3 text-sm leading-6 text-foreground">
        {turn.user}
      </div>
      {(turn.process || turn.running) && (
        <section className="rounded-xl border bg-background">
          <button
            onClick={onToggleProcess}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-foreground"
          >
            <span>执行过程</span>
            <ChevronRightIcon
              width={16}
              height={16}
              className={`text-muted-foreground transition-transform ${processOpen ? "rotate-90" : ""}`}
            />
          </button>
          {processOpen && (
            <pre className="border-t p-4 font-mono text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
              {turn.process || "doagent 正在执行..."}
            </pre>
          )}
        </section>
      )}
      {(turn.answer || turn.reportPath || turn.error || turn.running) && (
        <section className="rounded-xl border bg-background p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <TerminalIcon width={15} height={15} className="text-primary" />
              智能体回答
              {turn.elapsed !== undefined && (
                <span className="text-xs font-normal text-muted-foreground">{turn.elapsed}s</span>
              )}
            </div>
            <button
              onClick={onCopy}
              disabled={!turn.answer}
              className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CopyIcon width={13} height={13} />
              {copied ? "已复制" : "复制"}
            </button>
          </div>
          {turn.answer && <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{turn.answer}</div>}
          {turn.reportPath && (
            <div className="mt-3 rounded-lg border bg-card px-3 py-2 font-mono text-xs text-muted-foreground">
              {turn.reportPath}
            </div>
          )}
          {turn.error && (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {turn.error}
            </div>
          )}
          {turn.running && <div className="mt-3 text-xs text-primary">doagent 正在执行...</div>}
        </section>
      )}
    </article>
  )
}
