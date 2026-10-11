import { promisify } from "node:util";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { contributionWorkspaces, db, sessions, userProfiles, users } from "@workspace/db";

const router: IRouter = Router();
const stateCookie = "kodiset_github_oauth_state";
const sessionCookie = "kodiset_session";
const sessionLifetimeMs = 1000 * 60 * 60 * 24 * 30;

type GithubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
};

type GithubEmail = { email: string; primary: boolean; verified: boolean };
type LocalProfile = {
  git: number;
  collab: number;
  languages: Record<string, number>;
  knowledge: string[];
  hours: string;
  interests: string[];
};
const scrypt = promisify(scryptCallback);

function githubConfig() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL ??
      `${process.env.API_URL ?? "http://localhost:3000"}/api/auth/github/callback`,
    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  };
}

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

async function fetchGithub<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function defaultProfile(): LocalProfile {
  return { git: 1, collab: 1, languages: {}, knowledge: [], hours: "2-5", interests: [] };
}

function serializeProfile(profile: typeof userProfiles.$inferSelect | null): LocalProfile | null {
  if (!profile) return null;
  return {
    git: profile.gitLevel,
    collab: profile.collabLevel,
    languages: profile.skills,
    knowledge: profile.knowledge,
    hours: profile.hours,
    interests: profile.interests,
  };
}

function serializeUser(user: typeof users.$inferSelect, profile: typeof userProfiles.$inferSelect | null) {
  return {
    id: user.id,
    login: user.githubLogin ?? user.email ?? "user",
    name: user.displayName ?? user.githubLogin ?? user.email ?? "User",
    avatarUrl: user.avatarUrl,
    profile: serializeProfile(profile),
  };
}

async function createSession(userId: string, response: Response) {
  const sessionId = randomUUID();
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + sessionLifetimeMs),
  });
  response.cookie(sessionCookie, sessionId, cookieOptions(sessionLifetimeMs));
}

router.post("/auth/register", async (request, response) => {
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const name = typeof request.body?.name === "string" ? request.body.name.trim().slice(0, 80) : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    response.status(400).json({ error: "Use a valid email and a password of at least 8 characters." });
    return;
  }
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) {
    response.status(409).json({ error: "An account with that email already exists." });
    return;
  }
  const saved = await db
    .insert(users)
    .values({ email, displayName: name || email.split("@")[0], passwordHash: await hashPassword(password) })
    .returning();
  const user = saved[0];
  if (!user) {
    response.status(500).json({ error: "Could not create the account." });
    return;
  }
  await db.insert(userProfiles).values({
    userId: user.id,
    gitLevel: 1,
    collabLevel: 1,
    skills: {},
    knowledge: [],
    hours: "2-5",
    interests: [],
  });
  await createSession(user.id, response);
  response.status(201).json({ authenticated: true, user: serializeUser(user, null) });
});

router.post("/auth/login", async (request, response) => {
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = result[0];
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    response.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id)).limit(1);
  await createSession(user.id, response);
  response.json({ authenticated: true, user: serializeUser(user, profile[0] ?? null) });
});

async function currentUser(request: Request) {
  const sessionId = request.cookies[sessionCookie];
  if (!sessionId) return null;

  const result = await db
    .select({ user: users, profile: userProfiles, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = result[0];
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }
  return { user: session.user, profile: session.profile };
}

router.get("/auth/github", (request, response) => {
  const config = githubConfig();
  if (!config) {
    response.status(503).json({ error: "GitHub OAuth is not configured." });
    return;
  }

  const state = randomBytes(32).toString("hex");
  response.cookie(stateCookie, state, cookieOptions(10 * 60 * 1000));
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: "read:user user:email",
    state,
  });
  response.redirect(`https://github.com/login/oauth/authorize?${query.toString()}`);
});

router.get("/auth/github/callback", async (request, response) => {
  const config = githubConfig();
  const state = typeof request.query.state === "string" ? request.query.state : "";
  const code = typeof request.query.code === "string" ? request.query.code : "";
  if (!config || !code || !state || state !== request.cookies[stateCookie]) {
    response.status(400).send("Invalid GitHub login request.");
    return;
  }

  try {
    const token = await fetchGithub<{ access_token?: string }>(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code }),
      },
    );
    if (!token.access_token) throw new Error("GitHub did not return an access token.");
    const githubUser = await fetchGithub<GithubUser>("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const emails = await fetchGithub<GithubEmail[]>("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const email = emails.find((item) => item.primary && item.verified)?.email ?? null;
    const saved = await db
      .insert(users)
      .values({
        githubId: String(githubUser.id),
        githubLogin: githubUser.login,
        displayName: githubUser.name,
        email,
        avatarUrl: githubUser.avatar_url,
      })
      .onConflictDoUpdate({
        target: users.githubId,
        set: {
          githubLogin: githubUser.login,
          displayName: githubUser.name,
          email,
          avatarUrl: githubUser.avatar_url,
          updatedAt: new Date(),
        },
      })
      .returning({ id: users.id });
    const user = saved[0];
    if (!user) throw new Error("Could not save GitHub user.");

    await db.delete(sessions).where(and(eq(sessions.userId, user.id), lt(sessions.expiresAt, new Date())));
    await createSession(user.id, response);
    response.clearCookie(stateCookie, cookieOptions());
    response.redirect(config.frontendUrl);
  } catch (error) {
    response.status(502).send(error instanceof Error ? error.message : "GitHub login failed.");
  }
});

