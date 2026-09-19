import { describe, it, expect } from 'vitest';
import { ARCHETYPES, findArchetype, renderSoulMd, applyArchetypeToBuildDoc } from '../../src/core/archetypes.js';

const SAMPLE_DOC = `# Build In Public: demo

## Project Description
<!-- What are you building? -->

## Target Audience
<!-- Who do you want to reach with your posts? -->

## Preferred Platforms
<!-- Priority order: x, linkedin, reddit, hackernews -->

## Post Style
<!-- Casual/professional? Thread or single post? How technical? -->

## Milestones / Goals
<!-- What are you working toward? -->
`;

describe('archetypes', () => {
  it('defines at least one archetype with all required fields', () => {
    expect(ARCHETYPES.length).toBeGreaterThan(0);
    for (const a of ARCHETYPES) {
      expect(a.id).toBeTruthy();
      expect(a.label).toBeTruthy();
      expect(a.soul).toContain('## Tone');
      expect(a.buildInPublic.targetAudience).toBeTruthy();
      expect(a.buildInPublic.preferredPlatforms).toBeTruthy();
      expect(a.buildInPublic.postStyle).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('findArchetype', () => {
    it('finds an archetype by id', () => {
      const found = findArchetype(ARCHETYPES[0].id);
      expect(found).toBe(ARCHETYPES[0]);
    });

    it('returns undefined for an unknown id', () => {
      expect(findArchetype('does-not-exist')).toBeUndefined();
    });
  });

  describe('renderSoulMd', () => {
    it('produces a soul.md with the archetype voice sections', () => {
      const rendered = renderSoulMd(ARCHETYPES[0]);
      expect(rendered).toContain('# Voice & Personality');
      expect(rendered).toContain('## Tone');
      expect(rendered).toContain(ARCHETYPES[0].soul.split('\n')[1]); // first content line
    });
  });

  describe('applyArchetypeToBuildDoc', () => {
    it('fills Target Audience, Preferred Platforms, and Post Style', () => {
      const filled = applyArchetypeToBuildDoc(SAMPLE_DOC, ARCHETYPES[0]);

      expect(filled).toContain(ARCHETYPES[0].buildInPublic.targetAudience);
      expect(filled).toContain(ARCHETYPES[0].buildInPublic.preferredPlatforms);
      expect(filled).toContain(ARCHETYPES[0].buildInPublic.postStyle);
    });

    it('leaves Project Description and Milestones untouched', () => {
      const filled = applyArchetypeToBuildDoc(SAMPLE_DOC, ARCHETYPES[0]);

      expect(filled).toContain('<!-- What are you building? -->');
      expect(filled).toContain('<!-- What are you working toward? -->');
    });

    it('notes which archetype filled the section', () => {
      const filled = applyArchetypeToBuildDoc(SAMPLE_DOC, ARCHETYPES[0]);
      expect(filled).toContain(`Defaults from the "${ARCHETYPES[0].label}" archetype`);
    });
  });
});
