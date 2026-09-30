"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type AuthFormState = { error?: string } | undefined;

/** Only allow same-origin relative paths as post-login destinations. */
function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(24, "Username must be at most 24 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers and underscores")
    .transform((s) => s.toLowerCase()),
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function register(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { username, email, password } = parsed.data;

  const clash = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true },
  });
  if (clash) {
    return { error: clash.username === username ? "That username is taken" : "That email is already registered" };
  }

  const user = await prisma.user.create({
    data: { username, email, passwordHash: await hashPassword(password) },
  });
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or email").toLowerCase(),
  password: z.string().min(1, "Enter your password"),
});

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { identifier, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
  });
  // Same message for unknown user and wrong password.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect username/email or password" };
  }

  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/");
}
