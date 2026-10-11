import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clipboard, ClipboardCheck, Code2, ExternalLink, FileCheck2, GitBranch, GitMerge, GitPullRequest, Github, Lightbulb, LoaderCircle, LockKeyhole, Moon, Plus, Search, Settings2, ShieldCheck, Sun, X } from 'lucide-react';
import { beginAnalysis, discoverRepositories, draftComment, generateIssuePlan, getCurrentUser, getWorkspace, gradeAnswer, loginAccount, registerAccount, saveUserProfile, saveWorkspace, signInWithGithub, signOut, type AuthUser, type Credentials } from '@/lib/api';
import { LEVEL_LABELS, PYTHON_BUG, QUESTIONS, gradeCollab, gradeGit, languageLevel, matchingDifficulty, safeProfile } from '@/lib/levelCheck';
import type { AnalysisSections, Commit, ContributionWorkspace, Contributor, HelpArea, Issue, Plan, Profile, RepoFacts, RepoRecommendation, SolvedItem, WorkspaceStatus } from '@/lib/types';
import './index.css';

const GITHUB_PROJECT = 'https://github.com/teamclover/kodiset';
const EXAMPLES = ['https://github.com/vitejs/vite', 'https://github.com/pallets/flask', 'https://github.com/rust-lang/rust'];
const snippets: Record<string,string> = {
  python: PYTHON_BUG,
  javascript: 'function average(nums) {\n  let total = 0;\n  for (const n of nums) total += n;\n  return total / nums.length;\n}',
  typescript: 'function average(nums: number[]): number {\n  let total = 0;\n  for (const n of nums) total += n;\n  return total / nums.length;\n}',
  c: 'double average(int nums[], int length) {\n  int total = 0;\n  for (int i = 0; i < length; i++) total += nums[i];\n  return (double) total / length;\n}',
  'c++': 'double average(const std::vector<int>& nums) {\n  int total = 0;\n  for (int n : nums) total += n;\n  return static_cast<double>(total) / nums.size();\n}',
  java: 'double average(int[] nums) {\n  int total = 0;\n  for (int n : nums) total += n;\n  return (double) total / nums.length;\n}',
  go: 'func average(nums []int) float64 {\n  total := 0\n  for _, n := range nums { total += n }\n  return float64(total) / float64(len(nums))\n}',
  rust: 'fn average(nums: &[i32]) -> f64 {\n  let total: i32 = nums.iter().sum();\n  total as f64 / nums.len() as f64\n}',
  php: 'function average(array $nums): float {\n  $total = 0;\n  foreach ($nums as $n) $total += $n;\n  return $total / count($nums);\n}',
  'html/css': '<!-- What happens when this list is empty? -->\n<ul class="results">\n  <li class="average">Average: <span id="value"></span></li>\n</ul>\n<style>.average { content: calc(10px / 0); }</style>',
  sql: 'SELECT SUM(score) / COUNT(*) AS average_score\nFROM submissions\nWHERE course_id = 12;\n-- What happens when no submissions match?',
};
type Answers = Record<string, string | number | string[]>;

function Button({ children, kind = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'quiet' | 'outline' }) {
  return <button {...props} className={`button button-${kind} ${className}`}>{children}</button>;
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
function RepoSignalField() {
  const signals = [
    { icon: Github, label: 'github', className: 'signal-one' },
    { icon: GitBranch, label: 'branch', className: 'signal-two' },
    { icon: GitPullRequest, label: 'pull request', className: 'signal-three' },
    { icon: GitMerge, label: 'merge', className: 'signal-four' },
    { icon: LoaderCircle, label: 'processing', className: 'signal-five' },
    { icon: GitBranch, label: 'branch', className: 'signal-six' },
  ];
  return <div className="repo-signal-field" aria-hidden="true">{signals.map(({ icon: Icon, label, className }) => <span className={`repo-signal ${className}`} key={className}><Icon size={20}/><small>{label}</small></span>)}</div>;
}
function Footer() {
  return <footer className="site-footer"><div><b>Kodiset by Team Clover</b><span>Gemma can be wrong. Always read the real code.</span></div><nav aria-label="Footer links"><Link href="/docs/api-key" className="footer-link">Gemini API key guide</Link><a href={GITHUB_PROJECT} target="_blank" rel="noreferrer" className="footer-link">GitHub repository <ArrowUpRight size={14}/></a></nav></footer>;
}
function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState(''); const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false);
  if (!open) return null;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      const result = mode === 'login' ? await loginAccount(email, password) : await registerAccount(email, password, name);
      window.dispatchEvent(new CustomEvent('kodiset-auth-changed', { detail: result.user })); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not complete sign in.'); } finally { setSubmitting(false); }
  }
  return <div className="auth-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="icon-btn auth-close" onClick={onClose} aria-label="Close sign in"><X size={18}/></button><span className="eyebrow">YOUR CONTRIBUTION PROFILE</span><h2 id="auth-title">Keep your progress with you.</h2><p className="auth-lede">Sign in to save your level, skills, and guide preferences across visits.</p><div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button></div><form onSubmit={(event) => void submit(event)}>{mode === 'register' && <label className="auth-field">Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your name" /></label>}<label className="auth-field">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" /></label><label className="auth-field">Password<input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" /></label>{error && <p className="inline-error" role="alert">{error}</p>}<Button className="wide" disabled={submitting}>{submitting ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</Button></form><div className="auth-divider"><span>or</span></div><Button kind="outline" className="wide" onClick={signInWithGithub}><Github size={16}/> Continue with GitHub</Button><p className="auth-footnote">Your password is stored as a one-way hash. Sessions use HTTP-only cookies.</p></section></div>;
}
function Header({ onSettings, dark, toggleDark }: { onSettings: () => void; dark: boolean; toggleDark: () => void }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => setAuthError('')).finally(() => setAuthLoading(false));
    const onAuthChanged = (event: Event) => setUser((event as CustomEvent<AuthUser>).detail);
    window.addEventListener('kodiset-auth-changed', onAuthChanged);
    return () => window.removeEventListener('kodiset-auth-changed', onAuthChanged);
  }, []);
  async function handleSignOut() {
    try {
      await signOut();
      setUser(null);
    } catch {
      setAuthError('Could not sign out. Try again.');
    }
  }
  return <><header className="topbar"><Link href="/" className="brand" aria-label="Kodiset home"><span className="brand-mark"><GitBranch size={19}/></span><span>Kodiset</span></Link><nav className="top-links"><a href="#how-it-works">How it works</a><a href={GITHUB_PROJECT} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13}/></a><button className="icon-btn" onClick={toggleDark} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button>{user ? <button className="account-chip" onClick={() => void handleSignOut()} title="Sign out">{user.avatarUrl ? <img src={user.avatarUrl} alt=""/> : <Github size={15}/>}<span>{user.name || user.login}</span></button> : !authLoading && <Button kind="outline" onClick={() => setAuthOpen(true)}><Github size={16}/> Sign in</Button>}<Button kind="outline" onClick={onSettings}><Settings2 size={16}/> Settings</Button></nav>{authError && <span className="auth-error" role="status">{authError}</span>}</header><AuthDialog open={authOpen} onClose={() => setAuthOpen(false)}/></>;
}
function parseRepo(value: string) {
  const match = value.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)\/?$/i);
  return match ? { owner: match[1], repo: match[2].replace(/\.git$/i, '') } : null;
}
function SettingsDrawer({ open, onClose, profile, onRetake, credentials, setCredentials }: { open: boolean; onClose: () => void; profile: Profile | null; onRetake: () => void; credentials: Credentials; setCredentials: (c: Credentials) => void }) {
  const [showGemini, setShowGemini] = useState(false); const [showGithub, setShowGithub] = useState(false); const [saved, setSaved] = useState(false);
  useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [open, onClose]);
  if (!open) return null;
  return <div className="drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div className="drawer-head"><div><span className="eyebrow">PREFERENCES</span><h2 id="settings-title">Settings</h2></div><button className="icon-btn" aria-label="Close settings" onClick={onClose}><X/></button></div>
    <div className="drawer-content">
      <div className="security-note"><LockKeyhole size={18}/><span>Your credentials stay in this browser session. They are sent only to Google or GitHub when you request analysis.</span></div>
      <label className="field-label" htmlFor="gemini-key">Gemini API key <span className="required">Required for analysis</span></label>
      <div className="secret-field"><input id="gemini-key" type={showGemini ? 'text' : 'password'} autoComplete="off" value={credentials.geminiKey} onChange={(e) => { setCredentials({ ...credentials, geminiKey: e.target.value }); setSaved(false); }} placeholder="Paste your Gemini API key" /><button className="text-action" onClick={() => setShowGemini(!showGemini)}>{showGemini ? 'Hide' : 'Show'}</button></div>
      <p className="helper">Used only in your browser session. Never saved to a server. <Link href="/docs/api-key" onClick={onClose}>How to get a key <ArrowUpRight size={13}/></Link></p>
      <label className="field-label" htmlFor="github-token">GitHub token <span className="optional">Optional</span></label>
      <div className="secret-field"><input id="github-token" type={showGithub ? 'text' : 'password'} autoComplete="off" value={credentials.githubToken} onChange={(e) => { setCredentials({ ...credentials, githubToken: e.target.value }); setSaved(false); }} placeholder="ghp_…" /><button className="text-action" onClick={() => setShowGithub(!showGithub)}>{showGithub ? 'Hide' : 'Show'}</button></div>
      <p className="helper">Optional. Raises the GitHub limit from about 60 to 5,000 requests per hour. One analysis uses about 12 to 14 requests.</p>
      <div className="settings-profile"><div className="section-title"><span>Your level profile</span><span className="profile-saved">{profile ? 'Saved in this browser' : 'Not set yet'}</span></div>{profile ? <div className="profile-pills"><span>Git L{profile.git}</span><span>Collab L{profile.collab}</span>{Object.entries(profile.languages).map(([lang, level]) => <span key={lang}>{lang} L{level}</span>)}</div> : <p className="helper">Take a short check to tune your suggestions.</p>}<Button kind="outline" className="wide" onClick={onRetake}>Retake level check</Button></div>
    </div><div className="drawer-actions"><Button className="wide" onClick={() => { sessionStorage.setItem('kodiset-gemini-key', credentials.geminiKey); sessionStorage.setItem('kodiset-github-token', credentials.githubToken); setSaved(true); }}>{saved ? <><Check size={16}/> Saved for this session</> : 'Save settings'}</Button></div>
  </aside></div>;
}

