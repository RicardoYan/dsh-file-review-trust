// Fork: capture and undo/redo scope driven by the optional workspaceTrust service.
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import type { FileReviewRequest } from '../src/change-types.ts'
import { FileReviewService } from '../src/file-review-service.ts'
import { apply, inject } from '../src/index.ts'
import { markerFromContent } from '../src/ptc-marker.ts'
import { OUTSIDE_REASON, realMissingPath, workspaceScope } from '../src/workspace-scope.ts'

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

const isUnder = (root: string, p: string) => {
  const r = relative(root, p)
  return r === '' || (!r.startsWith('..') && !/^[a-z]:/i.test(r) && !r.startsWith('/'))
}

/** Same contract as dsh-workspace-trust v1; messages follow the active language. */
function fakeTrust(opts: { root: string; denied?: string[]; lang?: () => 'zh' | 'en' }) {
  const state = { trusted: false }
  const lang = opts.lang ?? (() => 'en')
  return {
    state,
    service: {
      findRoot: async () => opts.root,
      checkResolved: async (root: string, p: string) => {
        if ((opts.denied ?? []).some((d) => isUnder(d, p))) {
          return {
            ok: false as const,
            code: 'DENIED',
            message: lang() === 'zh' ? `在禁止访问列表中：${p}` : `On the denied list: ${p}`,
          }
        }
        if (!isUnder(root, p) && !state.trusted) {
          return {
            ok: false as const,
            code: 'UNTRUSTED',
            message: lang() === 'zh' ? `工作区未信任：${p}` : `Workspace is not trusted: ${p}`,
          }
        }
        return { ok: true as const, inside: isUnder(root, p), realPath: p }
      },
    },
  }
}

function fakeAgent(cwd: string): Agent {
  return {
    session: { header: { cwd } },
    runMaintenance: async (task: (s: AbortSignal) => unknown) => task(new AbortController().signal),
  } as unknown as Agent
}

const svc = (trust: unknown) =>
  ({
    ctx: { get: (name: string) => (name === 'workspaceTrust' ? trust : undefined) },
  }) as unknown as FileReviewService

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
  const secret = join(base, 'secret')
  for (const d of [cwd, join(repo, 'other'), outside, secret]) await mkdir(d, { recursive: true })
  return { base, repo, cwd, outside, secret }
}

describe('workspace scope', () => {
  it('without the trust plugin keeps upstream behavior (session directory only)', async () => {
    const { cwd, repo } = await layout()
    const scope = await workspaceScope(cwd, undefined)
    expect(await scope.check(join(cwd, 'a.txt'))).toBeUndefined()
    expect(await scope.check(join(repo, 'other', 'a.txt'))).toBe(OUTSIDE_REASON)
  })

  it('ignores values that are not the trust service', async () => {
    const { cwd, repo } = await layout()
    const scope = await workspaceScope(cwd, { findRoot: 1 })
    expect(await scope.check(join(repo, 'other', 'a.txt'))).toBe(OUTSIDE_REASON)
  })

  it('uses the workspace root, trust and the denied list', async () => {
    const { cwd, repo, outside, secret } = await layout()
    const trust = fakeTrust({ root: repo, denied: [secret] })
    const scope = await workspaceScope(cwd, trust.service)
    expect(await scope.check(join(repo, 'other', 'a.txt'))).toBeUndefined()
    expect(await scope.check(join(outside, 'a.txt'))).toMatch(/^Workspace is not trusted/)
    trust.state.trusted = true
    expect(await scope.check(join(outside, 'a.txt'))).toBeUndefined()
    expect(await scope.check(join(secret, 'a.txt'))).toMatch(/^On the denied list/)
  })

  it('passes the trust plugin reason through in the active language only', async () => {
    const { cwd, repo, outside } = await layout()
    let lang: 'zh' | 'en' = 'zh'
    const trust = fakeTrust({ root: repo, lang: () => lang })
    const scope = await workspaceScope(cwd, trust.service)
    const zh = await scope.check(join(outside, 'a.txt'))
    expect(zh).toMatch(/^工作区未信任：/)
    lang = 'en'
    const en = await scope.check(join(outside, 'a.txt'))
    expect(en).toMatch(/^Workspace is not trusted: /)
    expect(/[\u4e00-\u9fff]/.test(en ?? '')).toBe(false)
  })

  it('resolves missing paths through the nearest existing ancestor', async () => {
    const { outside } = await layout()
    expect(await realMissingPath(join(outside, 'x', 'y', 'z.txt'))).toBe(
      join(outside, 'x', 'y', 'z.txt'),
    )
  })
})

