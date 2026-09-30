import "server-only";

import { randomBytes } from "node:crypto";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@/generated/prisma/client";
import { prisma } from "./db";
import { SESSION_COOKIE, SESSION_TTL_MS } from "./constants";

/** User fields safe to hand to pages/components (never the password hash). */
export type SafeUser = Pick<User, "id" | "username" | "email" | "createdAt">;

export function toSafeUser(user: User): SafeUser {
  const { id, username, email, createdAt } = user;
  return { id, username, email, createdAt };
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** Creates a DB session and sets the HttpOnly cookie. Call from a Server Function only. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id: token, userId, expiresAt } });

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Deletes the current session row (if any) and clears the cookie. */
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { id: token } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Current signed-in user or null. Memoized per request. */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return toSafeUser(session.user);
});

/** Like getCurrentUser but redirects to /login (with a return path) when signed out. */
export async function requireUser(returnTo?: string): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  return user;
}
