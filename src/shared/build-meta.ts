export type BuildMeta = {
  readonly commit: string;
};

export const BUILD_META: BuildMeta = {
  commit: __BUILD_COMMIT__,
};

export function buildCommitUrl(repoUrl: string, commit: string): string {
  return `${repoUrl}/commit/${commit}`;
}
