/**
 * File-review plugin, node half. Registers the response-format guidance that
 * lets the browser half recognize final-response file references. The browser
 * half ships via exports["./client"], discovered through the package.json
 * dsh.client declaration.
 */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type DiffLayout } from './settings-contract.ts';
export type * from './change-types.ts';
export { FileReviewService, transformFile } from './file-review-service.ts';
export { DEFAULT_WORD_WRAP, FILE_REVIEW_SETTINGS_NAMESPACE } from './settings-contract.ts';
export interface Config {
    wordWrap: Volatile<boolean>;
    diffLayout: Volatile<DiffLayout>;
}
/** 可由当前 Profile 即时更新的显示设置。 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    wordWrap: z<boolean, boolean, "volatile-defined">;
    diffLayout: z<"split" | "unified", "split" | "unified", "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    wordWrap: z<boolean, boolean, "volatile-defined">;
    diffLayout: z<"split" | "unified", "split" | "unified", "volatile-defined">;
}>>, "plain">;
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
export declare const inject: string[];
/**
 * Mount the review engine.
 * @param ctx - host context carrying the settings and tool registries.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map