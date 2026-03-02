import type { PlatformPost, PostResult } from '../config/types.js';

export interface IPlatform {
  readonly name: string;
  hasApiCredentials(): boolean;
  postViaApi(post: PlatformPost): Promise<PostResult>;
  postViaBrowser(post: PlatformPost): Promise<PostResult>;
  post(post: PlatformPost): Promise<PostResult>;
}

export function makeError(
  platform: string,
  error: unknown
): PostResult {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    platform: platform as PostResult['platform'],
    success: false,
    error: msg,
  };
}
