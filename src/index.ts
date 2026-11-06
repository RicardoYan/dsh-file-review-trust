/**
 * File-review plugin, node half. Registers the response-format guidance that
 * lets the browser half recognize final-response file references. The browser
 * half ships via exports["./client"], discovered through the package.json
 * dsh.client declaration.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { FileReviewService } from './file-review-service.ts'
import { registerFileLifecycleCapture } from './file-lifecycle-capture.ts'
import { registerPtcAdapter } from './ptc-adapter.ts'
import { DEFAULT_WORD_WRAP, DEFAULT_DIFF_LAYOUT, type DiffLayout } from './settings-contract.ts'

export type * from './change-types.ts'
export { FileReviewService, transformFile } from './file-review-service.ts'
export { DEFAULT_WORD_WRAP, FILE_REVIEW_SETTINGS_NAMESPACE } from './settings-contract.ts'

export interface Config {
  wordWrap: Volatile<boolean>
  diffLayout: Volatile<DiffLayout>
}

/** 可由当前 Profile 即时更新的显示设置。 */
export const Config = z.object({
  wordWrap: z.boolean().default(DEFAULT_WORD_WRAP).volatile(),
  diffLayout: z
    .union([z.const('split'), z.const('unified')])
    .default(DEFAULT_DIFF_LAYOUT)
    .volatile(),
})

/**
 * Services required by the Host half: file-review settings and the tool
 * registry the lifecycle capture hooks into.
 *
 * `systemPrompt` is no longer required: DSH 0.2.2 moved the final-response
 * file-reference guidance into `@deepseek-ai/dsh-deliverable-file-references`,
 * which the web-app patch mounts on its own. This package used to register an
 * equivalent section (`ui:file-review-references`); keeping both meant the model
 * received two instructions that disagreed about link format — this one asked
 * for inline code plus a basename, the official one asks for an angle-bracketed
 * full path. The official section wins.
 */
export const inject = ['tools']

/**
 * Mount the review engine.
 * @param ctx - host context carrying the settings and tool registries.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  new FileReviewService(ctx)
  registerFileLifecycleCapture(ctx)
  registerPtcAdapter(ctx)
}
