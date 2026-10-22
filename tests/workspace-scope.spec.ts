// Fork: capture and undo/redo scope, no longer limited to the session directory.
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import type { FileReviewRequest } from '../src/change-types.ts'
import { FileReviewService } from '../src/file-review-service.ts'
import { apply, inject } from '../src/index.ts'
import { markerFromContent } from '../src/ptc-marker.ts'
import { realMissingPath, workspaceScope } from '../src/workspace-scope.ts'

const roots: string[] = []
let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function tmp(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-file-review-trust-')))
  roots.push(root)
  return root
}

function fakeAgent(cwd: string): Agent {
  return {
    session: { header: { cwd } },
    runMaintenance: async (task: (s: AbortSignal) => unknown) => task(new AbortController().signal),
  } as unknown as Agent
}

const svc = {} as unknown as FileReviewService

function editRequest(path: string, action: 'undo' | 'redo' = 'undo'): FileReviewRequest {
  return {
    action,
    files: [
      { path, diffs: [{ path, oldText: 'old\n', newText: 'new\n', oldStart: 1, newStart: 1 }] },
    ],
  }
}

async function layout() {
  const base = await tmp()
  const repo = join(base, 'repo')
  const cwd = join(repo, 'pkg')
  const outside = join(base, 'outside')
  for (const d of [cwd, join(repo, 'other'), outside]) await mkdir(d, { recursive: true })
  return { base, repo, cwd, outside }
}

describe('workspace scope', () => {
  it('accepts every path, inside or outside the session directory', async () => {
    const { cwd, repo, outside } = await layout()
    const scope = await workspaceScope(cwd)
    expect(await scope.check(join(cwd, 'a.txt'))).toBeUndefined()
    expect(await scope.check(join(repo, 'other', 'a.txt'))).toBeUndefined()
    expect(await scope.check(join(outside, 'a.txt'))).toBeUndefined()
  })

  it('reports the session directory as a real path', async () => {
    const { cwd } = await layout()
    const scope = await workspaceScope(cwd)
    expect(scope.cwd).toBe(await realpath(cwd))
  })

  it('resolves missing paths through the nearest existing ancestor', async () => {
    const { outside } = await layout()
    expect(await realMissingPath(join(outside, 'x', 'y', 'z.txt'))).toBe(
      join(outside, 'x', 'y', 'z.txt'),
    )
  })
})

describe('undo / redo', () => {
  it('toggles a file outside the workspace', async () => {
    const { cwd, outside } = await layout()
    const file = join(outside, 'a.txt')
    await writeFile(file, 'new\n')
    const agent = fakeAgent(cwd)

    const status = await FileReviewService.prototype.status.call(svc, agent, editRequest(file))
    expect(status.files[0]?.state).toBe('applied')
    const undone = await FileReviewService.prototype.apply.call(svc, agent, editRequest(file))
    expect(undone.files[0]).toEqual(expect.objectContaining({ state: 'undone', changed: true }))
    expect(await readFile(file, 'utf8')).toBe('old\n')

    const redo = await FileReviewService.prototype.apply.call(svc, agent, editRequest(file, 'redo'))
    expect(redo.files[0]).toEqual(expect.objectContaining({ state: 'applied', changed: true }))
    expect(await readFile(file, 'utf8')).toBe('new\n')
  })

  it('allows a sibling directory of the same repository', async () => {
    const { cwd, repo } = await layout()
    const file = join(repo, 'other', 'a.txt')
    await writeFile(file, 'new\n')
    const result = await FileReviewService.prototype.apply.call(
      svc,
      fakeAgent(cwd),
      editRequest('../other/a.txt'),
    )
    expect(result.files[0]).toEqual(expect.objectContaining({ state: 'undone', changed: true }))
    expect(await readFile(file, 'utf8')).toBe('old\n')
  })

  it('redoes a created file outside the workspace (missing target)', async () => {
    const { cwd, outside } = await layout()
    const file = join(outside, 'created.txt')
    const request: FileReviewRequest = {
      action: 'redo',
      files: [
        {
          path: file,
          diffs: [
            {
              path: file,
              oldText: null,
              newText: 'hi\n',
              oldStart: 1,
              newStart: 1,
              lifecycle: { kind: 'create', mode: 0o644 },
            },
          ],
        },
      ],
    }
    const result = await FileReviewService.prototype.apply.call(svc, fakeAgent(cwd), request)
    expect(result.files[0]?.state).toBe('applied')
    expect(await readFile(file, 'utf8')).toBe('hi\n')
  })
})

describe('capture', () => {
  async function mount(cwd: string) {
    ctx = new Context()
    await ctx.plugin(SystemPrompt, { persona: '' })
    await ctx.plugin(Tools, {})
    await ctx.plugin({ apply, inject }).await()
    ctx.tools.register(
      defineTool({
        name: 'fixture_edit',
        description: 'edit a fixture file',
        parameters: {
          path: { type: 'string', required: true },
          content: { type: 'string', required: true },
        },
        output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
        presentCall: (args) => ({
          card: 'diff',
          title: `Edit ${args.path}`,
          locations: [{ path: args.path }],
          diffs: [{ path: args.path, oldText: 'old\n', newText: args.content }],
        }),
        async execute(args) {
          await writeFile(resolve(cwd, args.path), args.content)
          return args.path
        },
      }),
    )
  }

  async function run(cwd: string, path: string, callId: string) {
    const agent = {
      session: {
        header: { cwd },
        events: [
          {
            seq: 0,
            time: 0,
            type: 'tool/call',
            data: { turn: 1, step: 1, callId, name: 'fixture_edit', arguments: '{}' },
          },
        ],
      },
    } as unknown as Agent
    const result = await ctx!.tools.execute({
      callId,
      name: 'fixture_edit',
      arguments: { path, content: 'new\n' },
      agent,
      signal: new AbortController().signal,
    })
    return markerFromContent(result.content, { rootCallId: callId, subCallId: callId })
  }

  it('records a file outside the workspace with a real diff', async () => {
    const { cwd, outside } = await layout()
    const file = join(outside, 'a.txt')
    await mount(cwd)
    await writeFile(file, 'old\n')
    const marker = await run(cwd, file, 'c2')
    expect(marker?.files).toEqual([
      {
        path: file,
        source: 'result',
        diffs: [{ path: file, oldText: 'old\n', newText: 'new\n', oldStart: 1, newStart: 1 }],
      },
    ])
  })

  it('records a file reached through a directory link that leaves the session directory', async () => {
    const { cwd, repo } = await layout()
    // A junction named `tools` pointing outside the session directory, as in a
    // project where `tools/` links to a shared toolkit.
    const target = join(repo, 'shared-tools')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'a.txt'), 'old\n')
    await symlink(target, join(cwd, 'tools'), 'junction')
    await mount(cwd)
    const marker = await run(cwd, 'tools/a.txt', 'c6')
    expect(marker?.files.map((f) => f.path)).toEqual(['tools/a.txt'])
  })
})
