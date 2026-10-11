export type Level = 1 | 2 | 3 | 4 | 5;
export interface Profile {
  git: Level;
  collab: Level;
  languages: Record<string, Level>;
  knowledge?: string[];
  hours: '<2' | '2-5' | '5+';
  interests: string[];
}
export interface RepoRecommendation {
  fullName: string;
  url: string;
  description: string;
  language: string | null;
  stars: number;
  openIssues: number;
  pushedAt: string;
  score: number;
  reasons: string[];
}
export type WorkspaceStatus = 'planned' | 'claimed' | 'in progress' | 'PR opened' | 'merged';
export interface ContributionWorkspace {
  repoOwner: string;
  repoName: string;
  issueNumber: number | null;
  issueTitle: string | null;
  status: WorkspaceStatus;
  notes: string;
  draftComment: string;
  branchName: string;
  prUrl: string;
  checklist: Record<string, boolean>;
}
export type IssueStatus = { kind: 'free' } | { kind: 'assigned'; to: string } | { kind: 'pr'; number: number };
export interface Issue { number: number; title: string; url: string; labels: string[]; body: string; status: IssueStatus; language?: string; difficulty: Level }
export interface SolvedItem { issueNumber: number; issueTitle: string; prNumber: number; prUrl: string; author: string; explanation: string }
export interface Health { verdict: 'Active' | 'Slow' | 'Looks inactive' | 'Archived' | 'Unknown'; facts: string[] }
export interface Contributor { login: string; avatarUrl: string; commits: number }
export interface Commit { sha: string; message: string; author: string; date: string }
export interface HelpArea { title: string; why: string; issueNumbers: number[] }
export interface PlanFile { path: string; verified: boolean }
export interface Plan { markdown: string; files: PlanFile[] }
export interface AnalysisResult {
  owner: string; repo: string; profile: Profile; health: Health; issues: Issue[]; solved: SolvedItem[];
  contributors: Contributor[]; branches: string[]; commits: Commit[]; areas: HelpArea[]; checklist: string[]; plan: Plan;
}
export interface RepoBase { owner: string; repo: string; profile: Profile }
export interface RepoFacts { health: Health; issues: Issue[]; contributors: Contributor[]; branches: string[]; commits: Commit[]; checklistFile: boolean; language: string | null; stars: number; license: string; filePaths: string[]; mergedPulls: { number: number; title: string; url: string; author: string; body: string }[] }
export interface AnalysisSections { facts: Promise<RepoFacts>; plan: Promise<Plan>; solved: Promise<SolvedItem[]>; areas: Promise<HelpArea[]>; checklist: Promise<string[]> }
