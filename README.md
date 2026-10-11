# Kodiset

Kodiset helps developers find a realistic first open-source contribution. Give it a public GitHub repository and a short skills check. It reads the repository, checks issue availability and project health, then creates a contribution guide matched to the developer's level.

The project is a standalone Kodiset contribution planner with a React frontend, Express API, and PostgreSQL-backed account system.

## What It Does

- Accepts a public GitHub repository URL.
- Builds a repository brief from issues, pull requests, commits, branches, contributors, languages, and contribution guidance.
- Checks whether an issue is free, assigned, or already targeted by an open pull request.
- Matches issue difficulty to the developer's Git experience, collaboration experience, languages, interests, and available time.
- Produces a first-contribution plan with repository file-path checks.
- Explains project health and previous solved problems.
- Generates an editable issue comment draft when a Gemini API key is available.
- Supports GitHub OAuth login.
- Supports email/password registration and login.
- Stores sessions in HTTP-only cookies.
- Stores the user's contribution level, skills, knowledge signals, time, and interests in PostgreSQL.
- Keeps anonymous users functional with browser-local profile storage.
- Gives signed-in users a contribution workspace for one active issue, checklist progress, notes, draft comments, branch names, PR links, and contribution status.

## Project Structure

```text
artifacts/
  kodiset/       React + Vite frontend
  api-server/    Express API, auth routes, and health route
lib/
  db/            Drizzle PostgreSQL schema and database client
  api-zod/       Generated API schemas
  api-client-react/ Generated API client package
```

This repository is the Kodiset project. It uses a pnpm workspace monorepo and TypeScript across the frontend, API, database, and shared packages.

## Requirements

- Node.js 20 or newer
- Node.js 20 or newer is enough to run the included pnpm commands through `npm exec`.
- PostgreSQL 14 or newer
- A GitHub OAuth application for GitHub login
- A Gemini API key for AI-generated explanations and plans

## Install

```bash
npm exec --yes pnpm@10 -- install
```

## Environment Setup

Copy the example files:

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env
cp artifacts/kodiset/.env.example artifacts/kodiset/.env
```

### API environment

Set these values in `artifacts/api-server/.env`:

```env
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/kodiset
FRONTEND_URL=http://localhost:5173
API_URL=http://localhost:3000
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
```

### Frontend environment

Set this in `artifacts/kodiset/.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

Do not commit either `.env` file. Never put `GITHUB_CLIENT_SECRET`, database credentials, or server-side secrets in the frontend environment.

## GitHub OAuth Setup

Create an OAuth App in GitHub Developer Settings with:

- **Application URL:** `http://localhost:5173`
- **Authorization callback URL:** `http://localhost:3000/api/auth/github/callback`

Copy the client ID and client secret into the API environment file. The callback validates a random state cookie before exchanging the authorization code.

## Database Setup

Create the PostgreSQL database named in `DATABASE_URL`, then apply the Drizzle schema:

```bash
npm exec --yes pnpm@10 -- --filter @workspace/db push
```

The schema creates:

- `users`: GitHub identity or email identity, display information, and password hash.
- `sessions`: random server-side sessions with expiry timestamps.
- `user_profiles`: contribution level, skills, knowledge signals, interests, and available time.
- `contribution_workspaces`: the user's active issue, progress, notes, draft, branch, PR URL, and status.

Passwords are stored as salted scrypt hashes. Raw passwords are never stored. Sessions are stored server-side and sent to the browser through HTTP-only cookies.

## Run Locally

Start the API:

```bash
npm exec --yes pnpm@10 -- --filter @workspace/api-server run dev
```

Start the frontend in another terminal:

```bash
PORT=5173 BASE_PATH=/ npm exec --yes pnpm@10 -- --filter @workspace/kodiset run dev
```

Open `http://localhost:5173`.

The API health endpoint is:

```text
http://localhost:3000/api/healthz
```

## Authentication API

All authentication routes are mounted under `/api`:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/auth/github` | Start GitHub OAuth |
| GET | `/auth/github/callback` | Complete GitHub OAuth |
| POST | `/auth/register` | Create an email/password account |
| POST | `/auth/login` | Create an email/password session |
| GET | `/auth/me` | Return the current user and profile |
| PUT | `/auth/profile` | Save the current contribution profile |
| GET | `/workspace` | Load the signed-in user's contribution workspace |
| PUT | `/workspace` | Save the signed-in user's contribution workspace |
| POST | `/auth/logout` | Revoke the current session |

The frontend sends credentials with requests so the HTTP-only session cookie is used across visits. Production deployments must use HTTPS so secure cookies are enabled.

## Useful Commands

```bash
# Typecheck the whole workspace
npm exec --yes pnpm@10 -- run typecheck

# Build the frontend
PORT=5173 BASE_PATH=/ npm exec --yes pnpm@10 -- --filter @workspace/kodiset run build

# Build the API bundle
npm exec --yes pnpm@10 -- --filter @workspace/api-server run build

# Typecheck one package
npm exec --yes pnpm@10 -- --filter @workspace/kodiset run typecheck
npm exec --yes pnpm@10 -- --filter @workspace/api-server run typecheck

# Rebuild database declarations
npm exec --yes pnpm@10 -- exec tsc -b lib/db --force
```

## Product Notes

Kodiset intentionally separates deterministic repository facts from AI-written guidance:

- Code checks issue status, repository activity, paths, labels, and profile arithmetic.
- Gemini explains the issue and proposes a plan using the supplied repository context.
- The frontend labels difficulty and AI output as estimates, not guarantees.
- Users should read the real issue, README, and contribution rules before changing code.

The current implementation is designed for public GitHub repositories. GitHub rate limits may require an optional user token for repository analysis. AI analysis requires a Gemini API key in the browser session.

## Security Notes

- GitHub OAuth state is checked against an HTTP-only cookie.
- Sessions are random server-side identifiers, not encoded user data.
- Session cookies are HTTP-only and secure in production.
- Passwords use salted scrypt hashes.
- OAuth client secrets and database URLs remain server-side.
- CORS allows only the configured frontend origin and credentials.
- The repository currently does not provide password reset or email verification. Add those before treating email accounts as production-ready.

## Branch Policy

The public Kodiset repository uses `main` as its default branch. Keep secrets out of commits and review changes before deploying them.