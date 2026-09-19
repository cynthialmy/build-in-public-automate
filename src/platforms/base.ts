import type { PlatformPost, PostResult } from '../config/types.js';

/** Local file paths (screenshots, recordings) to attach, if the platform supports it. */
export type Attachments = string[];

export interface IPlatform {
  readonly name: string;
  /** Whether this platform's postViaApi/postViaBrowser can actually upload `attachments`. */
  readonly supportsAttachments: boolean;
  hasApiCredentials(): boolean;
  postViaApi(post: PlatformPost, attachments?: Attachments): Promise<PostResult>;
  postViaBrowser(post: PlatformPost, attachments?: Attachments): Promise<PostResult>;
  post(post: PlatformPost, attachments?: Attachments): Promise<PostResult>;
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
