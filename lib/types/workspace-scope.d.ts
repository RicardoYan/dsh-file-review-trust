/**
 * Which paths this plugin may capture and toggle (fork addition).
 *
 * Without dsh-workspace-trust the scope is the session directory, exactly as in
 * upstream dsh-file-review. With it, the scope follows the trust plugin's rules
 * (the same rules dsh-symlink-passthrough and dsh-project-config use):
 *   - inside the workspace root (`findRoot(cwd)`)             -> allowed
 *   - outside it                                              -> only when the workspace is trusted
 *   - on the denied list, wherever it is                      -> never
 * The decision is made by the trust plugin's `checkResolved(root, realPath)`;
 * this module only resolves paths and asks. Relative paths still resolve
 * against the session directory.
 *
 * Interface relied on: the optional `workspaceTrust` service (v1) published by
 * dsh-workspace-trust — `findRoot(cwd)` and `checkResolved(root, realPath)`
 * returning `{ ok: true } | { ok: false, code, message }`.
 */
/** The subset of the dsh-workspace-trust service this plugin uses. */
export interface WorkspaceTrustLike {
    findRoot(cwd: string): Promise<string>;
    checkResolved(root: string, realPath: string): Promise<{
        readonly ok: true;
    } | {
        readonly ok: false;
        readonly message: string;
    }>;
}
/** Answers "may this real path be captured / toggled" for one session directory. */
export interface WorkspaceScope {
    /** The session directory's real path; relative paths resolve against it. */
    readonly cwd: string;
    /** `undefined` when allowed, otherwise the reason. */
    check(realPath: string): Promise<string | undefined>;
}
/** Thrown reason for paths outside the session directory without the trust plugin. */
export declare const OUTSIDE_REASON = "path is outside the session workspace";
export declare function inside(root: string, candidate: string): boolean;
/**
 * Build the scope for one session directory.
 * @param cwd - session working directory.
 * @param trust - the `workspaceTrust` service when installed; read at call time.
 */
export declare function workspaceScope(cwd: string, trust: unknown): Promise<WorkspaceScope>;
/**
 * Real path of a not-yet-existing file: the nearest existing ancestor's real
 * path plus the remaining segments (a tool may create several directories).
 */
export declare function realMissingPath(candidate: string): Promise<string>;
//# sourceMappingURL=workspace-scope.d.ts.map