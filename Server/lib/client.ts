"use client"

import type { Target } from "./gateway"

export type { Target }

export interface Session {
  gateway: string
  token: string
  username?: string
}

export type RpcEvent =
  | { type: "open" }
  | {
      type: "output"
      data: string
      session?: string
      kind?: "assistant_delta" | "tool" | "report" | "error" | "raw" | string
      tool?: string
      status?: string
      path?: string
    }
  | { type: "result"; result: unknown }
  | { type: "error"; error: string; code?: number }
  | { type: "done" }

function authHeaders(s: Session): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-doops-gateway": s.gateway,
  }
  if (s.token) headers.Authorization = `Bearer ${s.token}`
  return headers
}

export async function login(
  gateway: string,
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gateway, username, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "登录失败")
  return { token: data.token, username: data.username || username }
}

export async function restoreServerSession(): Promise<Session | null> {
  const res = await fetch("/api/session", { cache: "no-store" })
  const data = await res.json()
  if (!res.ok || !data.session?.gateway) return null
  return {
    gateway: data.session.gateway,
    token: "",
    username: data.session.username || undefined,
  }
}

export async function persistTokenSession(s: Session): Promise<void> {
  if (!s.gateway || !s.token) return
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gateway: s.gateway, token: s.token, username: s.username || "" }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "保存会话失败")
  }
}

export async function clearServerSession(): Promise<void> {
  const res = await fetch("/api/session", { method: "DELETE" })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `断开连接失败 (${res.status})`)
  }
}

export async function fetchTargets(s: Session): Promise<Target[]> {
  const res = await fetch("/api/targets", { headers: authHeaders(s) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "查询目标失败")
  return (data.targets || []) as Target[]
}

export async function callTool(
  s: Session,
  opts: {
    cluster: string
    instance: string
    tool: string
    arguments: Record<string, unknown>
    signal?: AbortSignal
  },
  onEvent: (ev: RpcEvent) => void,
): Promise<void> {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: authHeaders(s),
    body: JSON.stringify({
      cluster: opts.cluster,
      instance: opts.instance,
      tool: opts.tool,
      arguments: opts.arguments,
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    let msg = `请求失败 (${res.status})`
    try {
      const data = await res.json()
      msg = data.error || msg
    } catch {
      /* noop */
    }
    onEvent({ type: "error", error: msg })
    onEvent({ type: "done" })
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      try {
        onEvent(JSON.parse(line) as RpcEvent)
      } catch {
        /* noop */
      }
    }
  }
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer.trim()) as RpcEvent)
    } catch {
      /* noop */
    }
  }
}

export function extractText(result: unknown): string {
  if (result == null) return ""
  if (typeof result === "string") return result
  const r = result as any
  if (Array.isArray(r.content)) {
    return r.content
      .map((c: any) => (typeof c === "string" ? c : c?.text ?? ""))
      .join("")
  }
  if (typeof r.text === "string") return r.text
  try {
    return JSON.stringify(r, null, 2)
  } catch {
    return String(result)
  }
}
