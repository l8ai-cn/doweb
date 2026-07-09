export const SESSION_TOKEN_COOKIE = "doweb_session_token"
export const SESSION_GATEWAY_COOKIE = "doweb_session_gateway"
export const SESSION_USERNAME_COOKIE = "doweb_session_username"

const SESSION_MAX_AGE = 60 * 60 * 24 * 7

export interface CookieSession {
  gateway: string
  token: string
  username?: string
}

export function parseCookieHeader(header: string | null): Record<string, string> {
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

export function readSessionCookies(req: Request): CookieSession | null {
  const cookies = parseCookieHeader(req.headers.get("cookie"))
  const gateway = (cookies[SESSION_GATEWAY_COOKIE] || "").trim()
  const token = (cookies[SESSION_TOKEN_COOKIE] || "").trim()
  if (!gateway || !token) return null
  const username = (cookies[SESSION_USERNAME_COOKIE] || "").trim()
  return { gateway, token, username: username || undefined }
}

export function setSessionCookies(headers: Headers, session: CookieSession): void {
  headers.append("Set-Cookie", sessionCookie(SESSION_GATEWAY_COOKIE, session.gateway, SESSION_MAX_AGE))
  headers.append("Set-Cookie", sessionCookie(SESSION_TOKEN_COOKIE, session.token, SESSION_MAX_AGE))
  headers.append("Set-Cookie", sessionCookie(SESSION_USERNAME_COOKIE, session.username || "", SESSION_MAX_AGE))
}

export function clearSessionCookies(headers: Headers): void {
  headers.append("Set-Cookie", sessionCookie(SESSION_GATEWAY_COOKIE, "", 0))
  headers.append("Set-Cookie", sessionCookie(SESSION_TOKEN_COOKIE, "", 0))
  headers.append("Set-Cookie", sessionCookie(SESSION_USERNAME_COOKIE, "", 0))
}

function sessionCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}
