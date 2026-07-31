/**
 * Auth API — login, logout, session check, waitlist signup.
 *
 * Uses signed cookies for session management (no NextAuth.js dependency).
 */

import { NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { verifyPassword, createSessionToken, verifySessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS, type SessionPayload } from '@/lib/auth/session';
import { getConfig } from '@/shared/config';

/** POST /api/auth/v2/login — authenticate user and set session cookie. */
export async function handleLogin(req: Request): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  if (!body || !body.email || !body.password) {
    return NextResponse.json({ ok: false, error: 'Email and password required' }, { status: 400 });
  }

  const user = await prisma.userReadModel.findUnique({
    where: { email: body.email.toLowerCase() },
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
  }

  if (user.status !== 'active') {
    return NextResponse.json({ ok: false, error: 'Account not active. Please wait for approval.' }, { status: 403 });
  }

  const valid = verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
  }

  const roles = JSON.parse(user.roles || '["player"]') as string[];
  const payload: SessionPayload = {
    userId: user.userId,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    roles,
    activeRole: roles[0] || 'player',
    isDemo: user.isDemo,
    isPermanent: user.isPermanent,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };

  const token = createSessionToken(payload);
  const response = NextResponse.json({ ok: true, data: payload });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: getConfig().nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

/** POST /api/auth/v2/logout — clear session cookie. */
export async function handleLogout(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

/** GET /api/auth/v2/session — get current session. */
export async function handleSession(req: Request): Promise<NextResponse> {
  const cookieHeader = req.headers.get('cookie') || '';
  const token = decodeURIComponent(
    cookieHeader
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
      ?.substring(SESSION_COOKIE.length + 1) ?? ''
  );

  if (!token) {
    return NextResponse.json({ ok: false, authenticated: false });
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return NextResponse.json({ ok: false, authenticated: false });
  }

  return NextResponse.json({ ok: true, authenticated: true, session: payload });
}

/** POST /api/auth/v2/switch-role — switch active role. */
export async function handleSwitchRole(req: Request): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  if (!body || !body.role) {
    return NextResponse.json({ ok: false, error: 'Role required' }, { status: 400 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  const token = decodeURIComponent(
    cookieHeader
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
      ?.substring(SESSION_COOKIE.length + 1) ?? ''
  );

  if (!token) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  }

  if (!payload.roles.includes(body.role)) {
    return NextResponse.json({ ok: false, error: 'Role not assigned to user' }, { status: 403 });
  }

  const newPayload: SessionPayload = { ...payload, activeRole: body.role };
  const newToken = createSessionToken(newPayload);
  const response = NextResponse.json({ ok: true, data: newPayload });
  response.cookies.set(SESSION_COOKIE, newToken, {
    httpOnly: true,
    secure: getConfig().nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

/** POST /api/auth/v2/waitlist — join the waitlist. */
export async function handleWaitlistSignup(req: Request): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  if (!body || !body.email || !body.password || !body.username) {
    return NextResponse.json({ ok: false, error: 'Email, username, and password required' }, { status: 400 });
  }

  // Check if email already exists
  const existing = await prisma.waitlistEntry.findUnique({
    where: { email: body.email.toLowerCase() },
  });

  if (existing) {
    return NextResponse.json({ ok: false, error: 'Email already on waitlist' }, { status: 409 });
  }

  // Check if username is taken
  const existingUser = await prisma.userReadModel.findUnique({
    where: { username: body.username },
  });

  if (existingUser) {
    return NextResponse.json({ ok: false, error: 'Username already taken' }, { status: 409 });
  }

  // Create waitlist entry (NOT a user — user is created on approval)
  const crypto = await import('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(body.password, salt, 64).toString('hex');
  const passwordHash = `$scrypt$${salt}$${hash}`;

  await prisma.waitlistEntry.create({
    data: {
      email: body.email.toLowerCase(),
      username: body.username,
      status: 'pending',
      verificationToken: passwordHash, // Store hash here temporarily for when user is created
      verifiedAt: null,
      approvalNotes: null,
      rejectionReason: null,
      invitedById: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    data: { message: 'You\'re on the waitlist! We\'ll notify you when approved.' },
  });
}

/** GET /api/auth/v2/demo-accounts — list demo accounts for quick login. */
export async function handleDemoAccounts(): Promise<NextResponse> {
  const demos = await prisma.userReadModel.findMany({
    where: { isDemo: true },
    select: { email: true, username: true, displayName: true, roles: true },
  });

  return NextResponse.json({
    ok: true,
    data: demos.map((d) => ({
      email: d.email,
      username: d.username,
      displayName: d.displayName,
      role: JSON.parse(d.roles || '["player"]')[0],
      password: 'demo12345',
    })),
  });
}
