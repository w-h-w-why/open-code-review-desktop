import type { BranchInfo, CommitInfo, GitStatus } from '@shared/types'
import { execFile } from './cli'

async function git(repo: string, args: string[], timeoutMs = 20_000) {
  return execFile('git', args, { cwd: repo, timeoutMs })
}

export async function resolveRepoRoot(dir: string): Promise<string | null> {
  const result = await git(dir, ['rev-parse', '--show-toplevel'])
  if (result.code !== 0) return null
  return result.stdout.trim() || null
}

function sumNumstat(text: string): { insertions: number; deletions: number } {
  let insertions = 0
  let deletions = 0
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [ins, del] = line.split('\t')
    const i = Number.parseInt(ins, 10)
    const d = Number.parseInt(del, 10)
    if (Number.isFinite(i)) insertions += i
    if (Number.isFinite(d)) deletions += d
  }
  return { insertions, deletions }
}

export async function getGitStatus(repo: string): Promise<GitStatus> {
  const empty: GitStatus = {
    isRepo: false,
    root: repo,
    branch: '',
    ahead: 0,
    behind: 0,
    changes: 0,
    insertions: 0,
    deletions: 0,
    dirtyFiles: []
  }

  const inside = await git(repo, ['rev-parse', '--is-inside-work-tree'])
  if (inside.code !== 0) {
    return { ...empty, error: inside.stderr.trim() || '不是 Git 仓库' }
  }

  const rootResult = await git(repo, ['rev-parse', '--show-toplevel'])
  const root = rootResult.stdout.trim() || repo

  const branchResult = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = branchResult.stdout.trim() || 'HEAD'

  const statusResult = await git(root, ['status', '--porcelain=v1'])
  const statusLines = statusResult.stdout.split(/\r?\n/).filter((l) => l.trim())
  const dirtyFiles = statusLines.slice(0, 200).map((line) => {
    const status = line.slice(0, 2).trim()
    let path = line.slice(3).trim()
    const rename = path.split(' -> ')
    if (rename.length === 2) path = rename[1]
    return { path, status }
  })

  const [unstaged, staged] = await Promise.all([
    git(root, ['diff', '--numstat']),
    git(root, ['diff', '--cached', '--numstat'])
  ])
  const a = sumNumstat(unstaged.stdout)
  const b = sumNumstat(staged.stdout)

  let ahead = 0
  let behind = 0
  let upstream: string | undefined
  const upstreamResult = await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
  if (upstreamResult.code === 0) {
    upstream = upstreamResult.stdout.trim() || undefined
    const counts = await git(root, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
    if (counts.code === 0) {
      const [bText, aText] = counts.stdout.trim().split(/\s+/)
      behind = Number.parseInt(bText, 10) || 0
      ahead = Number.parseInt(aText, 10) || 0
    }
  }

  let lastCommit: GitStatus['lastCommit']
  const log = await git(root, ['log', '-1', '--format=%h%x09%s%x09%an%x09%ar'])
  if (log.code === 0 && log.stdout.trim()) {
    const [hash, subject, author, relative] = log.stdout.trim().split('\t')
    lastCommit = { hash, subject, author, relative }
  }

  return {
    isRepo: true,
    root,
    branch,
    upstream,
    ahead,
    behind,
    changes: statusLines.length,
    insertions: a.insertions + b.insertions,
    deletions: a.deletions + b.deletions,
    lastCommit,
    dirtyFiles
  }
}

export async function listBranches(repo: string): Promise<BranchInfo[]> {
  const result = await git(repo, [
    'for-each-ref',
    '--format=%(refname:short)%09%(refname)',
    'refs/heads',
    'refs/remotes'
  ])
  if (result.code !== 0) return []

  const branch = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
  const branches: BranchInfo[] = []
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [name, ref] = line.split('\t')
    if (!name || name.endsWith('/HEAD')) continue
    const remote = ref.startsWith('refs/remotes/')
    branches.push({ name, remote, current: name === branch })
  }

  branches.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1
    if (a.remote !== b.remote) return a.remote ? 1 : -1
    return a.name.localeCompare(b.name)
  })
  return branches
}

export async function listCommits(repo: string, limit = 25): Promise<CommitInfo[]> {
  const result = await git(repo, ['log', `-${limit}`, '--format=%h%x09%s%x09%an%x09%ar'])
  if (result.code !== 0) return []
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, author, relative] = line.split('\t')
      return { hash, subject, author, relative }
    })
}