function Discovery({ profile, onStart }: { profile: Profile; onStart: (url: string) => void }) {
  const [repositories, setRepositories] = useState<RepoRecommendation[] | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  async function findRepositories() {
    setLoading(true); setError('');
    try { setRepositories(await discoverRepositories(profile, sessionStorage.getItem('kodiset-github-token') || '')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not find repositories right now.'); }
    finally { setLoading(false); }
  }
  return <section className="discovery-section wrap"><div className="discovery-heading"><div><span className="eyebrow">MATCHED TO YOUR PROFILE</span><h2>Find a repository to grow in.</h2><p>We look for active public projects with beginner-friendly issues in your strongest languages.</p></div><Button kind="outline" onClick={() => void findRepositories()} disabled={loading}>{loading ? <LoaderCircle size={16} className="spin"/> : <Search size={16}/>} {loading ? 'Searching GitHub…' : repositories ? 'Refresh matches' : 'Find repositories'}</Button></div>{error && <p className="inline-error" role="alert">{error}</p>}{repositories && (repositories.length ? <div className="discovery-grid">{repositories.map((repository) => <article className="discovery-card" key={repository.fullName}><div className="discovery-card-top"><span className="mono">{repository.fullName}</span><span className="match-score">{repository.score} fit</span></div><p>{repository.description}</p><div className="discovery-meta"><span>{repository.language || 'Mixed languages'}</span><span>{repository.openIssues} open issues</span><span>{repository.stars.toLocaleString()} stars</span></div><div className="discovery-reasons">{repository.reasons.map((reason) => <span key={reason}><CheckCircle2 size={12}/>{reason}</span>)}</div><div className="discovery-actions"><Button onClick={() => onStart(repository.url)}>Analyze this repo <ArrowRight size={14}/></Button><a href={repository.url} target="_blank" rel="noreferrer" aria-label={`Open ${repository.fullName} on GitHub`}><ExternalLink size={15}/></a></div></article>)}</div> : <div className="empty-inline">No strong matches were found. Try adding a language in your level profile or paste a repository directly.</div>)}</section>;
}
function Landing({ onSettings, dark, toggleDark, onStart, profile }: { onSettings: () => void; dark: boolean; toggleDark: () => void; onStart: (url: string) => void; profile: Profile | null }) {
  const [repoUrl, setRepoUrl] = useState(''); const [error, setError] = useState('');
  const submit = () => { if (!parseRepo(repoUrl)) { setError('Enter a valid GitHub repository link, such as github.com/owner/repo.'); return; } setError(''); onStart(repoUrl); };
  return <><Header onSettings={onSettings} dark={dark} toggleDark={toggleDark}/><main>
    <section className="hero">
      <div className="network-field" aria-hidden="true"/><RepoSignalField/><div className="hero-content">
        <span className="eyebrow hero-kicker"><span className="live-dot"/> OPEN SOURCE, ONE STEP AT A TIME</span>
        <h1 className="display">Contribute with<br/><em>a plan.</em></h1>
        <p className="hero-sub">Paste a repository. Get one clear first contribution, matched to your level.</p>
        <div className={`repo-entry ${error ? 'has-error' : ''}`}><Github size={20}/><input aria-label="GitHub repository URL" value={repoUrl} onChange={(e) => { setRepoUrl(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="https://github.com/owner/repo"/><Button onClick={submit}>Analyze repository <ArrowRight size={16}/></Button></div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {profile && <p className="profile-reminder"><CheckCircle2 size={15}/> Your level profile is ready. <button onClick={onSettings}>Review settings</button></p>}
        <div className="examples"><span>Try a repository</span>{EXAMPLES.map((example) => <button key={example} onClick={() => { setRepoUrl(example); setError(''); }} className="example-chip">{example.replace('https://github.com/', '')}</button>)}</div>
      </div>
      <div className="hero-index"><span>01</span><span>REPO → ROUTE → REVIEW</span></div>
    </section>
    {profile && <Discovery profile={profile} onStart={onStart}/>}<section id="how-it-works" className="process-section wrap"><div className="section-intro"><span className="eyebrow">A SMALL, PRACTICAL WORKFLOW</span><h2>From repo link<br/>to your first PR.</h2></div><div className="process-steps">{['Paste a repo', 'Take the short level check', 'Get your plan', 'Ask for the issue'].map((item, i) => <div className="process-step" key={item}><span className="step-number">0{i + 1}</span><span>{item}</span>{i < 3 && <ArrowRight className="process-arrow" size={16}/>}</div>)}</div></section>
    <section className="why-band"><div className="wrap why-inner"><div className="why-heading"><span className="eyebrow">WHY KODISET EXISTS</span><h2>Good first contributions<br/>should feel possible.</h2></div><div className="why-copy"><article><div className="why-icon"><CircleHelp size={19}/></div><div><h3>Starting is hard</h3><p>It is not obvious where to begin. Issues may already be taken, the project may be quiet, and every repository has its own rules.</p></div></article><article><div className="why-icon"><Lightbulb size={19}/></div><div><h3>Understand what you ship</h3><p>AI can help with code, but a contribution is yours when you can explain the change. Kodiset focuses on the why, not a paste-ready patch.</p></div></article></div></div></section>
  </main><Footer/></>;
}

function DocsPage({ onSettings, dark, toggleDark }: { onSettings: () => void; dark: boolean; toggleDark: () => void }) {
  const [, setLocation] = useLocation();
  return <><header className="topbar"><Link href="/" className="brand"><span className="brand-mark"><GitBranch size={19}/></span><span>Kodiset</span></Link><nav className="top-links"><Link href="/" className="docs-nav-link">Analyzer</Link><button className="icon-btn" onClick={toggleDark} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</button><Button kind="outline" onClick={onSettings}><Settings2 size={16}/> Settings</Button></nav></header><main className="docs-main">
    <div className="breadcrumbs"><Link href="/">Kodiset</Link><ChevronRight size={14}/><span>Gemini API key guide</span></div>
    <div className="docs-title"><span className="eyebrow">DOCUMENTATION / SETUP</span><h1 className="display">A key, on your terms.</h1><p>Kodiset uses Gemini to explain issues and shape a plan. You bring the key; it stays in this browser session.</p></div>
    <div className="docs-layout"><nav className="docs-side" aria-label="On this page"><span>ON THIS PAGE</span><a href="#get-key">Get a Gemini key</a><a href="#use-key">Use it in Kodiset</a><a href="#privacy">What happens to it</a></nav><div className="docs-article">
      <section id="get-key"><div className="doc-number">01</div><div><h2>Get a Gemini API key</h2><p>Open Google AI Studio and create a key for a Google Cloud project. Follow Google's current setup steps and keep the key private.</p><a className="doc-cta" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Open Google AI Studio <ExternalLink size={15}/></a><p className="helper">This link goes to the official Google AI Studio API key page.</p></div></section>
      <section id="use-key"><div className="doc-number">02</div><div><h2>Add it to Kodiset</h2><ol><li>Return to the analyzer and open <b>Settings</b>.</li><li>Paste your key into the Gemini API key field.</li><li>Save settings for this browser session, then analyze a public repository.</li></ol><Button kind="outline" onClick={() => { sessionStorage.setItem('kodiset-open-settings', 'true'); setLocation('/'); }}>Open analyzer settings <ArrowRight size={15}/></Button></div></section>
      <section id="privacy"><div className="doc-number">03</div><div><h2>What happens to the key</h2><div className="privacy-callout"><ShieldCheck size={19}/><p>Kodiset keeps the key in this browser session only. It is not saved to a Kodiset server or local storage. It is sent from your browser directly to Google's Gemini API when you request AI-generated text. Close the browser session to clear it.</p></div><p>Repository data is requested from GitHub's public REST API. An optional GitHub token is also kept for this session and sent only to GitHub to increase the request limit.</p><p>Only use a key you are comfortable using in this browser. You can remove it in Settings at any time.</p></div></section>
    </div></div>
  </main><Footer/></>;
}

function LevelCheck({ onComplete, onCancel, onOpenSettings }: { onComplete: (p: Profile) => void; onCancel?: () => void; onOpenSettings: () => void }) {
  const [answers, setAnswers] = useState<Answers>({}); const [gradeState, setGradeState] = useState<{score:number;reason:string}|null>(null); const [grading, setGrading] = useState(false);
  const chosen = (answers.languages as string[] | undefined) || [];
  const sequence = useMemo<{id:string;group:string;question:string;options:readonly string[];multi?:boolean}[]>(() => {
    const base: {id:string;group:string;question:string;options:readonly string[];multi?:boolean}[] = [QUESTIONS[0], QUESTIONS[1], QUESTIONS[2], QUESTIONS[3], QUESTIONS[4]];
    chosen.slice(0,2).forEach((lang, idx) => { base.push({ ...QUESTIONS[5], id: `programSize:${lang}`, question: `Largest program you have written in ${lang}?` } as any); base.push({ ...QUESTIONS[6], id: `languageTools:${lang}`, question: `Which have you used in ${lang}?` } as any); base.push({ ...QUESTIONS[7], id: `bugAnswer:${lang}`, question: `Find the bug in this ${lang} code. What is wrong, and how would you fix it?` } as any); });
    base.push(QUESTIONS[8], QUESTIONS[9]); return base;
  }, [chosen.join('|')]);
  const [step, setStep] = useState(0); const current = sequence[step]; const selected = answers[current?.id];
  useEffect(() => {
    const onKeys = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') { if (e.key === 'Enter' && e.metaKey) void next(); return; }
      if (e.key === 'ArrowLeft' && step > 0) setStep((s) => s - 1);
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); void next(); }
      if (/^[1-4]$/.test(e.key) && current?.options[Number(e.key) - 1]) choose(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKeys); return () => window.removeEventListener('keydown', onKeys);
  });
  function choose(index: number) {
    if (current.id === 'languages') {
      const name = current.options[index]; const next = chosen.includes(name) ? chosen.filter((v) => v !== name) : chosen.length < 2 ? [...chosen, name] : chosen;
      setAnswers({ ...answers, languages: next }); return;
    }
    if (current.multi) {
      const prev = (selected as string[] | undefined) || []; const label = current.options[index];
      setAnswers({ ...answers, [current.id]: prev.includes(label) ? prev.filter((v) => v !== label) : [...prev, label] });
    } else setAnswers({ ...answers, [current.id]: index });
  }
  function scoreProfile(): Profile {
    const num = (key: string) => Number(answers[key] ?? 0);
    const git = gradeGit(num('gitWorkflow'), num('pullRequests'));
    const collab = gradeCollab(num('collabCode'), Math.min(3, ((answers.collabTasks as string[] | undefined) || []).length));
    const langs: Record<string, 1|2|3|4|5> = {};
    chosen.slice(0,2).forEach((lang) => { const score = num(`programSize:${lang}`) + Math.min(4, ((answers[`languageTools:${lang}`] as string[] | undefined) || []).length) + (answers[`bugScore:${lang}`] !== undefined ? num(`bugScore:${lang}`) : 0); langs[lang.toLowerCase()] = languageLevel(score); });
    const hourValue = num('hours'); const hours: Profile['hours'] = hourValue === 0 ? '<2' : hourValue === 1 ? '2-5' : '5+';
    const knowledge = Array.from(new Set([
      ...(((answers.collabTasks as string[] | undefined) || []).map((item) => item.toLowerCase())),
      ...chosen.flatMap((lang) => (((answers[`languageTools:${lang}`] as string[] | undefined) || []).map((item) => `${lang}: ${item.toLowerCase()}`))),
    ]));
    return { git, collab, languages: langs, knowledge, hours, interests: ((answers.interests as string[] | undefined) || []).map((x) => x.toLowerCase()) };
  }
  async function next() {
    if (!current) return;
    if (current.id.startsWith('bugAnswer:') && String(selected || '').trim() && !gradeState) {
      setGrading(true);
      const lang = current.id.split(':')[1].toLowerCase();
      const creds = { geminiKey: sessionStorage.getItem('kodiset-gemini-key') || '', githubToken: sessionStorage.getItem('kodiset-github-token') || '' };
      if (!creds.geminiKey) { setGrading(false); onOpenSettings(); return; }
      const grade = await gradeAnswer(creds.geminiKey, String(selected), lang);
      setAnswers((a) => ({ ...a, [`bugScore:${lang}`]: grade.score })); setGradeState(grade); setGrading(false); return;
    }
    if (current.id.startsWith('bugAnswer:') && gradeState) setGradeState(null);
    if (step < sequence.length - 1) setStep((s) => s + 1);
    else onComplete(scoreProfile());
  }
  function skip() { onComplete(safeProfile()); }
  const completed = (typeof selected === 'number' || typeof selected === 'string' && selected.length > 0 || Array.isArray(selected) && selected.length > 0);
  if (!current) return null;
  const bugLang = current.id.startsWith('bugAnswer:') ? current.id.split(':')[1].toLowerCase() : '';
  return <main className="level-shell"><div className="network-field" aria-hidden="true"/><div className="level-top"><Link href="/" className="brand"><span className="brand-mark"><GitBranch size={19}/></span><span>Kodiset</span></Link><button className="text-action" onClick={skip}>Skip for now <ArrowRight size={14}/></button></div><div className="level-panel fade-in">
    <div className="level-meta"><span className="eyebrow">{current.group}</span><span>Step {step + 1} of {sequence.length}</span></div><div className="progress-track"><span style={{ width: `${((step + 1) / sequence.length) * 100}%` }}/></div>
    <h1 className="display level-question">{current.question}</h1>
    {current.id === 'languages' && <p className="level-hint">Choose up to two. We will ask a few short questions for each.</p>}
    {current.id.startsWith('bugAnswer:') && <><pre className="code-snippet"><code>{snippets[bugLang] || snippets.python}</code></pre><label className="sr-only" htmlFor="bug-answer">Your explanation</label><textarea id="bug-answer" className="answer-box" value={String(selected || '')} onChange={(e) => { setAnswers({ ...answers, [current.id]: e.target.value }); setGradeState(null); }} placeholder="Describe the edge case and how you would handle it…" />{grading && <div className="grading-state"><LoaderCircle className="spin" size={16}/> Grading your answer…</div>}{gradeState && <div className="grade-chip"><CheckCircle2 size={16}/> Score {gradeState.score}/3 · {gradeState.reason}</div>}<button className="text-action skip-question" onClick={() => { setAnswers((a) => ({ ...a, [`bugScore:${bugLang}`]: 0 })); setGradeState({score:0,reason:'Skipped by choice; no code-reading score was applied.'}); setStep((s) => Math.min(sequence.length - 1, s + 1)); }}>Skip this question <ArrowRight size={13}/></button></>}
    {!current.id.startsWith('bugAnswer:') && <div className={`option-grid ${current.multi ? 'multi' : ''}`}>{current.options.map((option, idx) => {
      const active = current.id === 'languages' ? chosen.includes(option) : current.multi ? ((selected as string[] | undefined) || []).includes(option) : selected === idx;
      return <button key={option} className={`option-card ${active ? 'selected' : ''}`} onClick={() => choose(idx)} aria-pressed={active}><span className="option-indicator">{active && <Check size={15}/>}</span><span>{option}</span>{current.multi && <span className="option-plus">{active ? 'Selected' : 'Select'}</span>}</button>;
    })}</div>}
    {current.id === 'hours' && <p className="level-hint">This helps size the first issue suggestion, not assess your skill.</p>}
    <div className="step-actions"><Button kind="outline" disabled={step === 0 || grading} onClick={() => setStep((s) => Math.max(0, s - 1))}><ArrowLeft size={15}/> Back</Button><Button onClick={() => void next()} disabled={grading || (current.id === 'languages' && chosen.length > 2) || (!completed && !current.id.startsWith('bugAnswer:')) || (current.id.startsWith('bugAnswer:') && !String(selected || '').trim() && !gradeState)}>{current.id.startsWith('bugAnswer:') && !gradeState && String(selected || '').trim() ? 'Check my answer' : step === sequence.length - 1 ? 'See my profile' : 'Continue'} <ArrowRight size={15}/></Button></div>
    <div className="keyboard-hint">Use number keys to choose · arrows to move</div>
  </div><p className="level-footnote">This check is self-reported, except for the code-reading question.</p></main>;
}

function LevelSummary({ profile, onContinue, onRetake }: { profile: Profile; onContinue: () => void; onRetake: () => void }) {
  const Meter = ({ level }: { level: number }) => <div className="meter" aria-label={`Level ${level} of 5`}>{[1,2,3,4,5].map((n) => <i key={n} className={n <= level ? 'filled' : ''}/>)}</div>;
  return <div className="summary-overlay"><div className="summary-card card"><div className="summary-heading"><span className="eyebrow">YOUR PROFILE</span><h2 className="display">A useful starting point.</h2><p>This profile tunes how Kodiset explains things and which issues it suggests.</p></div><div className="level-summary-row">{[['Git workflow',profile.git],['Collaboration',profile.collab]].map(([name,level]) => <div className="level-summary-item" key={String(name)}><span>{name}</span><b>L{level}</b><Meter level={Number(level)}/></div>)}</div><div className="summary-languages"><span className="field-label">Languages</span>{Object.keys(profile.languages).length ? Object.entries(profile.languages).map(([lang, level]) => <span className="language-level" key={lang}><Code2 size={14}/>{lang} <b>L{level}</b><small>{LEVEL_LABELS[level - 1]}</small></span>) : <span className="helper">No languages selected yet.</span>}</div><div className="summary-chips"><span>{profile.hours} hours / week</span>{profile.interests.map((interest) => <span key={interest}>{interest}</span>)}</div><p className="honest-note">This is self-reported, except for the bug question. It only tunes how Kodiset explains things and which issues it suggests.</p><div className="summary-actions"><Button kind="outline" onClick={onRetake}>Retake</Button><Button onClick={onContinue}>Looks right, continue <ArrowRight size={15}/></Button></div></div></div>;
}

function Status({ issue }: { issue: Issue }) {
  if (issue.status.kind === 'assigned') return <span className="status status-taken"><LockKeyhole size={12}/>Assigned to {issue.status.to}</span>;
  if (issue.status.kind === 'pr') return <span className="status status-pr"><GitBranch size={12}/>Open PR #{issue.status.number} targets it</span>;
  return <span className="status status-free"><CheckCircle2 size={12}/>Free</span>;
}
const TAB_NAMES = ['Your first contribution', 'Solved problems', 'People and branches', 'Areas that need help', 'Repo check'];
function Skeleton({ rows = 3 }: { rows?: number }) { return <div className="skeleton-stack" aria-label="Loading content">{Array.from({length:rows},(_,i)=><div key={i} className="skeleton-row"><i/><span/><b/></div>)}</div>; }
function Results({ base, credentials, sections, onNew, onSettings }: { base: {owner:string;repo:string;profile:Profile}; credentials: Credentials; sections: AnalysisSections; onNew:()=>void; onSettings:()=>void }) {
  const [tab, setTab] = useState(0); const [facts, setFacts] = useState<RepoFacts|null>(null); const [plan, setPlan] = useState<Plan|null>(null); const [solved, setSolved] = useState<SolvedItem[]|null>(null); const [areas, setAreas] = useState<HelpArea[]|null>(null); const [checklist, setChecklist] = useState<string[]|null>(null);
  const [errors, setErrors] = useState<Record<string,string>>({}); const [loading, setLoading] = useState<Record<string,boolean>>({facts:true,plan:true,solved:true,areas:true,checklist:true});
  const [activeNum, setActiveNum] = useState<number|null>(null); const [freeOnly, setFreeOnly] = useState(false); const [draft, setDraft] = useState(''); const [drafting, setDrafting] = useState(false); const [copied, setCopied] = useState(false); const [done, setDone] = useState<Record<string,boolean>>(() => JSON.parse(localStorage.getItem('kodiset-done') || '{}')); const [openStep, setOpenStep] = useState<number|null>(0);
  const [workspace, setWorkspace] = useState<ContributionWorkspace | null>(null); const [workspaceLoaded, setWorkspaceLoaded] = useState(false); const [notes, setNotes] = useState(''); const [branchName, setBranchName] = useState(''); const [prUrl, setPrUrl] = useState(''); const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>('planned');
  useEffect(() => {
    const tasks: [string, Promise<any>, (v:any)=>void][] = [['facts',sections.facts,setFacts],['plan',sections.plan,setPlan],['solved',sections.solved,setSolved],['areas',sections.areas,setAreas],['checklist',sections.checklist,setChecklist]];
    tasks.forEach(([key,promise,setter]) => promise.then((v) => { setter(v); setLoading((s)=>({...s,[key]:false})); }).catch((e) => { setErrors((s)=>({...s,[key]:String(e.message || e)})); setLoading((s)=>({...s,[key]:false})); }));
  }, [sections]);
  useEffect(() => {
    getWorkspace().then((saved) => {
      if (!saved) return;
      setWorkspace(saved); setActiveNum(saved.issueNumber); setDraft(saved.draftComment); setNotes(saved.notes); setBranchName(saved.branchName); setPrUrl(saved.prUrl); setWorkspaceStatus(saved.status); setDone((current) => ({ ...current, ...saved.checklist }));
    }).catch(() => undefined).finally(() => setWorkspaceLoaded(true));
  }, []);
  const allIssues = facts?.issues || [];
  const cap = base.profile.hours === '<2' ? 2 : base.profile.hours === '2-5' ? 3 : 5;
  const candidates = allIssues.filter((issue) => issue.difficulty <= cap && matchingDifficulty(base.profile, issue));
  const ranked = candidates.sort((a,b) => {
    const score = (issue:Issue) => base.profile.interests.reduce((sum,interest)=>sum + (`${issue.title} ${issue.body} ${issue.labels.join(' ')}`.toLowerCase().includes(interest) ? 1 : 0),0);
    return score(b)-score(a);
  }).slice(0,5);
  const activeIssue = allIssues.find((i)=>i.number === activeNum) || ranked[0] || null;
  function workspacePayload(overrides: Partial<ContributionWorkspace> = {}): ContributionWorkspace | null {
    if (!activeIssue) return null;
    return { repoOwner: base.owner, repoName: base.repo, issueNumber: activeIssue.number, issueTitle: activeIssue.title, status: workspaceStatus, notes, draftComment: draft, branchName, prUrl, checklist: done, ...overrides };
  }
  function persistWorkspace(overrides: Partial<ContributionWorkspace> = {}) { const payload = workspacePayload(overrides); if (!payload || !workspaceLoaded) return; setWorkspace(payload); void saveWorkspace(payload).catch(() => setErrors((current) => ({ ...current, workspace: 'Could not save your workspace. Your local progress is still available.' }))); }
  const changeDone = (id:string) => { const next={...done,[id]:!done[id]}; setDone(next); localStorage.setItem('kodiset-done',JSON.stringify(next)); persistWorkspace({ checklist: next }); };
  async function copySummary() { const summary = `${base.owner}/${base.repo}\nSuggested issue: ${activeIssue ? `#${activeIssue.number} ${activeIssue.title}` : 'No matched issue found'}\nProfile: Git L${base.profile.git}${Object.entries(base.profile.languages).map(([l,v])=>`, ${l} L${v}`).join('')}`; await navigator.clipboard.writeText(summary); setCopied(true); setTimeout(()=>setCopied(false),1800); }
  async function makeDraft() { if (!activeIssue) return; if (!credentials.geminiKey) { onSettings(); return; } setDrafting(true); try { const generated = await draftComment(credentials.geminiKey,base.profile,activeIssue,`${base.owner}/${base.repo}`); setDraft(generated); persistWorkspace({ draftComment: generated }); } catch (e:any) { setErrors((s)=>({...s,draft:e.message || 'Could not draft this comment.'})); } finally { setDrafting(false); } }
  const loadPlanFor = (issue: Issue | null) => {
    setErrors((e)=>({...e,plan:''})); setLoading((l)=>({...l,plan:true}));
    generateIssuePlan(base,issue,credentials).then((v)=>{setPlan(v);setLoading((l)=>({...l,plan:false}));}).catch((e)=>{setErrors((x)=>({...x,plan:e.message || 'Plan generation failed'}));setLoading((l)=>({...l,plan:false}));});
  };
  const reload = (key:string) => {
    setErrors((e)=>({...e,[key]:''})); setLoading((l)=>({...l,[key]:true}));
    if (key === 'plan') { loadPlanFor(activeIssue); return; }
    const retry = beginAnalysis(base,credentials);
    const request: Record<string,Promise<any>> = { facts:retry.facts, solved:retry.solved, areas:retry.areas, checklist:retry.checklist };
    request[key]?.then((v)=> {
      if (key === 'facts') setFacts(v); if (key === 'solved') setSolved(v); if (key === 'areas') setAreas(v); if (key === 'checklist') setChecklist(v);
      setLoading((l)=>({...l,[key]:false}));
    }).catch((e)=>{setErrors((x)=>({...x,[key]:e.message || 'Retry failed'}));setLoading((l)=>({...l,[key]:false}));});
  };
  function sectionError(key:string) { const error=errors[key]; if (!error) return null; const rate=error.includes('RATE_LIMIT'); const missing=error.includes('MISSING_GEMINI_KEY'); return <div className="error-card" role="alert"><CircleHelp size={18}/><div><b>{rate ? 'GitHub limit reached. Add a token in Settings.' : missing ? 'Add your Gemini key to continue.' : error.includes('NOT_FOUND') ? 'Repository not found or private.' : 'This section could not be loaded.'}</b><p>{error.includes('NOT_FOUND') ? 'Check that the repository link is correct and public.' : 'Other sections can still be explored.'}</p>{missing || rate ? <Button kind="outline" onClick={onSettings}>Open settings</Button> : <Button kind="outline" onClick={()=>reload(key)}>Retry this section</Button>}</div></div>; }
  const tabsKey=(e:React.KeyboardEvent<HTMLDivElement>)=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const next=(tab+(e.key==='ArrowRight'?1:TAB_NAMES.length-1))%TAB_NAMES.length;setTab(next);(e.currentTarget.querySelectorAll('[role="tab"]')[next] as HTMLElement)?.focus();};
  return <main className="results-page">
    <div className="results-bar"><div className="repo-title"><span className="repo-mark"><Github size={18}/></span><span className="mono">{base.owner}/{base.repo}</span></div><div className="result-badges"><span>Git L{base.profile.git}</span>{Object.entries(base.profile.languages).map(([l,n])=><span key={l}>{l} L{n}</span>)}</div><div className="result-actions"><Button kind="quiet" onClick={onNew}><Plus size={15}/> New analysis</Button><Button kind="outline" onClick={()=>void copySummary()}>{copied ? <ClipboardCheck size={15}/> : <Clipboard size={15}/>} {copied ? 'Copied' : 'Copy summary'}</Button></div></div>
    <div className="result-container"><div className="results-heading"><div><span className="eyebrow">REPOSITORY BRIEF</span><h1 className="display">A clearer way in.</h1><p>Read the project first. Pick one issue you can explain.</p></div><span className="analysis-badge"><span/> Analysis is based on live repository data</span></div>
      <div className="stats-grid">{[
        {name:'Project health',value:facts?.health.verdict || 'Checking…',detail:facts?.health.facts[0] || 'Reading repository activity',icon:<GitBranch/>},
        {name:'Open issues',value:facts ? String(facts.issues.length) : '—',detail:facts ? `${facts.issues.filter(i=>i.status.kind==='free').length} free to pick up` : 'Checking availability',icon:<CircleHelp/>},
        {name:'Solved problems',value:solved ? String(solved.length) : '—',detail:'Linked merged fixes',icon:<CheckCircle2/>},
        {name:'Contributors',value:facts ? String(facts.contributors.length) : '—',detail:'Public contributor accounts',icon:<Github/>},
      ].map((stat)=><div className="stat-card" key={stat.name}><div className="stat-icon">{stat.icon}</div><span>{stat.name}</span><b>{stat.value}</b><small>{stat.detail}</small></div>)}</div>
    {Object.values(loading).some(Boolean) && <div className="progress-notice"><div className="progress-notice-head"><LoaderCircle size={16} className="spin"/><b>Building your repo picture</b><span>The largest model can take 1 to 2 minutes.</span></div><div className="progress-list">{[['facts','Reading repository'],['facts','Checking which issues are taken'],['facts','Checking project health'],['plan','Writing your plan with Gemma']].map(([key,text],i)=><span className={loading[key]?'working':facts && key==='facts'||plan&&key==='plan'?'complete':''} key={`${text}${i}`}>{facts && key==='facts'||plan&&key==='plan'?<CheckCircle2 size={14}/>:loading[key]?<LoaderCircle size={14} className="spin"/>:<span className="progress-empty"/>}{text}</span>)}</div></div>}
      <div className="tabs-area"><div className="tab-list" role="tablist" aria-label="Repository analysis" onKeyDown={tabsKey}>{TAB_NAMES.map((name,i)=><button key={name} role="tab" id={`tab-${i}`} aria-controls={`panel-${i}`} aria-selected={tab===i} tabIndex={tab===i?0:-1} onClick={()=>setTab(i)}>{name}</button>)}</div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tab-panel">
        {tab===0 && <div className="contribution-layout">
          <div className="contribution-main">
            {base.profile.git<=2 && <Card className="first-pr-guide"><span className="eyebrow">YOUR FIRST PR</span><h2>Small steps, no mystery.</h2><div className="guide-list">{['Fork the repository to your account.','Clone your fork and create a branch for this change.','Make the smallest useful change, then run the project tests.','Commit and push your branch to your fork.','Open a pull request and explain what changed and why.','Expect questions or requests for changes during review; that is part of the process.'].map((line,i)=><div key={line}><span>{String(i+1).padStart(2,'0')}</span>{line}</div>)}</div></Card>}
            <Card><div className="card-topline"><div><span className="eyebrow">SHORTLIST</span><h2>Issues that fit your starting point</h2></div><span className="estimate-note">Difficulty is an estimate</span></div>
              {loading.facts?<Skeleton rows={4}/>:sectionError('facts') || (ranked.length ? <div className="shortlist">{ranked.map((issue,i)=><button className={`short-row ${activeIssue?.number===issue.number?'active':''}`} key={issue.number} onClick={()=>{setActiveNum(issue.number);setDraft('');persistWorkspace({ issueNumber: issue.number, issueTitle: issue.title, draftComment: '' });loadPlanFor(issue);}}><span className="issue-number">#{issue.number}</span><span className="short-title"><b>{issue.title}</b><small>{issue.language || 'Language not detected'} · {issue.labels.slice(0,2).join(', ') || 'No labels'}</small></span><span className="difficulty" aria-label={`Estimated difficulty ${issue.difficulty} of 5`}>{[1,2,3,4,5].map(n=><i key={n} className={n<=issue.difficulty?'on':''}/>)}</span><Status issue={issue}/><ChevronRight size={16}/></button>)}</div>:<div className="empty-state"><Code2/><h3>No matching issues found</h3><p>Kodiset did not find an open issue in your selected languages and current level. Try a different repository or update your profile.</p><Button kind="outline" onClick={onNew}>Try another repository</Button></div>)}
            </Card>
            {activeIssue && <Card className="suggested-card"><div className="suggested-top"><div><span className="eyebrow">SUGGESTED ISSUE</span><h2><a href={activeIssue.url} target="_blank" rel="noreferrer">#{activeIssue.number} {activeIssue.title} <ArrowUpRight size={17}/></a></h2></div><Status issue={activeIssue}/></div><div className="label-list">{activeIssue.labels.map((l)=><span key={l}>{l}</span>)}<span className="language-label">{activeIssue.language || 'Language unknown'}</span></div><div className="why-fit"><Lightbulb size={18}/><div><b>Why this fits you</b><p>This issue is estimated at level {activeIssue.difficulty}{activeIssue.language && base.profile.languages[activeIssue.language] ? `, within your ${activeIssue.language} level and Git experience` : ''}. Read the issue and repository guidance before deciding to take it on.</p></div></div><div className="issue-problem"><h3>What the problem is</h3><p>{activeIssue.body || 'The issue has no description yet. Review its comments and linked context before choosing it.'}</p></div>
              <div className="file-check"><h3>Files to read and change</h3>{loading.plan?<Skeleton rows={2}/>:sectionError('plan') ? sectionError('plan') : plan?.files.length ? plan.files.map((file)=><div className={`file-row ${file.verified?'verified':'unverified'}`} key={file.path}>{file.verified?<FileCheck2 size={16}/>:<CircleHelp size={16}/>}<code>{file.path}</code><span>{file.verified?'exists in the repository':'not found in the repository, double check'}</span></div>):<p className="helper">No file paths could be verified from the generated plan.</p>}</div>
              <div className="plan-copy"><h3>Your plan</h3>{loading.plan?<Skeleton rows={4}/>:sectionError('plan') || <div className="markdown-copy">{plan?.markdown || 'No plan is available yet.'}</div>}</div>
              <div className="workspace-panel"><div className="card-topline"><div><span className="eyebrow">YOUR CONTRIBUTION WORKSPACE</span><h3>Keep the work moving</h3></div><span className="workspace-save">{workspace ? 'Saved to your account' : 'Sign in to sync across devices'}</span></div>{errors.workspace && <p className="inline-error">{errors.workspace}</p>}<div className="workspace-fields"><label>Status<select value={workspaceStatus} onChange={(event) => { const value = event.target.value as WorkspaceStatus; setWorkspaceStatus(value); persistWorkspace({ status: value }); }}><option value="planned">Planned</option><option value="claimed">Claimed</option><option value="in progress">In progress</option><option value="PR opened">PR opened</option><option value="merged">Merged</option></select></label><label>Branch name<input value={branchName} onChange={(event) => setBranchName(event.target.value)} onBlur={() => persistWorkspace({ branchName })} placeholder="fix/issue-123" /></label><label>Pull request URL<input type="url" value={prUrl} onChange={(event) => setPrUrl(event.target.value)} onBlur={() => persistWorkspace({ prUrl })} placeholder="https://github.com/.../pull/123" /></label></div><label className="workspace-notes">Notes for yourself<textarea value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => persistWorkspace({ notes })} placeholder="What did you learn? What are you unsure about?" /></label></div>
              <div className="your-steps"><h3>Your steps</h3>{['Fork','Branch','Change','Test','Pull request'].map((label,i)=><div className="step-row" key={label}><div className="step-head"><button className={`mark-done step-check ${done[`${base.owner}/${base.repo}-${activeIssue.number}-${i}`]?'checked':''}`} aria-label={`${done[`${base.owner}/${base.repo}-${activeIssue.number}-${i}`]?'Unmark':'Mark'} ${label} done`} aria-pressed={!!done[`${base.owner}/${base.repo}-${activeIssue.number}-${i}`]} onClick={()=>changeDone(`${base.owner}/${base.repo}-${activeIssue.number}-${i}`)}>{done[`${base.owner}/${base.repo}-${activeIssue.number}-${i}`]&&<Check size={12}/>}</button><button className="step-expander" onClick={()=>setOpenStep(openStep===i?null:i)} aria-expanded={openStep===i}><b>{label}</b>{openStep===i?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button></div>{openStep===i&&<p>{plan?.markdown ? plan.markdown.split('\n').filter(Boolean)[i+1] || 'Read the repository instructions and complete this step in your own development environment.' : 'Read the repository instructions and complete this step in your own development environment.'}</p>}</div>)}</div>
              <div className="comment-panel"><div className="card-topline"><div><span className="eyebrow">START A CONVERSATION</span><h3>Draft my comment</h3></div><Button kind="outline" onClick={()=>void makeDraft()} disabled={drafting}>{drafting?<LoaderCircle size={15} className="spin"/>:<ArrowDownRight size={15}/>} {drafting?'Drafting…':'Draft a comment to ask for this issue'}</Button></div>{errors.draft&&<p className="inline-error">{errors.draft}</p>}<textarea aria-label="Editable issue comment draft" value={draft} onChange={(e)=>setDraft(e.target.value)} onBlur={()=>persistWorkspace({ draftComment: draft })} placeholder="Your draft will appear here. Edit it so it sounds like you."/><div className="comment-actions"><span>Edit it so it sounds like you. Post it yourself.</span><div><Button kind="quiet" disabled={!draft} onClick={()=>void navigator.clipboard.writeText(draft)}>Copy</Button><a className="small-link" href={activeIssue.url} target="_blank" rel="noreferrer">Open issue on GitHub <ExternalLink size={14}/></a></div></div></div>
            </Card>}
          </div>
          <aside className="contribution-side"><Card><span className="eyebrow">PROJECT GUIDANCE</span><h3>Before you start</h3><p>Read the repository's own contributing instructions, then check recent discussion on the issue.</p><div className="checklist-status">{facts?.checklistFile?<><CheckCircle2 size={16}/> CONTRIBUTING.md found</>:<><CircleHelp size={16}/> CONTRIBUTING.md not found</>}</div><h4>Contributing checklist</h4>{loading.checklist?<Skeleton rows={3}/>:sectionError('checklist') ? sectionError('checklist') : checklist?.length ? checklist.map((rule,i)=><label className="rule-check" key={`${rule}-${i}`}><input type="checkbox" checked={!!done[`rule-${base.owner}-${i}`]} onChange={()=>changeDone(`rule-${base.owner}-${i}`)}/><span>{rule}</span></label>):<p className="helper">No checklist rules were returned.</p>}</Card><Card className="side-tip"><div className="tip-icon"><ShieldCheck size={18}/></div><div><b>Understand before you submit</b><p>Use this plan as a reading guide. The implementation and explanation should be yours.</p></div></Card></aside>
        </div>}
        {tab===1 && <section className="tab-content"><div className="section-heading"><div><span className="eyebrow">WHAT THIS PROJECT SOLVED</span><h2>Solved problems</h2></div><span className="count-label">{solved?.length ?? '…'} linked fixes</span></div>{loading.solved?<Skeleton rows={5}/>:sectionError('solved') ? sectionError('solved') : solved?.length ? <div className="solved-grid">{solved.map((item)=><Card key={`${item.issueNumber}-${item.prNumber}`}><div className="solved-top"><span className="issue-number">Issue #{item.issueNumber}</span><a href={item.prUrl} target="_blank" rel="noreferrer">PR #{item.prNumber} <ArrowUpRight size={14}/></a></div><h3>{item.issueTitle}</h3><p>{item.explanation}</p><span className="solved-author">Fixed by <b>{item.author}</b></span></Card>)}</div>:<div className="empty-state"><CheckCircle2/><h3>No linked fixes found</h3><p>No issues here were closed with “fixes #N” in a pull request, so Kodiset cannot link fixes in this project.</p></div>}</section>}
        {tab===2 && <section className="tab-content"><div className="section-heading"><div><span className="eyebrow">THE PEOPLE BEHIND THE CODE</span><h2>People and branches</h2></div></div>{loading.facts?<Skeleton rows={5}/>:sectionError('facts') || <><h3 className="subsection-heading">Contributors</h3>{facts?.contributors.length?<div className="contributors-grid">{facts.contributors.map((person)=><ContributorCard key={person.login} person={person}/>)}</div>:<div className="empty-inline">No public contributor data was returned.</div>}<div className="commit-layout"><div><h3 className="subsection-heading">Recent commits</h3>{facts?.commits.length?<div className="commit-list">{facts.commits.map((c)=><CommitRow key={c.sha} commit={c}/>)}</div>:<div className="empty-inline">No recent commits returned.</div>}</div><div><h3 className="subsection-heading">Branches</h3><div className="branch-chips">{facts?.branches.length?facts.branches.map((b)=><span key={b}><GitBranch size={13}/>{b}</span>):<div className="empty-inline">No branches returned.</div>}</div><a className="text-link" href={`https://github.com/${base.owner}/${base.repo}/network`} target="_blank" rel="noreferrer">View commit graph <ArrowUpRight size={14}/></a></div></div></>}</section>}
        {tab===3 && <section className="tab-content"><div className="section-heading"><div><span className="eyebrow">WHERE HELP MAY BE NEEDED</span><h2>Areas that need help</h2></div><label className="filter-toggle"><input type="checkbox" checked={freeOnly} onChange={(e)=>setFreeOnly(e.target.checked)}/> Show only free issues</label></div>{loading.areas?<Skeleton rows={3}/>:sectionError('areas') ? sectionError('areas') : areas?.length ? <div className="area-grid">{areas.slice(0,3).map((area)=><Card key={area.title}><span className="eyebrow">AREA</span><h3>{area.title}</h3><p>{area.why}</p><div className="area-issues">{area.issueNumbers.map((n)=>allIssues.find((i)=>i.number===n)).filter((i):i is Issue=>!!i).filter((i)=>!freeOnly||i.status.kind==='free').map((issue)=><a href={issue.url} key={issue.number} target="_blank" rel="noreferrer"><span>#{issue.number} {issue.title}</span><Status issue={issue}/></a>)}{!area.issueNumbers.length&&<p className="helper">No related open issues were returned.</p>}</div></Card>)}</div>:<div className="empty-state"><GitBranch/><h3>No help areas returned</h3><p>There is not enough repository context to describe a specific area needing help.</p></div>}</section>}
        {tab===4 && <section className="tab-content"><div className="health-hero"><div className="health-symbol"><GitBranch size={26}/></div><div><span className="eyebrow">REPOSITORY CHECK</span><h2>{loading.facts?'Checking…':facts?.health.verdict || 'Unknown'}</h2><p>{healthSentence(facts?.health.verdict)}</p></div></div>{loading.facts?<Skeleton rows={6}/>:sectionError('facts') || <div className="health-facts">{facts?.health.facts.map((fact,i)=><div key={fact}><span className="fact-icon">{i===3&&facts.checklistFile?<CheckCircle2 size={16}/>:<GitBranch size={16}/>}</span><span>{fact}</span><span className="fact-source">GitHub REST</span></div>)}</div>}<p className="honest-note">A health verdict is based on repository activity, not a guarantee of future maintenance.</p></section>}
      </div></div>
    </div>
  </main>;
}
function healthSentence(verdict?:string) { if (verdict==='Active') return 'Recent repository activity suggests contributors are working here.'; if(verdict==='Slow') return 'Recent activity is quieter; check the current discussions before committing time.'; if(verdict==='Looks inactive')return 'This repository has had little recent activity. Consider whether that suits your goals.'; if(verdict==='Archived')return 'This repository is archived and is unlikely to accept new work.'; return 'Activity could not be confirmed yet.'; }
function ContributorCard({ person }: { person: Contributor }) { return <div className="contributor-card"><img src={person.avatarUrl} alt="" loading="lazy"/><div className="contributor-info"><b>{person.login}</b><div className="commit-bar"><i style={{width:`${Math.max(8,Math.min(100,person.commits/4))}%`}}/></div><span>{person.commits} contributions</span></div></div>; }
function CommitRow({ commit }: { commit: Commit }) { return <div className="commit-row"><code>{commit.sha.slice(0,7)}</code><div><b>{commit.message}</b><span>{commit.author} · {commit.date ? new Date(commit.date).toLocaleDateString() : 'Date unavailable'}</span></div></div>; }

function HomePage() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const [settings, setSettings] = useState(false); const [profile, setProfile] = useState<Profile|null>(() => { try { const saved=localStorage.getItem('kodiset-profile'); return saved?JSON.parse(saved):null; } catch { return null; } });
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(false); const [summary, setSummary] = useState(false); const [repoUrl, setRepoUrl] = useState(''); const [analysis, setAnalysis] = useState<{owner:string;repo:string;profile:Profile}|null>(null); const [sections, setSections] = useState<AnalysisSections|null>(null); const [pageError, setPageError] = useState('');
  const [credentials,setCredentials] = useState<Credentials>(()=>({geminiKey:sessionStorage.getItem('kodiset-gemini-key')||'',githubToken:sessionStorage.getItem('kodiset-github-token')||''}));
  useEffect(()=>{document.documentElement.classList.toggle('dark',dark); localStorage.setItem('kodiset-theme',dark?'dark':'light');},[dark]);
  useEffect(()=>{if(localStorage.getItem('kodiset-theme')==='dark')setDark(true);},[]);
  useEffect(()=>{if(sessionStorage.getItem('kodiset-retake-level')==='true'){sessionStorage.removeItem('kodiset-retake-level');setChecking(true);}},[]);
  useEffect(()=>{if(sessionStorage.getItem('kodiset-open-settings')==='true'){sessionStorage.removeItem('kodiset-open-settings');setSettings(true);}},[]);
  useEffect(() => {
    getCurrentUser().then((user) => { setAuthUser(user); if (user?.profile) { setProfile(user.profile); localStorage.setItem('kodiset-profile', JSON.stringify(user.profile)); } }).catch(() => undefined);
    const onAuthChanged = (event: Event) => {
      const user = (event as CustomEvent<AuthUser>).detail;
      setAuthUser(user);
      if (user.profile) { setProfile(user.profile); localStorage.setItem('kodiset-profile', JSON.stringify(user.profile)); }
    };
    window.addEventListener('kodiset-auth-changed', onAuthChanged);
    return () => window.removeEventListener('kodiset-auth-changed', onAuthChanged);
  }, []);
  function start(url:string) { setRepoUrl(url); if(!profile){setChecking(true);return;} doAnalyze(url,profile); }
  function doAnalyze(url:string,p:Profile) {
    const repo=parseRepo(url); if(!repo)return;
    const creds={geminiKey:sessionStorage.getItem('kodiset-gemini-key')||credentials.geminiKey,githubToken:sessionStorage.getItem('kodiset-github-token')||credentials.githubToken};
    setCredentials(creds); setAnalysis({...repo,profile:p}); setSections(beginAnalysis({...repo,profile:p},creds)); setPageError('');
  }
  function completeProfile(p:Profile) { setProfile(p); localStorage.setItem('kodiset-profile',JSON.stringify(p)); if (authUser) void saveUserProfile(p).catch(() => setPageError('Your profile works locally, but could not be saved to your account.')); setChecking(false); setSummary(true); }
  function continueFromSummary() { setSummary(false); if(repoUrl)doAnalyze(repoUrl,profile||safeProfile()); }
  function retake() { setSettings(false); setSummary(false); setAnalysis(null); setSections(null); setChecking(true); }
  return <><div className="app-frame">{analysis&&sections?<><Header onSettings={()=>setSettings(true)} dark={dark} toggleDark={()=>setDark(!dark)}/><Results base={analysis} credentials={credentials} sections={sections} onNew={()=>{setAnalysis(null);setSections(null);setPageError('');window.scrollTo({top:0,behavior:'smooth'});}} onSettings={()=>setSettings(true)}/><Footer/></>:checking?<LevelCheck onComplete={completeProfile} onOpenSettings={()=>setSettings(true)}/>:<Landing onSettings={()=>setSettings(true)} dark={dark} toggleDark={()=>setDark(!dark)} onStart={start} profile={profile}/>}</div>
    {pageError && <div className="toast-error" role="alert">{pageError}<button onClick={()=>setPageError('')} aria-label="Dismiss"><X size={14}/></button></div>}
    <SettingsDrawer open={settings} onClose={()=>setSettings(false)} profile={profile} onRetake={retake} credentials={credentials} setCredentials={setCredentials}/>
    {summary&&profile&&<LevelSummary profile={profile} onContinue={continueFromSummary} onRetake={()=>{setSummary(false);setChecking(true);}}/>}
  </>;
}
function App() {
  return <Switch><Route path="/"><HomePage/></Route><Route path="/docs/api-key"><DocsRoute/></Route><Route><NotFound/></Route></Switch>;
}
function DocsRoute() {
  const [settings,setSettings]=useState(false); const [dark,setDark]=useState(document.documentElement.classList.contains('dark'));
  const [,setLocation]=useLocation();
  const [profile]=useState<Profile|null>(()=>{try{return JSON.parse(localStorage.getItem('kodiset-profile')||'null');}catch{return null;}});
  const [credentials,setCredentials]=useState<Credentials>(()=>({geminiKey:sessionStorage.getItem('kodiset-gemini-key')||'',githubToken:sessionStorage.getItem('kodiset-github-token')||''}));
  useEffect(()=>{document.documentElement.classList.toggle('dark',dark);localStorage.setItem('kodiset-theme',dark?'dark':'light');},[dark]);
  useEffect(()=>{if(localStorage.getItem('kodiset-theme')==='dark')setDark(true);},[]);
  return <><DocsPage onSettings={()=>setSettings(true)} dark={dark} toggleDark={()=>setDark(!dark)}/><SettingsDrawer open={settings} onClose={()=>setSettings(false)} profile={profile} onRetake={()=>{setSettings(false);sessionStorage.setItem('kodiset-retake-level','true');setLocation('/');}} credentials={credentials} setCredentials={setCredentials}/></>;
}
function NotFound() { return <main className="not-found"><span className="eyebrow">404 / NOT FOUND</span><h1 className="display">This path is not in the repo.</h1><p>Head back to the analyzer to find a contribution path.</p><Link href="/" className="button button-primary">Go to Kodiset <ArrowRight size={15}/></Link></main>; }
export default App;
