import "server-only";
import { Errors } from "../errors";
import { getAdminSession, type AdminSession } from "./admin-session";

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw Errors.unauthorized();
  return session;
}