router.get("/auth/me", async (request, response) => {
  const current = await currentUser(request);
  response.json(
    current
      ? { authenticated: true, user: serializeUser(current.user, current.profile) }
      : { authenticated: false, user: null },
  );
});

router.put("/auth/profile", async (request, response) => {
  const current = await currentUser(request);
  if (!current) {
    response.status(401).json({ error: "Sign in to save your profile." });
    return;
  }
  const profile = request.body?.profile;
  if (!profile || typeof profile !== "object") {
    response.status(400).json({ error: "A profile is required." });
    return;
  }
  const gitLevel = Math.max(1, Math.min(5, Number(profile.git) || 1));
  const collabLevel = Math.max(1, Math.min(5, Number(profile.collab) || 1));
  const languages = profile.languages && typeof profile.languages === "object" ? profile.languages : {};
  const knowledge = Array.isArray(profile.knowledge) ? profile.knowledge.filter((item: unknown) => typeof item === "string").slice(0, 30) : [];
  const hours = ["<2", "2-5", "5+"].includes(profile.hours) ? profile.hours : "2-5";
  const interests = Array.isArray(profile.interests) ? profile.interests.filter((item: unknown) => typeof item === "string").slice(0, 30) : [];
  const saved = await db
    .insert(userProfiles)
    .values({ userId: current.user.id, gitLevel, collabLevel, skills: languages, knowledge, hours, interests })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { gitLevel, collabLevel, skills: languages, knowledge, hours, interests, updatedAt: new Date() },
    })
    .returning();
  response.json({ profile: serializeProfile(saved[0] ?? null) });
});

router.get("/workspace", async (request, response) => {
  const current = await currentUser(request);
  if (!current) {
    response.status(401).json({ error: "Sign in to use a saved contribution workspace." });
    return;
  }
  const workspace = await db.select().from(contributionWorkspaces).where(eq(contributionWorkspaces.userId, current.user.id)).limit(1);
  response.json({ workspace: workspace[0] ?? null });
});

router.put("/workspace", async (request, response) => {
  const current = await currentUser(request);
  if (!current) {
    response.status(401).json({ error: "Sign in to save your contribution workspace." });
    return;
  }
  const body = request.body ?? {};
  const status = ["planned", "claimed", "in progress", "PR opened", "merged"].includes(body.status) ? body.status : "planned";
  const checklist = body.checklist && typeof body.checklist === "object" ? body.checklist : {};
  const values = {
    userId: current.user.id,
    repoOwner: typeof body.repoOwner === "string" ? body.repoOwner.slice(0, 100) : "",
    repoName: typeof body.repoName === "string" ? body.repoName.slice(0, 100) : "",
    issueNumber: Number.isInteger(body.issueNumber) ? body.issueNumber : null,
    issueTitle: typeof body.issueTitle === "string" ? body.issueTitle.slice(0, 300) : null,
    status,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 10000) : "",
    draftComment: typeof body.draftComment === "string" ? body.draftComment.slice(0, 10000) : "",
    branchName: typeof body.branchName === "string" ? body.branchName.slice(0, 200) : "",
    prUrl: typeof body.prUrl === "string" ? body.prUrl.slice(0, 500) : "",
    checklist,
    updatedAt: new Date(),
  };
  if (!values.repoOwner || !values.repoName) {
    response.status(400).json({ error: "A repository is required." });
    return;
  }
  const { userId: _userId, ...workspaceUpdate } = values;
  const saved = await db.insert(contributionWorkspaces).values(values).onConflictDoUpdate({
    target: contributionWorkspaces.userId,
    set: workspaceUpdate,
  }).returning();
  response.json({ workspace: saved[0] ?? null });
});

router.post("/auth/logout", async (request, response) => {
  const sessionId = request.cookies[sessionCookie];
  if (sessionId) await db.delete(sessions).where(eq(sessions.id, sessionId));
  response.clearCookie(sessionCookie, cookieOptions());
  response.status(204).end();
});

export default router;