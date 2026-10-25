import type { Project } from './schema';

/**
 * Which projects a skill shows up in.
 *
 * The Skills section says "no percentages — the projects are the proof" and then gave no way
 * to get from a skill to the proof. Skills and project technologies are written by hand in
 * two different places, so they never quite agree on spelling: "React" against "React 19",
 * "Capacitor (iOS/Android)" against "Capacitor", "Node.js / Express" against "Express". This
 * matches them loosely enough to bridge that and strictly enough that "React" does not claim
 * a React Native project.
 *
 * Pure, so it is unit-tested rather than eyeballed.
 */

function words(s: string): string[] {
  return (
    s
      .toLowerCase()
      // "(basics)", "(iOS/Android)": qualifiers, not part of the name.
      .replace(/\([^)]*\)/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      // A trailing version is not part of the name either: "React 19", "Tailwind CSS 4".
      .filter((w, i, all) => !(i === all.length - 1 && i > 0 && /^v?\d+(\.\d+)*$/.test(w)))
      // Plural-insensitive, on plain words only, so "three.js" and "css" are left alone.
      .map((w) => (w.length >= 3 && /^[a-z]+[^s]s$/.test(w) ? w.slice(0, -1) : w))
  );
}

/** "Node.js / Express" and "Cloudflare Pages & D1" each name more than one thing. */
function alternatives(skill: string): string[][] {
  return skill
    .split(/\s+[/&]\s+/)
    .map(words)
    .filter((w) => w.length > 0);
}

function startsWith(a: string[], b: string[]): boolean {
  return b.every((w, i) => a[i] === w);
}

function endsWith(a: string[], b: string[]): boolean {
  return b.every((w, i) => a[a.length - b.length + i] === w);
}

/**
 * Equal, or one contains the other at a word boundary — but only when the shorter side is two
 * words or more. A one-word name is too ambiguous to match by containment: "React" is a
 * prefix of "React Native", and they are different skills.
 */
function sameThing(a: string[], b: string[]): boolean {
  if (a.length === b.length) return a.every((w, i) => w === b[i]);
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  if (short.length < 2) return false;
  return startsWith(long, short) || endsWith(long, short);
}

export function skillMatchesTechnology(skill: string, technology: string): boolean {
  const tech = words(technology);
  if (!tech.length) return false;
  return alternatives(skill).some((alt) => sameThing(alt, tech));
}

/** Projects whose technologies include `skill`, in the order the projects are given. */
export function projectsUsingSkill<P extends Pick<Project, 'id' | 'technologies'>>(skill: string, projects: readonly P[]): P[] {
  return projects.filter((p) => p.technologies.some((t) => skillMatchesTechnology(skill, t)));
}
