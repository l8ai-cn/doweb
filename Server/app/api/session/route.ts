import { resolveHttpGateway } from "@/lib/gateway-server"
import { clearSessionCookies, readSessionCookies, setSessionCookies, type CookieSession } from "@/lib/session-cookies"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const session = readSessionCookies(req)
  if (!session) return Response.json({ session: null })
  const validation = await validateStoredSession(session)
  if (!validation.ok) {
    const headers = new Headers({ "Content-Type": "application/json" })
    clearSessionCookies(headers)
    return new Response(JSON.stringify({ session: null, error: validation.error }), {
      status: validation.status,
      headers,
    })
  }
  return Response.json({
    session: {
      gateway: session.gateway,
      token: "",
      username: session.username || "",
    },
  })
}

async function validateStoredSession(
  session: CookieSession,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  let base: string
  try {
    base = resolveHttpGateway(session.gateway)
  } catch (err) {
    return { ok: false, status: 400, error: (err as Error).message }
  }

  try {
    const res = await fetch(`${base}/v1/targets`, {
      headers: { Authorization: `Bearer ${session.token}` },
      cache: "no-store",
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, status: res.status, error: text || `token 验证失败 (${res.status})` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, status: 502, error: `无法连接 gateway: ${(err as Error).message}` }
  }
}

export async function POST(req: Request) {
  let body: { gateway?: string; token?: string; username?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 })
  }

  const gateway = (body.gateway || "").trim()
  const token = (body.token || "").trim()
  if (!gateway || !token) return Response.json({ error: "缺少 gateway 或 token" }, { status: 400 })

  let base: string
  try {
    base = resolveHttpGateway(gateway)
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }

  try {
    const res = await fetch(`${base}/v1/targets`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const text = await res.text()
    if (!res.ok) return Response.json({ error: text || `token 验证失败 (${res.status})` }, { status: res.status })
  } catch (err) {
    return Response.json({ error: `无法连接 gateway: ${(err as Error).message}` }, { status: 502 })
  }

  const headers = new Headers({ "Content-Type": "application/json" })
  setSessionCookies(headers, { gateway, token, username: body.username || "" })
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}

export async function DELETE() {
  const headers = new Headers({ "Content-Type": "application/json" })
  clearSessionCookies(headers)
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}
