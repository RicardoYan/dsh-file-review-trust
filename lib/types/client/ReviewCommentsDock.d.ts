/** Interactive aggregate review-comment chip and preview above the composer. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { NS } from './locales.ts';
export type ReviewCommentsDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<typeof NS> & {
    readonly projectRoot?: string | undefined;
    /** Reconcile the composer reference against this mount's composer shell. */
    readonly syncComments?: (() => void) | undefined;
};
/** Render one session's aggregate chip; the hidden model reference remains in the draft. */
export declare function ReviewCommentsDock({ sessionId, projectRoot, syncComments, t, }: ReviewCommentsDockProps): import("react").JSX.Element | null;
//# sourceMappingURL=ReviewCommentsDock.d.ts.map