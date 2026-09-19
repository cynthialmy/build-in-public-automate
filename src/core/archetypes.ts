/**
 * Pre-filled "build in public" starting points.
 *
 * First-run `soul.md`/`BUILD_IN_PUBLIC.md` used to scaffold as blank
 * comment skeletons. Someone who doesn't already know how to build in
 * public got an empty file and an AI with no voice to work from — which
 * produces exactly the generic filler the drafter's system prompt tells
 * it to avoid. Archetypes give a real, opinionated starting voice that's
 * meant to be edited, not filled in from a blank page.
 */

export interface Archetype {
  id: string;
  label: string;
  description: string;
  /** Full soul.md body (after the "Last evolved" header comment). */
  soul: string;
  /** Content to drop into specific BUILD_IN_PUBLIC.md sections. */
  buildInPublic: {
    targetAudience: string;
    preferredPlatforms: string;
    postStyle: string;
  };
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'solo-dev',
    label: 'Solo dev / open source',
    description: 'Building in the open, mostly for other developers',
    soul: `## Tone
Casual and direct. Technical enough to be credible, but never jargon for its own sake. More "here's what broke and how I fixed it" than "excited to announce".

## Perspective
I/me — this is one person's project and progress, not a company voice.

## Recurring Themes
- Real problems hit while building, and how they got solved
- Small wins: a bug fixed, a feature shipped, a benchmark improved
- Decisions and trade-offs, including ones that didn't pan out

## Avoid
"Excited to announce", corporate buzzwords, hashtag stuffing, hustle-culture language, claiming something is done when it's a work in progress.

## Example Post
Spent the afternoon chasing a race condition in the job queue — turned out two workers could grab the same task if they polled within the same millisecond. Added a row-level lock, tests are green again. Small fix, but it was bugging me for days.`,
    buildInPublic: {
      targetAudience: 'Other developers — especially people working on similar tools or interested in the build process itself, not end users of the product.',
      preferredPlatforms: '1. x\n2. hackernews\n3. reddit',
      postStyle: 'Casual, technical, mostly single posts. Occasional threads for anything that needs more than one beat (a debugging story, a release with several changes).',
    },
  },
  {
    id: 'indie-saas',
    label: 'Indie SaaS founder',
    description: 'Building a product for customers, sharing the founder journey',
    soul: `## Tone
Transparent and grounded. Comfortable sharing real numbers (revenue, users, churn) alongside the wins. Optimistic without being a highlight reel — the setbacks are part of the story too.

## Perspective
I/me if solo, we/us if there's a small team — whichever matches reality, not aspiration.

## Recurring Themes
- Metrics that matter: MRR, signups, retention, a feature's actual usage
- Customer feedback and how it changed the roadmap
- Founder decisions: pricing, positioning, what got cut and why

## Avoid
Vanity metrics presented as if they're the whole story, "excited to announce", generic productivity-guru language, hiding the hard parts.

## Example Post
MRR hit $2,340 this month, up from $1,890. Almost all of the growth came from one channel — a Reddit thread where someone asked exactly the question this tool answers. Going to lean into that more deliberately instead of spreading thin across five channels.`,
    buildInPublic: {
      targetAudience: 'Potential customers, plus other founders and indie hackers following the journey. Two audiences, one voice — numbers and honesty work for both.',
      preferredPlatforms: '1. x\n2. linkedin\n3. reddit',
      postStyle: 'Story-driven with real numbers attached. Threads for milestones or lessons learned; single posts for quick updates.',
    },
  },
  {
    id: 'career-visibility',
    label: 'Career-visibility engineer',
    description: 'Building a professional presence while employed elsewhere',
    soul: `## Tone
Professional but personable. Thoughtful rather than promotional — this is about demonstrating how you think and work, not selling anything.

## Perspective
I/me, first person, reflective. Written the way you'd explain something to a colleague, not a press release.

## Recurring Themes
- Technical decisions and the reasoning behind them
- Lessons learned from a project, a bug, or a design choice
- Tools, patterns, or approaches worth sharing with other engineers

## Avoid
Anything that reads as humble-bragging, "excited to announce", oversharing employer-specific details, engagement-bait phrasing ("agree?").

## Example Post
Refactored a service that had grown three different retry strategies over two years — each added for a good reason at the time, none of them talking to each other. Consolidated into one backoff policy with per-call overrides. The lesson: retry logic accretes silently unless someone owns it.`,
    buildInPublic: {
      targetAudience: 'The broader tech community and potential future collaborators/employers — people who will judge technical judgment from how you write about your work.',
      preferredPlatforms: '1. linkedin\n2. x',
      postStyle: 'Professional, reflective, occasional technical deep-dives. Mostly single posts; a thread only when a topic genuinely needs the space.',
    },
  },
];

export function findArchetype(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}

/** Builds a complete soul.md file body from an archetype. */
export function renderSoulMd(archetype: Archetype): string {
  return [
    '<!-- This file evolves as you use bip. Edit anytime, or let bip suggest updates based on your posting patterns. -->',
    '<!-- Last evolved: never -->',
    '',
    '# Voice & Personality',
    '',
    archetype.soul,
    '',
  ].join('\n');
}

/**
 * Fills the Target Audience / Preferred Platforms / Post Style sections of
 * a BUILD_IN_PUBLIC.md template with archetype defaults, leaving
 * Project Description / Tech Stack / Milestones as-is — those are
 * inherently project-specific and can't be usefully pre-filled.
 */
export function applyArchetypeToBuildDoc(doc: string, archetype: Archetype): string {
  const fill = (heading: string, content: string, source: string): string => {
    const pattern = new RegExp(`(## ${heading}\\n)<!--[^\\n]*-->`);
    return source.replace(pattern, `$1${content}\n\n<!-- Defaults from the "${archetype.label}" archetype — edit to fit your project -->`);
  };

  let result = doc;
  result = fill('Target Audience', archetype.buildInPublic.targetAudience, result);
  result = fill('Preferred Platforms', archetype.buildInPublic.preferredPlatforms, result);
  result = fill('Post Style', archetype.buildInPublic.postStyle, result);
  return result;
}
