import type { Portfolio } from '../../data/schema';
import type { Path } from './paths';

export type SectionId = 'site' | 'profile' | 'skills' | 'resume' | 'categories' | 'projects' | 'planet' | 'settings';

export interface SectionMeta {
  id: SectionId;
  label: string;
  blurb: string;
}

export const SECTIONS: readonly SectionMeta[] = [
  {
    id: 'site',
    label: 'Site',
    blurb: 'Title, description and the notes about content that still needs real words.',
  },
  {
    id: 'profile',
    label: 'Profile',
    blurb: 'Who you are: shown on the home planet, in the cockpit and on the contact screen.',
  },
  {
    id: 'skills',
    label: 'Skills',
    blurb: 'Groups of skills for the cockpit skills screen and the resume.',
  },
  {
    id: 'resume',
    label: 'Resume',
    blurb: 'The integrated resume and the path of the formal PDF.',
  },
  {
    id: 'categories',
    label: 'Categories',
    blurb: 'Project categories and the desaturated colors used for tags and planets.',
  },
  {
    id: 'projects',
    label: 'Projects',
    blurb: 'One planet per project. Order sets the orbit from the inside out.',
  },
  {
    id: 'planet',
    label: 'Planet',
    blurb: 'How each project looks in the system: style, colors, size, decoration and orbit.',
  },
  {
    id: 'settings',
    label: 'Settings',
    blurb: 'Site presentation: schematic grid, intro, audio, label density, orbital motion.',
  },
];

export type Setter = (path: Path, value: unknown) => void;

export interface SectionProps {
  draft: Portfolio;
  set: Setter;
}

export interface Issue {
  path: string;
  message: string;
  section: SectionId;
  projectIndex?: number;
}

/** Turn a "path: message" line from validatePortfolio into a navigable issue. */
export function parseIssue(text: string): Issue {
  const colon = text.indexOf(': ');
  const path = colon >= 0 ? text.slice(0, colon) : '(root)';
  const message = colon >= 0 ? text.slice(colon + 2) : text;
  const parts = path.split('.');
  const head = parts[0] ?? '';
  let section: SectionId = 'site';
  let projectIndex: number | undefined;
  switch (head) {
    case 'meta':
      section = 'site';
      break;
    case 'profile':
      section = 'profile';
      break;
    case 'skills':
      section = 'skills';
      break;
    case 'resume':
      section = 'resume';
      break;
    case 'categories':
      section = 'categories';
      break;
    case 'settings':
      section = 'settings';
      break;
    case 'projects': {
      const index = Number(parts[1]);
      if (Number.isInteger(index)) projectIndex = index;
      section = parts[2] === 'planet' ? 'planet' : 'projects';
      break;
    }
    default:
      section = 'site';
  }
  return { path, message, section, projectIndex };
}
