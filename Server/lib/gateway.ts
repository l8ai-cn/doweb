export interface Target {
  cluster: string
  instance: string
  key: string
  remote?: string
  provider?: string
  model?: string
  models?: string[]
  tools?: string[]
  skills?: string[]
  metadata?: {
    source?: string
    provider?: string
    model?: string
    models?: string[]
    tools?: string[]
    skills?: string[]
  }
  connected_at?: string
  last_seen?: string
  busy?: boolean
  status?: string
  active_ops?: number
  queued_ops?: number
}

export const TOOLS = {
  prompt: "doops_agent_prompt",
} as const

export function readAuth(req: Request): { gateway: string; token: string } {
  const cookies = parseCookieHeader(req.headers.get("cookie"))
  const gateway =
    req.headers.get("x-doops-gateway") ||
    cookies.doweb_session_gateway ||
    cookies.doweb_gateway ||
    ""
  const auth = req.headers.get("authorization") || ""
  const headerToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth.trim()
  const token = headerToken || cookies.doweb_session_token || cookies.doweb_token || ""
  return { gateway, token }
}

function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header || "").split(";")) {
    const idx = part.indexOf("=")
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

export function randomSession(prefix = "doweb"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}
