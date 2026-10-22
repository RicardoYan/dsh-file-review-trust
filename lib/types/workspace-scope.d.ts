/**
 * Which paths this plugin may capture and toggle (fork addition).
 *
 * The scope is the whole machine: a session may write through a directory link
 * (a `tools/` junction is the usual case), so the real path of an edit is often
 * outside the session directory. Anything a file tool changed is captured and
 * can be toggled back; relative paths still resolve against the session
 * directory.
 */
/** Answers "may this real path be captured / toggled" for one session directory. */
export interface WorkspaceScope {
    /** The session directory's real path; relative paths resolve against it. */
    readonly cwd: string;
    /** `undefined` when allowed, otherwise the reason. */
    check(realPath: string): Promise<string | undefined>;
}
/**
 * Build the scope for one session directory.
 * @param cwd - session working directory.
 */
export declare function workspaceScope(cwd: string): Promise<WorkspaceScope>;
/**
 * Real path of a not-yet-existing file: the nearest existing ancestor's real
 * path plus the remaining segments (a tool may create several directories).
 */
export declare function realMissingPath(candidate: string): Promise<string>;
//# sourceMappingURL=workspace-scope.d.ts.map