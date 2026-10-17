/**
 * User-text projection that keeps the model-only review envelope behind a compact pill.
 * The host renders every user message through UserText rules, so this plugin contributes
 * one rule for its leading envelope instead of replacing the whole message renderer.
 */
import type { UserTextRule } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { NS } from './locales.ts';
/** UserText node ID, also the keyed renderer's key. */
export declare const REVIEW_COMMENTS_TEXT_ID = "file-review-comments";
export interface ProjectedReviewComment {
    readonly path: string;
    readonly kind: 'context' | 'del' | 'add';
    readonly oldLine: string;
    readonly newLine: string;
    readonly body: string;
}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
    interface UserTextDataMap {
        /** Leading review envelope emitted by this plugin, projected to its comments. */
        'file-review-comments': {
            readonly comments: readonly ProjectedReviewComment[];
        };
    }
}
interface ReviewEnvelope {
    readonly comments: readonly ProjectedReviewComment[];
    /** End of the closing tag. */
    readonly end: number;
    /** Start of the user's own text, after at most two separator newlines. */
    readonly bodyStart: number;
}
/** Recognize only the leading envelope emitted by this plugin; user text after it is kept. */
export declare function matchReviewEnvelope(text: string): ReviewEnvelope | null;
/**
 * Project the envelope to one review node, and its separator to a single display line
 * break so the user's text starts below the pill (or nothing when no text follows).
 */
export declare const reviewCommentsTextRule: UserTextRule<typeof REVIEW_COMMENTS_TEXT_ID>;
export type ReviewCommentsTextProps = PropsRuntime<'conversation.user.text.node', typeof REVIEW_COMMENTS_TEXT_ID> & PropsLocale<typeof NS> & {
    readonly projectRoot?: string | undefined;
};
/** Render the projected envelope as the shared review-comment pill. */
export declare function ReviewCommentsText({ node, projectRoot, t }: ReviewCommentsTextProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ReviewCommentsText.d.ts.map