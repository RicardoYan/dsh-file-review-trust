/**
 * Similarity-guided change-block alignment and CJK/code-aware intraline diffing.
 */
export interface IntralineSegment {
    readonly text: string;
    readonly changed: boolean;
}
export interface IntralinePair {
    readonly oldSegments: readonly IntralineSegment[];
    readonly newSegments: readonly IntralineSegment[];
}
export interface PairedChangeRow<T> {
    readonly left?: T | undefined;
    readonly right?: T | undefined;
    /** True when `left` and `right` represent a paired modification candidate. */
    readonly paired: boolean;
}
/** Split code and prose into identifiers, whitespace runs, individual CJK glyphs, and punctuation. */
export declare function tokenizeForIntraline(text: string): string[];
/** Sørensen–Dice multiset similarity over non-whitespace tokens in [0, 1]. */
export declare function lineSimilarity(oldText: string, newText: string): number;
/**
 * Align a contiguous removed/added block using high-confidence similarity anchors,
 * falling back to compact positional pairing for unanchored rewrite runs.
 */
export declare function pairChangeBlock<T extends {
    readonly text: string;
}>(removed: readonly T[], added: readonly T[]): PairedChangeRow<T>[];
/**
 * Compute intraline changed/unchanged spans for a paired modification,
 * or return `null` when lines have no meaningful shared context.
 */
export declare function computeIntralineSegments(oldText: string, newText: string): IntralinePair | null;
//# sourceMappingURL=intraline-diff.d.ts.map