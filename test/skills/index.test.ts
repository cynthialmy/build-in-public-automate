import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Platform } from '../../src/config/types.js';

import { loadSkillsForPlatforms, loadSkill } from '../../src/skills/index.js';

const { existsSync, readFileSync } = vi.mocked(require('fs'));

const TEST_DIR = process.cwd() + '/.buildpublic-test';

describe('Skills Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadSkillsForPlatforms', () => {
    it('should load skills for multiple platforms', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path: string) => {
        if (path.includes('x.md')) return '# X skills\n- Be concise';
        if (path.includes('linkedin.md')) return '# LinkedIn skills\n- Be professional';
        if (path.includes('reddit.md')) return '# Reddit skills\n- Be informative';
        return '';
      });

      const platforms: Platform[] = ['x', 'linkedin', 'reddit'];
      const result = loadSkillsForPlatforms(platforms);

      expect(result).toContain('Platform-specific skills and strategies');
      expect(result).toContain('# X skills');
      expect(result).toContain('# LinkedIn skills');
      expect(result).toContain('# Reddit skills');
    });

    it('should handle empty platform list', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('');

      const result = loadSkillsForPlatforms([]);

      expect(result).toBe('');
    });

    it('should separate platforms with dashed lines', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path: string) => {
        if (path.includes('x.md')) return '# X skills';
        if (path.includes('linkedin.md')) return '# LinkedIn skills';
        return '';
      });

      const platforms: Platform[] = ['x', 'linkedin'];
      const result = loadSkillsForPlatforms(platforms);

      expect(result).toContain('---');
    });

    it('should handle single platform', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((path: string) => {
        if (path.includes('x.md')) return '# X skills';
        return '';
      });

      const platforms: Platform[] = ['x'];
      const result = loadSkillsForPlatforms(platforms);

      expect(result).toContain('# X skills');
      expect(result).toContain('Platform-specific skills and strategies');
    });

    it('should not include empty content', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('');

      const result = loadSkillsForPlatforms(['x', 'linkedin']);

      expect(result).not.toContain('null');
      expect(result).not.toContain('undefined');
    });
  });

  describe('loadSkill', () => {
    it('should return null if skill file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = loadSkill('x');

      expect(result).toBe(null);
    });

    it('should return skill content if file exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('# Test skills');

      const result = loadSkill('x');

      expect(result).toBe('# Test skills');
    });
  });
});
