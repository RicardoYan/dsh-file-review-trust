/**
 * Which paths this plugin may capture and toggle (fork addition).
 *
 * The scope is the whole machine: a session may write through a directory link
 * (a `tools/` junction is the usual case), so the real path of an edit is often
 * outside the session directory. Anything a file tool changed is captured and
 * can be toggled back; relative paths still resolve against the session
 * directory.
 */

import { realpath } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

/** Answers "may this real path be captured / toggled" for one session directory. */
export interface WorkspaceScope {
  /** The session directory's real path; relative paths resolve against it. */
  readonly cwd: string
  /** `undefined` when allowed, otherwise the reason. */
  check(realPath: string): Promise<string | undefined>
}

/**
 * Build the scope for one session directory.
 * @param cwd - session working directory.
 */
export async function workspaceScope(cwd: string): Promise<WorkspaceScope> {
  const real = await realpath(cwd)
  return { cwd: real, check: async () => undefined }
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
