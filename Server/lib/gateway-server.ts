import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

interface GatewayEntry {
  id: string
  url: string
}

interface DoopsServerEntry {
  name?: string
  aliases?: string[]
  gateway?: string
}

export function resolveWsGateway(gateway: string): string {
  const key = gateway.trim()
  if (!key) throw new Error("gateway is required")
  const entry = loadGatewayRegistry().find((item) => item.id === key)
  if (entry) return toWsBase(entry.url)
  if (process.env.DOOPS_ALLOW_UNSAFE_GATEWAY_URLS === "1") return toWsBase(key)
  const requested = toWsBase(key)
  if (loadGatewayRegistry().some((item) => toWsBase(item.url) === requested)) return requested
  throw new Error(`gateway is not registered: ${key}`)
}

export function resolveHttpGateway(gateway: string): string {
  const key = gateway.trim()
  if (!key) throw new Error("gateway is required")
  const entry = loadGatewayRegistry().find((item) => item.id === key)
  if (entry) return toHttpBase(entry.url)
  if (process.env.DOOPS_ALLOW_UNSAFE_GATEWAY_URLS === "1") return toHttpBase(key)
  const requested = toHttpBase(key)
  if (loadGatewayRegistry().some((item) => toHttpBase(item.url) === requested)) return requested
  throw new Error(`gateway is not registered: ${key}`)
}

function loadGatewayRegistry(): GatewayEntry[] {
  const entries: GatewayEntry[] = []
  const raw = (process.env.DOOPS_CONSOLE_GATEWAYS || "").trim()
  if (raw) entries.push(...parseGatewayRegistry(raw))
  const defaultURL = (process.env.DOOPS_GATEWAY_URL || "").trim()
  if (defaultURL) entries.push({ id: "default", url: defaultURL })
  entries.push(...loadDoopsConfigGateways())
  return entries
    .map((entry) => ({ id: entry.id.trim(), url: entry.url.trim().replace(/\/+$/, "") }))
    .filter((entry) => entry.id && entry.url)
}

function loadDoopsConfigGateways(): GatewayEntry[] {
  const configPath = doopsConfigPath()
  if (!existsSync(/*turbopackIgnore: true*/ configPath)) return []
  try {
    const parsed = JSON.parse(readFileSync(/*turbopackIgnore: true*/ configPath, "utf8")) as
      | { servers?: DoopsServerEntry[] }
      | DoopsServerEntry[]
    const servers = Array.isArray(parsed) ? parsed : parsed.servers || []
    const entries: GatewayEntry[] = []
    for (const server of servers) {
      const url = String(server.gateway || "").trim()
      if (!url) continue
      for (const rawID of [server.name, ...(server.aliases || [])]) {
        const id = String(rawID || "").trim()
        if (id) entries.push({ id, url })
      }
    }
    return entries
  } catch {
    return []
  }
}

function doopsConfigPath(): string {
  const override = (process.env.DOOPS_CONFIG || "").trim()
  if (override) return override
  const home = /*turbopackIgnore: true*/ homedir()
  const projectConfig = join(
    /*turbopackIgnore: true*/ process.cwd(),
    ".agent",
    "skills",
    "doops",
    "config.json",
  )
  if (existsSync(/*turbopackIgnore: true*/ projectConfig)) return projectConfig
  const globalAgentConfig = join(/*turbopackIgnore: true*/ home, ".agent", "skills", "doops", "config.json")
  if (existsSync(/*turbopackIgnore: true*/ globalAgentConfig)) return globalAgentConfig
  return join(/*turbopackIgnore: true*/ home, ".config", "doops", "config.json")
}

function parseGatewayRegistry(raw: string): GatewayEntry[] {
  if (raw.startsWith("[") || raw.startsWith("{")) {
    const parsed = JSON.parse(raw) as GatewayEntry[] | Record<string, string>
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => ({ id: String(entry.id || ""), url: String(entry.url || "") }))
    }
    return Object.entries(parsed).map(([id, url]) => ({ id, url: String(url) }))
  }
  return raw.split(",").map((part) => {
    const [id, url] = part.split("=", 2)
    return { id: (id || "").trim(), url: (url || "").trim() }
  })
}

function toWsBase(gateway: string): string {
  const trimmed = gateway.trim().replace(/\/+$/, "")
  if (trimmed.startsWith("https://")) return "wss://" + trimmed.slice("https://".length)
  if (trimmed.startsWith("http://")) return "ws://" + trimmed.slice("http://".length)
  if (trimmed.startsWith("wss://") || trimmed.startsWith("ws://")) return trimmed
  return "ws://" + trimmed
}

function toHttpBase(gateway: string): string {
  const trimmed = gateway.trim().replace(/\/+$/, "")
  if (trimmed.startsWith("ws://")) return "http://" + trimmed.slice("ws://".length)
  if (trimmed.startsWith("wss://")) return "https://" + trimmed.slice("wss://".length)
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed
  return "http://" + trimmed
}