describe('undo / redo with the trust plugin', () => {
  it('toggles a file outside the workspace only while trusted', async () => {
    const { cwd, repo, outside } = await layout()
    const file = join(outside, 'a.txt')
    await writeFile(file, 'new\n')
    const trust = fakeTrust({ root: repo })
    const agent = fakeAgent(cwd)

    const refused = await FileReviewService.prototype.apply.call(
      svc(trust.service),
      agent,
      editRequest(file),
    )
    expect(refused.files[0]).toEqual(expect.objectContaining({ state: 'error', changed: false }))
    expect(refused.files[0]?.reason).toMatch(/^Workspace is not trusted/)
    expect(await readFile(file, 'utf8')).toBe('new\n')

    trust.state.trusted = true
    const status = await FileReviewService.prototype.status.call(
      svc(trust.service),
      agent,
      editRequest(file),
    )
    expect(status.files[0]?.state).toBe('applied')
    const undone = await FileReviewService.prototype.apply.call(
      svc(trust.service),
      agent,
      editRequest(file),
    )
    expect(undone.files[0]).toEqual(expect.objectContaining({ state: 'undone', changed: true }))
    expect(await readFile(file, 'utf8')).toBe('old\n')

    // trust revoked before redo: refused, file untouched
    trust.state.trusted = false
    const redo = await FileReviewService.prototype.apply.call(
      svc(trust.service),
      agent,
      editRequest(file, 'redo'),
    )
    expect(redo.files[0]?.state).toBe('error')
    expect(await readFile(file, 'utf8')).toBe('old\n')
  })

  it('allows a sibling directory of the same repository without trust', async () => {
    const { cwd, repo } = await layout()
    const file = join(repo, 'other', 'a.txt')
    await writeFile(file, 'new\n')
    const trust = fakeTrust({ root: repo })
    const result = await FileReviewService.prototype.apply.call(
      svc(trust.service),
      fakeAgent(cwd),
      editRequest('../other/a.txt'),
    )
    expect(result.files[0]).toEqual(expect.objectContaining({ state: 'undone', changed: true }))
    expect(await readFile(file, 'utf8')).toBe('old\n')
  })

  it('never toggles a denied path, even when trusted', async () => {
    const { cwd, repo, secret } = await layout()
    const file = join(secret, 'a.txt')
    await writeFile(file, 'new\n')
    const trust = fakeTrust({ root: repo, denied: [secret] })
    trust.state.trusted = true
    const result = await FileReviewService.prototype.apply.call(
      svc(trust.service),
      fakeAgent(cwd),
      editRequest(file),
    )
    expect(result.files[0]?.reason).toMatch(/^On the denied list/)
    expect(await readFile(file, 'utf8')).toBe('new\n')
  })

  it('redoes a created file outside the workspace (missing target) when trusted', async () => {
    const { cwd, repo, outside } = await layout()
    const file = join(outside, 'created.txt')
    const trust = fakeTrust({ root: repo })
    trust.state.trusted = true
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
    const result = await FileReviewService.prototype.apply.call(
      svc(trust.service),
      fakeAgent(cwd),
      request,
    )
    expect(result.files[0]?.state).toBe('applied')
    expect(await readFile(file, 'utf8')).toBe('hi\n')
  })
})

describe('capture with the trust plugin', () => {
  async function mount(trust: unknown, cwd: string) {
    ctx = new Context()
    // Provided from a plugin fiber, as dsh-workspace-trust does (root-fiber services read as inactive).
    if (trust !== undefined)
      await ctx
        .plugin({
          name: 'fake-trust',
          apply: (c: Context) => {
            c.provide('workspaceTrust', trust)
          },
        })
        .await()
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

  it('records a trusted outside file with a real diff, and skips it when untrusted', async () => {
    const { cwd, repo, outside } = await layout()
    const file = join(outside, 'a.txt')
    const trust = fakeTrust({ root: repo })
    await mount(trust.service, cwd)

    await writeFile(file, 'old\n')
    expect(await run(cwd, file, 'c1')).toBeNull()

    trust.state.trusted = true
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

  it('never records a denied file', async () => {
    const { cwd, repo, secret } = await layout()
    const file = join(secret, 'a.txt')
    const trust = fakeTrust({ root: repo, denied: [secret] })
    trust.state.trusted = true
    await mount(trust.service, cwd)
    await writeFile(file, 'old\n')
    expect(await run(cwd, file, 'c3')).toBeNull()
  })

  it('without the trust plugin skips files outside the session directory', async () => {
    const { cwd, repo } = await layout()
    const file = join(repo, 'other', 'a.txt')
    await mount(undefined, cwd)
    await writeFile(file, 'old\n')
    expect(await run(cwd, file, 'c4')).toBeNull()
    await writeFile(join(cwd, 'in.txt'), 'old\n')
    expect((await run(cwd, 'in.txt', 'c5'))?.files.map((f) => f.path)).toEqual(['in.txt'])
  })
})
