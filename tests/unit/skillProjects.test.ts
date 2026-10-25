import { describe, expect, it } from 'vitest';
import { projectsUsingSkill, skillMatchesTechnology } from '../../src/data/skillProjects';
import { portfolio } from '../../src/data/loadPortfolio';

describe('skillMatchesTechnology', () => {
  it('ignores versions, qualifiers and case', () => {
    expect(skillMatchesTechnology('React', 'React 19')).toBe(true);
    expect(skillMatchesTechnology('Tailwind CSS', 'Tailwind CSS 4')).toBe(true);
    expect(skillMatchesTechnology('Capacitor (iOS/Android)', 'Capacitor')).toBe(true);
    expect(skillMatchesTechnology('three.js', 'Three.js')).toBe(true);
  });

  it('splits a skill that names two things', () => {
    expect(skillMatchesTechnology('Node.js / Express', 'Express')).toBe(true);
    expect(skillMatchesTechnology('React Native / Expo', 'Expo')).toBe(true);
    expect(skillMatchesTechnology('Git / GitHub', 'GitHub')).toBe(true);
  });

  it('matches multi-word names by containment at a word boundary', () => {
    expect(skillMatchesTechnology('Cloudflare Pages & D1', 'Cloudflare Pages Functions')).toBe(true);
    expect(skillMatchesTechnology('FDM 3D printing', '3D printing')).toBe(true);
    expect(skillMatchesTechnology('Touchscreen UIs', 'Touchscreen UI')).toBe(true);
  });

  it('does not let a one-word skill claim a longer, different one', () => {
    expect(skillMatchesTechnology('React', 'React Native')).toBe(false);
    expect(skillMatchesTechnology('React', 'React Three Fiber')).toBe(false);
    expect(skillMatchesTechnology('Git / GitHub', 'GitHub Pages')).toBe(false);
    expect(skillMatchesTechnology('Python', 'pygame')).toBe(false);
  });
});

describe('projectsUsingSkill on the shipped content', () => {
  const projects = portfolio.data.projects;
  const ids = (skill: string) => projectsUsingSkill(skill, projects).map((p) => p.id);

  it('finds the projects each headline skill shows up in', () => {
    expect(ids('React')).toEqual(expect.arrayContaining(['sweet-moment', 'mykitchen', 'astro-portfolio']));
    expect(ids('React')).not.toContain('three-d-notes');
    expect(ids('Python')).toEqual(['minecraft-adhan']);
    expect(ids('VEX Robotics')).toEqual(['vex-robots']);
  });

  it('links most skills to at least one project', () => {
    const all = portfolio.data.skills.groups.flatMap((g) => g.items);
    const linked = all.filter((s) => ids(s).length > 0);
    expect(linked.length / all.length).toBeGreaterThan(0.5);
  });
});
