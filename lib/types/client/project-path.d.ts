/** Keep host paths intact for actions while presenting files relative to their project. */
export declare function displayProjectPath(path: string, projectRoot: string | undefined): string;
/**
 * Compute minimal trailing directory suffixes (VS Code tab style) when two or more
 * paths share the same filename, keeping unique basenames clutter-free.
 */
export declare function disambiguateDirectories(paths: readonly string[]): ReadonlyMap<string, string>;
//# sourceMappingURL=project-path.d.ts.map