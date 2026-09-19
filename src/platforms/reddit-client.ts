/**
 * Minimal Reddit OAuth2 "script app" client (fetch-based).
 *
 * Replaces snoowrap, which pulls in an unmaintained `request`/`tough-cookie`/
 * `ws` dependency chain with 2 critical + 5 high advisories (see project
 * audit). Reddit's script-app password grant + REST API cover the one
 * thing this tool needs (submit a self-post), so a direct client avoids
 * that whole chain for ~60 lines.
 */
import type { RedditCredentials } from '../config/types.js';

const USER_AGENT_PREFIX = 'bip-cli/1.0';

export class RedditApiError extends Error {}

async function getAccessToken(creds: RedditCredentials): Promise<string> {
  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `${USER_AGENT_PREFIX} by ${creds.username}`,
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: creds.username,
      password: creds.password,
    }).toString(),
  });

  if (!res.ok) {
    throw new RedditApiError(`Reddit auth failed: HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new RedditApiError(`Reddit auth failed: ${data.error ?? 'no access_token in response'}`);
  }
  return data.access_token;
}

/** GET /api/v1/me — used to verify credentials (`bip auth reddit`). */
export async function getMe(creds: RedditCredentials): Promise<{ name: string }> {
  const token = await getAccessToken(creds);
  const res = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': `${USER_AGENT_PREFIX} by ${creds.username}`,
    },
  });
  if (!res.ok) {
    throw new RedditApiError(`Reddit /me failed: HTTP ${res.status}`);
  }
  return (await res.json()) as { name: string };
}

/** POST /api/submit (self-text post) — returns the submission's permalink. */
export async function submitSelfPost(
  creds: RedditCredentials,
  opts: { subreddit: string; title: string; text: string }
): Promise<{ permalink: string }> {
  const token = await getAccessToken(creds);

  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `${USER_AGENT_PREFIX} by ${creds.username}`,
    },
    body: new URLSearchParams({
      api_type: 'json',
      sr: opts.subreddit,
      kind: 'self',
      title: opts.title,
      text: opts.text,
    }).toString(),
  });

  if (!res.ok) {
    throw new RedditApiError(`Reddit submit failed: HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    json?: { errors?: [string, string][]; data?: { url?: string; id?: string } };
  };

  const errors = data.json?.errors;
  if (errors?.length) {
    throw new RedditApiError(`Reddit submit rejected: ${errors.map((e) => e.join(': ')).join('; ')}`);
  }

  const url = data.json?.data?.url;
  if (!url) {
    throw new RedditApiError('Reddit submit succeeded but returned no post URL');
  }

  // The API returns a full URL; keep the same shape callers already expect (a permalink path).
  const permalink = url.startsWith('http') ? new URL(url).pathname : url;
  return { permalink };
}

/** GET /by_id/t3_<id36> — score + comment count for a previously submitted post. */
export async function getPostMetrics(
  creds: RedditCredentials,
  postId36: string
): Promise<{ score: number; numComments: number } | null> {
  const token = await getAccessToken(creds);

  const res = await fetch(`https://oauth.reddit.com/by_id/t3_${postId36}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': `${USER_AGENT_PREFIX} by ${creds.username}`,
    },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    data?: { children?: { data?: { score?: number; num_comments?: number } }[] };
  };
  const post = data.data?.children?.[0]?.data;
  if (!post || post.score === undefined) return null;

  return { score: post.score, numComments: post.num_comments ?? 0 };
}
