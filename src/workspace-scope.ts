/**
 * Which paths this plugin may capture and toggle (fork addition).
 *
 * Without dsh-workspace-trust the scope is the session directory, exactly as in
 * upstream dsh-file-review. With it, the scope follows the trust plugin's rules
 * (the same rules dsh-symlink-passthrough and dsh-project-config use):
 *   - inside the workspace root (`findRoot(cwd)`)             -> allowed
 *   - outside it                                              -> only when the workspace is trusted
 *   - on the denied list, wherever it is                      -> never
 * The decision is made by the trust plugin's `checkResolved(root, realPath)`;
 * this module only resolves paths and asks. Relative paths still resolve
 * against the session directory.
 *
 * Interface relied on: the optional `workspaceTrust` service (v1) published by
 * dsh-workspace-trust — `findRoot(cwd)` and `checkResolved(root, realPath)`
 * returning `{ ok: true } | { ok: false, code, message }`.
 */

import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

/** The subset of the dsh-workspace-trust service this plugin uses. */
export interface WorkspaceTrustLike {
  findRoot(cwd: string): Promise<string>
  checkResolved(
    root: string,
    realPath: string,
  ): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>
}

/** Answers "may this real path be captured / toggled" for one session directory. */
export interface WorkspaceScope {
  /** The session directory's real path; relative paths resolve against it. */
  readonly cwd: string
  /** `undefined` when allowed, otherwise the reason. */
  check(realPath: string): Promise<string | undefined>
}

/** Thrown reason for paths outside the session directory without the trust plugin. */
export const OUTSIDE_REASON = 'path is outside the session workspace'

export function inside(root: string, candidate: string): boolean {
  const child = relative(root, candidate)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function isTrustService(value: unknown): value is WorkspaceTrustLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WorkspaceTrustLike).findRoot === 'function' &&
    typeof (value as WorkspaceTrustLike).checkResolved === 'function'
  )
}

/**
 * Build the scope for one session directory.
 * @param cwd - session working directory.
 * @param trust - the `workspaceTrust` service when installed; read at call time.
 */
export async function workspaceScope(cwd: string, trust: unknown): Promise<WorkspaceScope> {
  const real = await realpath(cwd)
  if (!isTrustService(trust)) {
    return { cwd: real, check: async (path) => (inside(real, path) ? undefined : OUTSIDE_REASON) }
  }
  const root = await trust.findRoot(real)
  return {
    cwd: real,
    async check(path) {
      const verdict = await trust.checkResolved(root, path)
      return verdict.ok ? undefined : String(verdict.message)
    },
  }
}

/**
 * Real path of a not-yet-existing file: the nearest existing ancestor's real
 * path plus the remaining segments (a tool may create several directories).
 */
export async function realMissingPath(candidate: string): Promise<string> {
  let current = resolve(candidate)
  const rest: string[] = []
  for (;;) {
    const parent = dirname(current)
    try {
      return resolve(await realpath(current), ...rest)
    } catch (error) {
      if (parent === current) throw error
    }
    rest.unshift(relative(parent, current))
    current = parent
  }
}
