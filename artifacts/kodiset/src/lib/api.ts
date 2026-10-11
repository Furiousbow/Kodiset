import type { AnalysisSections, Commit, ContributionWorkspace, Contributor, HelpArea, Health, Issue, IssueStatus, Plan, Profile, RepoBase, RepoFacts, RepoRecommendation, SolvedItem } from './types';
import { ALTERNATE_BUG_PROMPTS, BUG_SYSTEM_PROMPT } from './levelCheck';

export const GEMINI_MODEL = 'gemma-4-31b-it';
export const LEVEL_GEMINI_MODEL = 'gemma-4-e4b-it';
const GH = 'https://api.github.com';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const APP_API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
export interface Credentials { geminiKey: string; githubToken: string }

export interface AuthUser {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  profile: Profile | null;
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${APP_API}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || `Auth request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const data = await authRequest<{ authenticated: boolean; user: AuthUser | null }>('/auth/me');
  return data.authenticated ? data.user : null;
}

export async function registerAccount(email: string, password: string, name: string) {
  return authRequest<{ authenticated: true; user: AuthUser }>('/auth/register', {
    method: 'POST', body: JSON.stringify({ email, password, name }),
  });
}

export async function loginAccount(email: string, password: string) {
  return authRequest<{ authenticated: true; user: AuthUser }>('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
}

export async function saveUserProfile(profile: Profile) {
  return authRequest<{ profile: Profile }>('/auth/profile', {
    method: 'PUT', body: JSON.stringify({ profile }),
  });
}

export async function getWorkspace(): Promise<ContributionWorkspace | null> {
  const result = await authRequest<{ workspace: ContributionWorkspace | null }>('/workspace');
  return result.workspace;
}

export async function saveWorkspace(workspace: ContributionWorkspace): Promise<ContributionWorkspace> {
  const result = await authRequest<{ workspace: ContributionWorkspace }>('/workspace', {
    method: 'PUT', body: JSON.stringify(workspace),
  });
  return result.workspace;
}

export function signInWithGithub() {
  window.location.assign(`${APP_API}/auth/github`);
}

export async function signOut() {
  await authRequest<void>('/auth/logout', { method: 'POST' });
}

export async function discoverRepositories(profile: Profile, token: string): Promise<RepoRecommendation[]> {
  const languages = Object.entries(profile.languages)
    .filter(([, level]) => level >= 1)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 2)
    .map(([language]) => language);
  const queries = languages.length ? languages : [''] as string[];
  const results = await Promise.all(queries.map(async (language) => {
    const query = [
      'is:public',
      'archived:false',
      'good-first-issues:>0',
      language ? `language:${language}` : '',
    ].filter(Boolean).join(' ');
    return gh<{ items: Array<Record<string, any>> }>(`/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=12`, token);
  }));
  const unique = new Map<string, Record<string, any>>();
  results.flatMap((result) => result.items).forEach((repo) => unique.set(repo.full_name, repo));
  const hourCap = profile.hours === '<2' ? 2 : profile.hours === '2-5' ? 3 : 5;
  return Array.from(unique.values()).map((repo): RepoRecommendation => {
    const language = String(repo.language || '').toLowerCase() || null;
    const languageLevel = language ? profile.languages[language] : undefined;
    const ageDays = (Date.now() - new Date(repo.pushed_at).getTime()) / 86400000;
    const reasons: string[] = [];
    let score = 0;
    if (languageLevel) { score += languageLevel * 4; reasons.push(`${repo.language} matches your profile`); }
    if (repo.open_issues_count > 0) { score += 3; reasons.push(`${repo.open_issues_count} open issues`); }
    if (repo.stargazers_count < 10000) { score += 2; reasons.push('small enough to approach'); }
    if (ageDays < 30) { score += 3; reasons.push('active in the last 30 days'); }
    if (repo.good_first_issue_count > 0) { score += Math.min(5, repo.good_first_issue_count); reasons.push('newcomer issues available'); }
    if (hourCap <= 2 && repo.open_issues_count > 1000) score -= 2;
    return {
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description || 'No repository description provided.',
      language: repo.language || null,
      stars: repo.stargazers_count || 0,
      openIssues: repo.open_issues_count || 0,
      pushedAt: repo.pushed_at,
      score,
      reasons: reasons.slice(0, 3),
    };
  }).sort((left, right) => right.score - left.score).slice(0, 6);
}

function ghHeaders(token: string): HeadersInit {
  return { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
async function gh<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GH}${path}`, { headers: ghHeaders(token) });
  if (!response.ok) {
    if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') throw new Error('RATE_LIMIT');
    if (response.status === 404) throw new Error('NOT_FOUND');
    throw new Error(`GitHub request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
function levelFromLabel(labels: string[]): 1 | 2 | 3 | 4 | 5 {
  const text = labels.join(' ').toLowerCase();
  if (/breaking/.test(text)) return 5;
  if (/complex|major refactor/.test(text)) return 4;
  if (/good first issue|beginner|first-timers/.test(text)) return 1;
  if (/help wanted|easy/.test(text)) return 2;
  return 3;
}
function languageFor(text: string, main: string | null) {
  const t = text.toLowerCase();
  const ext: Record<string,string> = { '.tsx':'typescript','.jsx':'javascript','.cpp':'c++','.java':'java','.php':'php','.html':'html/css','.css':'html/css','.sql':'sql','.py':'python','.js':'javascript','.ts':'typescript','.c':'c','.h':'c','.go':'go','.rs':'rust' };
  for (const [suffix, lang] of Object.entries(ext)) if (t.includes(suffix)) return lang;
  const mentioned: [RegExp,string][] = [[/\bpython\b/,'python'],[/\btypescript\b/,'typescript'],[/\bjavascript\b|\bjs\b/,'javascript'],[/\bc\+\+|\bcpp\b/,'c++'],[/\brust\b/,'rust'],[/\bjava\b/,'java'],[/\bgolang\b|\bgo\b/,'go'],[/\bphp\b/,'php'],[/\bsql\b/,'sql'],[/\bhtml\b|\bcss\b/,'html/css'],[/\blanguage c\b|\bc language\b/,'c']];
  for (const [pattern, lang] of mentioned) if (pattern.test(t)) return lang;
  return main?.toLowerCase();
}
function statusFor(issue: any, openPrs: any[]): IssueStatus {
  if (issue.assignee?.login) return { kind: 'assigned', to: issue.assignee.login };
  const pattern = new RegExp(`(?:fix(?:es|ed)?|clos(?:e|es|ed)|resolv(?:e|es|ed))\\s+#${issue.number}\\b`, 'i');
  const pr = openPrs.find((item) => pattern.test(`${item.title} ${item.body || ''}`));
  return pr ? { kind: 'pr', number: pr.number } : { kind: 'free' };
}
function matchesIssue(text: string) { return /(?:fix(?:es|ed)?|clos(?:e(?:s|d)?|ed)|resolv(?:e(?:s|d)?|ed))\s+#(\d+)/ig; }
async function gemma<T>(key: string, prompt: string, model = GEMINI_MODEL): Promise<T> {
  if (!key) throw new Error('MISSING_GEMINI_KEY');
  const response = await fetch(`${GEMINI}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25 } }),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  return text as T;
}
function cleanJson(text: string) { return JSON.parse(text.replace(/```(?:json)?/g, '').trim()); }

async function repoFacts(base: RepoBase, token: string): Promise<RepoFacts> {
  const { owner, repo } = base; const root = `/${owner}/${repo}`;
  const repoInfo = await gh<any>(root, token);
  const [issueData, closedPrs, openPrs, contributorsRaw, branchesRaw, commitsRaw, languages, tree, contributing] = await Promise.all([
    gh<any[]>(`${root}/issues?state=open&per_page=100&sort=created&direction=desc`, token),
    gh<any[]>(`${root}/pulls?state=closed&per_page=100&sort=updated&direction=desc`, token),
    gh<any[]>(`${root}/pulls?state=open&per_page=100`, token), gh<any[]>(`${root}/contributors?per_page=30`, token),
    gh<any[]>(`${root}/branches?per_page=100`, token), gh<any[]>(`${root}/commits?per_page=12`, token),
    gh<Record<string,number>>(`${root}/languages`, token), gh<any>(`${root}/git/trees/${encodeURIComponent(repoInfo.default_branch)}?recursive=1`, token),
    gh<any>(`${root}/contents/CONTRIBUTING.md`, token).then(() => true).catch((e) => { if (String(e).includes('NOT_FOUND')) return false; throw e; }),
  ]);
  const merged = closedPrs.filter((p) => p.merged_at);
  const date = new Date(repoInfo.pushed_at || '').getTime(); const age = Number.isFinite(date) ? (Date.now() - date) / 86400000 : Infinity;
  const verdict: Health['verdict'] = repoInfo.archived ? 'Archived' : !repoInfo.pushed_at ? 'Unknown' : age < 30 ? 'Active' : age < 180 ? 'Slow' : 'Looks inactive';
  const issueDataOnly = issueData.filter((i) => !i.pull_request);
  const mainLanguage = Object.entries(languages).sort((a,b) => b[1] - a[1])[0]?.[0] || repoInfo.language || null;
  const issues: Issue[] = issueDataOnly.map((i) => {
    const labels = i.labels.map((l: any) => typeof l === 'string' ? l : l.name);
    return { number: i.number, title: i.title, url: i.html_url, labels, body: i.body || '', status: statusFor(i, openPrs), language: languageFor(`${i.title} ${i.body || ''} ${labels.join(' ')}`, mainLanguage), difficulty: levelFromLabel(labels) };
  });
  issues.sort((a,b) => {
    const priority = (issue: Issue) => issue.labels.some((label) => /good first issue|beginner|first-timers/i.test(label)) ? 0 : issue.labels.some((label) => /help wanted/i.test(label)) ? 1 : 2;
    return priority(a) - priority(b);
  });
  const contributors: Contributor[] = contributorsRaw.map((c) => ({ login: c.login, avatarUrl: c.avatar_url, commits: c.contributions }));
  const commits: Commit[] = commitsRaw.map((c) => ({ sha: c.sha, message: c.commit.message.split('\n')[0], author: c.author?.login || c.commit.author?.name || 'Unknown author', date: c.commit.author?.date || '' }));
  const facts = [`Last push: ${repoInfo.pushed_at ? new Date(repoInfo.pushed_at).toLocaleDateString() : 'not available'}`, `Recent commits loaded: ${commits.length}`, `Merged pull requests checked: ${merged.length}`, `CONTRIBUTING.md ${contributing ? 'is present' : 'was not found'}`, `License: ${repoInfo.license?.spdx_id || 'not specified'}`, `Stars: ${repoInfo.stargazers_count}`];
  return { health: { verdict, facts }, issues, contributors, branches: branchesRaw.map((b) => b.name), commits, checklistFile: contributing, language: mainLanguage, stars: repoInfo.stargazers_count, license: repoInfo.license?.spdx_id || 'Not specified', filePaths: (tree.tree || []).filter((node: any) => node.type === 'blob').map((node: any) => node.path), mergedPulls: merged.map((p) => ({ number:p.number,title:p.title,url:p.html_url,author:p.user?.login || 'Unknown',body:p.body || '' })) };
}
export function beginAnalysis(base: RepoBase, credentials: Credentials): AnalysisSections {
  const { owner, repo, profile } = base;
  const facts = repoFacts(base, credentials.githubToken);
  const context = `Repository ${owner}/${repo}. User profile: ${JSON.stringify(profile)}.`;
  const plan = facts.then(async (f) => {
    const shortlist = f.issues.filter((i) => {
      const skill = i.language ? profile.languages[i.language.toLowerCase()] : undefined;
      const hourCap = profile.hours === '<2' ? 2 : profile.hours === '2-5' ? 3 : 5;
      return !!skill && i.difficulty <= Math.min(skill, profile.git + 1) && i.difficulty <= hourCap;
    }).sort((a,b) => {
      const score = (i: Issue) => profile.interests.reduce((n, interest) => n + (`${i.title} ${i.body} ${i.labels.join(' ')}`.toLowerCase().includes(interest) ? 1 : 0), 0);
      return score(b) - score(a);
    }).slice(0, 5);
    const chosen = shortlist[0];
    return generateIssuePlan(base, chosen || null, credentials);
  });
  const solved = facts.then(async (f) => {
    const pairs: any[] = [];
    for (const pr of f.mergedPulls) {
      const text = `${pr.title} ${pr.body}`; let m: RegExpExecArray | null;
      while ((m = matchesIssue(text).exec(text))) pairs.push({ issueNumber: Number(m[1]), prNumber: pr.number, prUrl: pr.url, author: pr.author, diff: `${pr.title} ${pr.body}`.slice(0,800) });
    }
    if (!pairs.length) return [];
    const uniqueNumbers = Array.from(new Set(pairs.map((p) => p.issueNumber))).slice(0,15);
    const issueTitles = await Promise.all(uniqueNumbers.map((number) => gh<any>(`/${owner}/${repo}/issues/${number}`, credentials.githubToken).then((item) => [number, item.title] as const).catch(() => [number, `Issue #${number}`] as const)));
    const titleMap = new Map(issueTitles);
    pairs.forEach((p) => { p.issueTitle = titleMap.get(p.issueNumber) || `Issue #${p.issueNumber}`; });
    const explain = await gemma<any>(credentials.geminiKey, `Return a JSON array with objects having issueNumber and explanation (1-2 plain sentences based only on supplied PR descriptions). ${context}\n${JSON.stringify(pairs.slice(0,15))}`);
    const parsed = typeof explain === 'string' ? cleanJson(explain) : explain;
    return pairs.slice(0,15).map((p) => ({ ...p, explanation: parsed.find((x: any) => x.issueNumber === p.issueNumber)?.explanation || 'The merged pull request title and description are available to review.' })) as SolvedItem[];
  });
  const areas = facts.then(async (f) => {
    const answer = await gemma<any>(credentials.geminiKey, `Return JSON array of up to 3 objects {title,why,issueNumbers} identifying areas needing help, using only these open issues. ${context}\n${JSON.stringify(f.issues.slice(0,50).map((i) => ({number:i.number,title:i.title,labels:i.labels,language:i.language})))}`);
    return (typeof answer === 'string' ? cleanJson(answer) : answer) as HelpArea[];
  });
  const checklist = facts.then(async (f) => {
    const contributing = await gh<any>(`/${owner}/${repo}/contents/CONTRIBUTING.md`, credentials.githubToken).catch(() => null);
    const text = contributing?.content ? atob(contributing.content.replace(/\n/g, '')) : 'No CONTRIBUTING.md found. Use the project README and existing pull requests for guidance.';
    const answer = await gemma<any>(credentials.geminiKey, `Return a JSON array of concise strings with the project's actual contribution rules. Do not invent rules; say to check README if no rules. ${context}\n${text.slice(0,10000)}`);
    return (typeof answer === 'string' ? cleanJson(answer) : answer) as string[];
  });
  return { facts, plan, solved, areas, checklist };
}
export async function generateIssuePlan(base: RepoBase, issue: Issue | null, credentials: Credentials): Promise<Plan> {
  if (!issue) return { markdown: 'No open issue matched the languages, weekly time, and level in this profile. Try another public repository or update your level profile.', files: [] };
  const { owner, repo, profile } = base;
  const repoInfo = await gh<any>(`/${owner}/${repo}`, credentials.githubToken);
  const [readmeData, tree] = await Promise.all([
    gh<any>(`/${owner}/${repo}/readme`, credentials.githubToken),
    gh<any>(`/${owner}/${repo}/git/trees/${encodeURIComponent(repoInfo.default_branch)}?recursive=1`, credentials.githubToken),
  ]);
  const readme = atob(readmeData.content.replace(/\n/g, ''));
  const paths = new Set<string>((tree.tree || []).filter((node: any) => node.type === 'blob').map((node: any) => node.path));
  const context = `Repository ${owner}/${repo}. User profile: ${JSON.stringify(profile)}.`;
  const result = await gemma<any>(credentials.geminiKey, `Return JSON only: {"markdown":"...","files":["path"]}. Write a plain-language contribution plan for exactly this open issue, not a different one. Explain why it fits this full profile, the problem, steps, tests, and choose only real paths from the repository. If uncertain use no paths. ${context}\nSelected issue:\n${JSON.stringify(issue)}\nREADME excerpt:\n${readme.slice(0,5000)}`);
  const parsed = typeof result === 'string' ? cleanJson(result) : result;
  return { markdown: String(parsed.markdown || ''), files: (Array.isArray(parsed.files) ? parsed.files : []).map((path: string) => ({ path, verified: paths.has(path) })) };
}
export async function gradeAnswer(key: string, answer: string, language = 'python'): Promise<{ score: number; reason: string }> {
  if (!key) throw new Error('MISSING_GEMINI_KEY');
  const call = async () => {
    const response = await fetch(`${GEMINI}/${LEVEL_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ systemInstruction:{parts:[{text:ALTERNATE_BUG_PROMPTS[language.toLowerCase()] || BUG_SYSTEM_PROMPT}]},contents:[{role:'user',parts:[{text:`<student_answer>\n${answer}\n</student_answer>`}]}] }),
    });
    if (!response.ok) throw new Error('Grading request failed');
    const json = await response.json(); const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = cleanJson(text); if (!Number.isInteger(parsed.score) || parsed.score < 0 || parsed.score > 3 || typeof parsed.reason !== 'string') throw new Error('Invalid grading response');
    return parsed as { score:number; reason:string };
  };
  try { return await call(); } catch { try { return await call(); } catch { return { score: 1, reason: 'The response could not be validated, so a cautious middle score was used.' }; } }
}
export async function draftComment(key: string, profile: Profile, issue: Issue, repo: string) {
  return gemma<string>(key, `Draft a short, polite comment asking to work on this issue. Be honest, specific to the issue, and do not claim experience not in this profile. Profile: ${JSON.stringify(profile)}. Repo ${repo}. Issue #${issue.number}: ${issue.title}\n${issue.body.slice(0,1200)}\nReturn only the comment text.`);
}
