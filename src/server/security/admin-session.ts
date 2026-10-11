import "server-only";
import { cookies } from "next/headers";
import { getConfig } from "../config";
import { hmacBase64Url, safeEqual, verifyPassword } from "./crypto";

export const ADMIN_COOKIE = "pbca_admin";
const SESSION_HOURS = 8;

export interface AdminSession {
  email: string;
  expiresAt: Date;
}

export function signAdminSession(email: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_HOURS * 3600;
  const body = Buffer.from(JSON.stringify({ sub: email, exp })).toString("base64url");
  return `${body}.${hmacBase64Url(getConfig().secrets.session, `admin:${body}`)}`;
}

export function verifyAdminSession(value: string | undefined, now = Date.now()): AdminSession | null {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmacBase64Url(getConfig().secrets.session, `admin:${body}`))) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { sub: string; exp: number };
    if (typeof sub !== "string" || typeof exp !== "number" || exp * 1000 < now) return null;
    // A removed admin loses access immediately, even with an unexpired cookie.
    if (!getConfig().adminUsers.some((u) => u.email === sub)) return null;
    return { email: sub, expiresAt: new Date(exp * 1000) };
  } catch {
    return null;
  }
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: getConfig().appUrl.startsWith("https://"),
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  };
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  return verifyAdminSession(jar.get(ADMIN_COOKIE)?.value);
}

// Equalises timing when the email is unknown.
const DUMMY_HASH = "scrypt.16384.8.1.AAAAAAAAAAAAAAAAAAAAAA." + Buffer.alloc(64).toString("base64url");

export async function checkAdminCredentials(email: string, password: string): Promise<boolean> {
  const user = getConfig().adminUsers.find((u) => u.email === email.trim().toLowerCase());
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return Boolean(user) && ok;
}
