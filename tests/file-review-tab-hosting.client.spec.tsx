// @vitest-environment jsdom
/**
 * 侧栏里的子智能体对话：审阅页签由父会话的栏承载，稿件却属于子会话。
 * 这些用例驱动真实 FileReviewTab，验证内容按 target.sessionId 取，而不是按宿主会话取。
 *
 * 所有桩快照都必须是稳定引用：`useSyncExternalStore` 每次渲染比较引用，
 * 返回新对象会被判为“变了”并无限重渲染。
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewTarget } from '../src/client/FileReviewTab.tsx'
import { FileReviewTab } from '../src/client/FileReviewTab.tsx'
import { en } from '../src/client/locales.ts'

vi.mock('../src/client/ReviewContent.tsx', async () => {
  const actual = await vi.importActual<typeof import('../src/client/ReviewContent.tsx')>(
    '../src/client/ReviewContent.tsx',
  )
  return {
    ...actual,
    // 换掉重型 diff 面板，只报告它拿到了什么。
    ReviewContent: ({
      reviews,
      sessionId,
    }: {
      reviews: readonly { path: string }[]
      sessionId?: string
    }) => (
      <div data-review-content="" data-session={sessionId ?? ''} data-paths={
        reviews.map((review) => review.path).join(',')
      } />
    ),
  }
})

afterEach(cleanup)

/** `sessions.list` 的快照：模块级常量，引用稳定。 */
const SESSIONS_SNAPSHOT = { byId: { 'session-parent': { cwd: '/workspace' } } }

/** One turn's deliverables as the Host publishes them onto the Turn data map. */
function deliverablesTurn(seq: number, paths: readonly string[]) {
  return {
    data: {
      get: (key: string) =>
        key === 'deliverables'
          ? { produced: paths.map((path) => ({ seq, path, diffs: [] })) }
          : undefined,
    },
  }
}

/** A chat snapshot whose timeline resolves `turn` (1-based) to the given entry. */
function chatSnapshot(turn: ReturnType<typeof deliverablesTurn> | undefined) {
  return {
    timeline: { turns: { get: (index: number) => (index === 1 ? turn : undefined) } },
  }
}

/**
 * @param hosts - 承载页签的会话（栏所属的那个）。
 * @param params - 页签的导航参数。
 * @param sessions - 有 binding 的会话：会话 id → 该会话的 chat 快照。
 */
function renderTab(
  hosts: string,
  params: unknown,
  sessions: Record<string, ReturnType<typeof chatSnapshot>>,
) {
  const sess = {
    list: { getSnapshot: () => SESSIONS_SNAPSHOT, subscribe: () => () => {} },
    binding: (sessionId: string) => {
      const snapshot = sessions[sessionId]
      return snapshot === undefined ? undefined : { sessionId, snapshot }
    },
  }
  const uiConversation = {
    binding: (binding: { sessionId: string; snapshot: ReturnType<typeof chatSnapshot> }) => ({
      target: () => ({ getSnapshot: () => binding.snapshot, subscribe: () => () => {} }),
    }),
  }
  return render(
    <FileReviewTab
      sessions={sess as never}
      uiConversation={uiConversation as never}
      sessionId={hosts as never}
      projectRoot="/workspace"
      params={params}
      visible
      wordWrap={{ getSnapshot: () => false, subscribe: () => () => {} }}
      openFile={() => {}}
      t={(key: keyof typeof en) => en[key]}
    />,
  )
}

function contentOf(view: ReturnType<typeof render>) {
  const content = view.container.querySelector('[data-review-content]')
  return {
    paths: content?.getAttribute('data-paths'),
    session: content?.getAttribute('data-session'),
  }
}

/** 父会话与子会话各有一份不同的稿件，用来区分“读的是谁的”。 */
const BOTH = {
  'session-parent': chatSnapshot(deliverablesTurn(10, ['parent.md'])),
  'session-child': chatSnapshot(deliverablesTurn(10, ['child.md'])),
}

describe('review tab hosted by a different Session', () => {
  // 父会话的栏承载页签，稿件属于子会话：内容与撤销会话都必须是子会话。
  it('reads the reviewed Session, not the hosting one', () => {
    const target: ReviewTarget = {
      turn: 1,
      closingSeq: 10,
      focusPaths: [],
      sessionId: 'session-child',
    }
    expect(contentOf(renderTab('session-parent', target, BOTH))).toEqual({
      paths: 'child.md',
      session: 'session-child',
    })
  })

  // 没有 sessionId 的历史导航参数（升级前打开过的页签）必须退回宿主会话。
  it('falls back to the hosting Session when the target names none', () => {
    const target: ReviewTarget = { turn: 1, closingSeq: 10, focusPaths: [] }
    expect(contentOf(renderTab('session-parent', target, BOTH))).toEqual({
      paths: 'parent.md',
      session: 'session-parent',
    })
  })

  // 宿主和稿件是同一个会话时（主对话的常规路径），行为与改动前一致。
  it('renders the same turn when host and review Session agree', () => {
    const sessions = {
      'session-a': chatSnapshot(deliverablesTurn(10, ['a.md', 'b.md'])),
    }
    const target: ReviewTarget = {
      turn: 1,
      closingSeq: 10,
      focusPaths: ['b.md'],
      sessionId: 'session-a',
    }
    expect(contentOf(renderTab('session-a', target, sessions))).toEqual({
      paths: 'b.md',
      session: 'session-a',
    })
  })

  // 稿件会话拿不到 binding 时，必须给出“会话不可用”，不能静默渲染空页。
  it('reports an unavailable Session rather than an empty review', () => {
    const target: ReviewTarget = {
      turn: 1,
      closingSeq: 10,
      focusPaths: [],
      sessionId: 'session-gone',
    }
    const view = renderTab('session-parent', target, BOTH)
    expect(view.getByRole('status').textContent).toBe(en['review.sidebarSessionUnavailable'])
  })
})
