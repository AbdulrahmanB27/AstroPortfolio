import { useRef } from 'react';
import { assetUrl, portfolio } from '../data/loadPortfolio';
import { useRescueFocus } from './focus';
import { useApp, type CockpitTab } from '../state/store';
import { enterCockpit } from '../sequences';
import { launch } from '../sequences/launch';

interface MenuItem {
  id: CockpitTab | 'projects';
  label: string;
  sub: string;
}

const ITEMS: MenuItem[] = [
  { id: 'about', label: 'About', sub: 'Mission profile' },
  { id: 'projects', label: 'Projects', sub: 'Launch and explore' },
  { id: 'skills', label: 'Skills', sub: 'Capabilities' },
  { id: 'resume', label: 'Resume', sub: 'Mission record' },
  { id: 'contact', label: 'Contact', sub: 'Communications' },
];

/** Primary navigation on the home planet. Real buttons; keyboard and screen readers work. */
export function HomeMenu() {
  const scene = useApp((s) => s.scene);
  const busy = useApp((s) => s.busy);
  const visible = scene === 'home' && !busy;
  const { profile, resume } = portfolio.data;
  const tabIndex = visible ? 0 : -1;
  const navRef = useRef<HTMLElement>(null);
  useRescueFocus(visible, () => navRef.current?.querySelector<HTMLElement>('.home-menu__item'));

  return (
    <>
      <div className="lockup" data-visible={visible}>
        {/* The page's one h1. The name was a div, so a screen reader's heading list and a
            search engine both found a page with no title on it. */}
        <h1 className="lockup__name">{profile.name}</h1>
        <div className="lockup__title">{profile.title}</div>
        {/* The same `profile.tagline` the About display and /lite/ carry. The landing frame
            said who he is and where he studies but never what he builds. */}
        <div className="lockup__tagline">{profile.tagline}</div>
        {/*
          The three things a recruiter came for, without a flight.

          Every one of them existed, but each was behind a cockpit entry: the resume two
          sections deep, the email on the Contact display. Someone with thirty seconds should
          not have to learn the universe to download a PDF. Quiet links rather than buttons —
          the menu is still the way in, this is the way past it.
        */}
        <nav className="quick-links" aria-label="Quick links">
          <a href={assetUrl(resume.file)} download={resume.file.split('/').pop() ?? 'resume.pdf'} tabIndex={tabIndex}>
            <span aria-hidden="true">↓</span> Resume PDF
          </a>
          <a href={`mailto:${profile.contact.email}`} tabIndex={tabIndex}>
            Email
          </a>
          <a href={profile.contact.github} target="_blank" rel="noopener" tabIndex={tabIndex}>
            GitHub
          </a>
          {profile.contact.linkedin && (
            <a href={profile.contact.linkedin} target="_blank" rel="noopener" tabIndex={tabIndex}>
              LinkedIn
            </a>
          )}
        </nav>
      </div>
      <nav ref={navRef} className="home-menu" data-visible={visible} aria-label="Primary" aria-hidden={!visible}>
        {ITEMS.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className="home-menu__item"
            style={{ '--delay': `${i * 60}ms` } as React.CSSProperties}
            tabIndex={tabIndex}
            onClick={(e) => {
              if (item.id === 'projects') launch({ comedic: e.shiftKey });
              else enterCockpit(item.id);
            }}
          >
            <span className="home-menu__tick" aria-hidden="true" />
            <span>
              <span className="home-menu__label">{item.label}</span>
              <span className="home-menu__sub">{item.sub}</span>
            </span>
          </button>
        ))}
        {/* A way out of the 3D for anyone who wants one — a slow connection, a machine that
            hates WebGL, a recruiter with thirty seconds. Deliberately quiet: it sits under
            the navigation rather than competing with it. */}
        <a className="home-menu__lite" href="lite/" tabIndex={tabIndex}>
          Simplified version
        </a>
      </nav>
    </>
  );
}
