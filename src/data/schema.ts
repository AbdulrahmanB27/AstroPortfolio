import { z } from 'zod';

/**
 * Single source of truth for portfolio content. `src/data/portfolio.json` must satisfy
 * this schema; the app validates at startup and the admin studio validates before export.
 * Keep this file free of rendering concerns — layout math lives in orbitLayout/labelLayout.
 */

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color');

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Expected a lowercase slug (a-z, 0-9, hyphens)');

export const LinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});

export const MediaSchema = z.object({
  type: z.enum(['image', 'gif', 'video']),
  /** Path relative to the site root, e.g. "media/projects/sweet-moment-home.jpg". */
  src: z.string().min(1),
  alt: z.string().min(1),
  caption: z.string().optional(),
  /** Poster image for videos. */
  poster: z.string().optional(),
});

export const EducationSchema = z.object({
  institution: z.string().min(1),
  program: z.string().min(1),
  period: z.string().min(1),
  location: z.string().optional(),
  details: z.array(z.string()).default([]),
});

export const ContactSchema = z.object({
  email: z.string().email(),
  github: z.string().url(),
  linkedin: z.string().url().optional(),
  links: z.array(LinkSchema).default([]),
});

export const ProfileSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1),
  title: z.string().min(1),
  tagline: z.string().min(1),
  intro: z.string().min(1),
  bio: z.array(z.string()).default([]),
  location: z.string().optional(),
  education: z.array(EducationSchema).default([]),
  interests: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  contact: ContactSchema,
  availability: z.string().optional(),
});

export const SkillGroupSchema = z.object({
  id: slug,
  name: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
});

export const ExperienceSchema = z.object({
  role: z.string().min(1),
  org: z.string().min(1),
  period: z.string().min(1),
  location: z.string().optional(),
  bullets: z.array(z.string()).default([]),
});

export const ResumeSchema = z.object({
  /** Path relative to the site root of the formal, ATS-friendly PDF. */
  file: z.string().min(1),
  updated: z.string().min(1),
  headline: z.string().min(1),
  summary: z.string().min(1),
  experience: z.array(ExperienceSchema).default([]),
  activities: z.array(ExperienceSchema).default([]),
  /** Project ids to feature on the resume, in order. */
  highlights: z.array(slug).default([]),
});

export const PlanetStyleSchema = z.enum(['rocky', 'terra', 'gas', 'ice', 'lava', 'metal', 'ocean']);

export const OrbitOverrideSchema = z.object({
  /** Force a specific ring index (0 = innermost project ring). */
  ring: z.number().int().min(0).max(11).optional(),
  /** Force the starting angle in degrees. */
  angle: z.number().min(0).max(360).optional(),
  /** Multiplier on the default orbital speed. */
  speed: z.number().min(0).max(4).optional(),
});

export const PlanetSchema = z.object({
  style: PlanetStyleSchema,
  color: hexColor,
  accent: hexColor.optional(),
  /** Relative size, 0.5–3. 1 ≈ a normal planet, 2 ≈ featured. */
  size: z.number().min(0.5).max(3).default(1),
  rings: z.boolean().default(false),
  moons: z.number().int().min(0).max(3).default(0),
  orbit: OrbitOverrideSchema.default({}),
});

export const ProjectStatusSchema = z.enum(['live', 'in-progress', 'archived', 'concept']);

export const ProjectSchema = z.object({
  id: slug,
  title: z.string().min(1),
  category: slug,
  year: z.string().optional(),
  status: ProjectStatusSchema.default('live'),
  tagline: z.string().min(1),
  summary: z.string().min(1),
  description: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  links: z
    .object({
      repo: z.string().url().optional(),
      live: z.string().url().optional(),
      other: z.array(LinkSchema).default([]),
    })
    .default({ other: [] }),
  media: z.array(MediaSchema).default([]),
  process: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  order: z.number().int().min(0),
  planet: PlanetSchema,
  /** True when the owner still needs to confirm or rewrite this entry. */
  placeholder: z.boolean().default(false),
});

export const CategorySchema = z.object({
  id: slug,
  name: z.string().min(1),
  color: hexColor,
});

export const SettingsSchema = z.object({
  grid: z.object({
    enabled: z.boolean().default(false),
    opacity: z.number().min(0).max(1).default(0.08),
    /** Number of radial spokes; rings follow the orbit spacing. */
    density: z.number().int().min(4).max(36).default(12),
    /** World-unit radius where the grid has fully faded out. */
    radius: z.number().min(100).max(3000).default(640),
  }),
  intro: z.object({
    enabled: z.boolean().default(true),
  }),
  audio: z.object({
    enabled: z.boolean().default(true),
  }),
  labels: z.object({
    density: z.enum(['all', 'balanced', 'minimal']).default('balanced'),
  }),
  motion: z.object({
    orbitSpeedScale: z.number().min(0).max(4).default(1),
  }),
});

export const MetaSchema = z.object({
  siteTitle: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url().optional(),
  version: z.string().min(1),
  updated: z.string().min(1),
  /** Owner-facing notes about content that still needs real words. */
  contentNotes: z.array(z.string()).default([]),
});

export const PortfolioSchema = z
  .object({
    meta: MetaSchema,
    profile: ProfileSchema,
    skills: z.object({ groups: z.array(SkillGroupSchema).min(1) }),
    resume: ResumeSchema,
    categories: z.array(CategorySchema).min(1),
    projects: z.array(ProjectSchema).min(1),
    settings: SettingsSchema,
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>();
    for (const [i, p] of data.projects.entries()) {
      if (ids.has(p.id)) {
        ctx.addIssue({ code: 'custom', path: ['projects', i, 'id'], message: `Duplicate project id "${p.id}"` });
      }
      ids.add(p.id);
      if (!data.categories.some((c) => c.id === p.category)) {
        ctx.addIssue({
          code: 'custom',
          path: ['projects', i, 'category'],
          message: `Unknown category "${p.category}"`,
        });
      }
    }
    for (const [i, h] of data.resume.highlights.entries()) {
      if (!ids.has(h)) {
        ctx.addIssue({ code: 'custom', path: ['resume', 'highlights', i], message: `Unknown project id "${h}"` });
      }
    }
    const catIds = new Set<string>();
    for (const [i, c] of data.categories.entries()) {
      if (catIds.has(c.id)) {
        ctx.addIssue({ code: 'custom', path: ['categories', i, 'id'], message: `Duplicate category id "${c.id}"` });
      }
      catIds.add(c.id);
    }
  });

export type Portfolio = z.infer<typeof PortfolioSchema>;
export type PortfolioInput = z.input<typeof PortfolioSchema>;
export type Profile = Portfolio['profile'];
export type Project = Portfolio['projects'][number];
export type Planet = Project['planet'];
export type PlanetStyle = z.infer<typeof PlanetStyleSchema>;
export type Category = Portfolio['categories'][number];
export type SkillGroup = Portfolio['skills']['groups'][number];
export type Resume = Portfolio['resume'];
export type Settings = Portfolio['settings'];
export type Media = z.infer<typeof MediaSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;

/** Parse untrusted JSON (admin import, exported files). Throws a readable error. */
export function parsePortfolio(input: unknown): Portfolio {
  return PortfolioSchema.parse(input);
}

/** Non-throwing variant for the admin studio's live validation. */
export function validatePortfolio(input: unknown): { ok: true; data: Portfolio } | { ok: false; issues: string[] } {
  const result = PortfolioSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  };
}
