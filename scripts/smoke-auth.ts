/**
 * Creates a signed-in test account for smoke scripts under strict email
 * verification.
 *
 * Sign-up no longer returns a session: the address must be verified first. A
 * smoke script cannot click an email link, so this signs up through the real
 * endpoint, marks the throwaway user verified in the (disposable) database,
 * then signs in through the real endpoint. The returned Response is the
 * sign-in's, so callers read its status and Set-Cookie exactly as they read
 * the sign-up's before.
 */
import type { PrismaClient } from "../src/generated/prisma/client";

type SignUpBody = { name: string; email: string; password: string; callbackURL?: string };

export async function smokeSignUp(base: string, prisma: PrismaClient, body: SignUpBody): Promise<Response> {
  const headers = { "content-type": "application/json", origin: base };
  const signUp = await fetch(`${base}/api/auth/sign-up/email`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!signUp.ok) return signUp;
  await prisma.user.update({ where: { email: body.email.toLowerCase() }, data: { emailVerified: true } });
  return fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST", headers,
    body: JSON.stringify({ email: body.email, password: body.password, ...(body.callbackURL ? { callbackURL: body.callbackURL } : {}) }),
  });
}
