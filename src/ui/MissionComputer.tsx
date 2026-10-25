import { useEffect, useRef } from 'react';
import { assetUrl, portfolio } from '../data/loadPortfolio';
import { useApp, type CockpitTab } from '../state/store';
import { exitCockpit, setCockpitView } from '../sequences';
import { useHasMoreBelow } from './useHasMoreBelow';
import { AboutPanel } from './computer/AboutPanel';
import { SkillsPanel } from './computer/SkillsPanel';
import { ResumePanel } from './computer/ResumePanel';
import { ContactPanel } from './computer/ContactPanel';

/*
 * No numbers on these.
 *
 * I put 01-04 on the rail last round and Anthropic's `frontend-design` skill names exactly
 * that as a generated-page tell: "Many generic designs use numbered markers (01 / 02 / 03),
 * but that's only appropriate if the content actually is a sequence." These four are not a
 * sequence — nobody reads About, then Skills, then Resume, then Contact in order — so the
 * numbers were counting peers, which is decoration wearing the costume of information.
 *
 * The console displays in the cabin keep theirs, and the difference is the point: a
 * spacecraft's instrument bank numbering its screens 01-04 comes from the subject matter. A
 * flat page numbering its nav does not.
 */
const TABS: { id: CockpitTab; label: string; sub: string }[] = [
  { id: 'about', label: 'About', sub: 'Mission profile' },
  { id: 'skills', label: 'Skills', sub: 'Capabilities' },
  { id: 'resume', label: 'Resume', sub: 'Mission record' },
  { id: 'contact', label: 'Contact', sub: 'Communications' },
];

/**
 * The reader: the spacecraft's personal sections, set as a page.
 *
 * The navigation is a rail down the left rather than a tab row with a cluster of pills
 * opposite it. Three things follow from that, and all three were review findings against the
 * old header:
 *
 *  - The sections are a list you can see the whole of, with their numbers and captions, so the
 *    surface says what is in it before you click anything. A tab row with four items and no
 *    captions said only which one was open.
 *  - There is one way out and it sits at the foot of the rail, where the list ends. The header
 *    carried three co-equal controls — a full-screen toggle, "back to cabin" and "exit
 *    cockpit" — two of which meant "leave" at different depths; three independent lenses read
 *    that as a toolbar of unrelated dots. The toggle is gone with the view it toggled.
 *  - The width that was empty is now doing something. On the resume the right half above the
 *    columns measured 620x320px of nothing.
 *
 * The reading column keeps its own measure regardless; the rail takes room the prose was never
 * going to use.
 */
export function MissionComputer() {
  const scene = useApp((s) => s.scene);
  const tab = useApp((s) => s.cockpitTab);
  const view = useApp((s) => s.cockpitView);
  const visible = scene === 'cockpit';
  const frameRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const { more, ref: bodyRef, current: body } = useHasMoreBelow<HTMLDivElement>([tab, visible]);
  const { profile, resume } = portfolio.data;
  // Same asset URL the Resume panel builds, so the two cannot point at different files.
  const resumePdf = assetUrl(resume.file);

  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [tab]);

  /*
   * How far through the document you are.
   *
   * The resume runs to several screens and the only cue was a chevron saying "there is more" —
   * true on the first screen and on the last but one, and no help with "how much more". A
   * 2px rule across the top of the page is the cheapest honest answer, and it is a rule
   * rather than a percentage because nobody needs the number.
   *
   * Written straight to a CSS custom property from the scroll handler: routing a per-scroll
   * value through React state would re-render the whole document on every frame of a flick.
   */
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const onScroll = () => {
      const span = el.scrollHeight - el.clientHeight;
      const at = span > 8 ? el.scrollTop / span : 0;
      progressRef.current?.style.setProperty('--read', String(Math.max(0, Math.min(1, at))));
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [tab, visible, body]);

  return (
    <section className="mc" data-visible={visible} data-view={view} aria-hidden={!visible} aria-label="Mission computer">
      <div className="mc__frame" ref={frameRef} data-more={more}>
        <nav className="mc__rail" aria-label="Sections">
          {/* A masthead, not a heading. At 17px semibold it tied with the h1 it sits beside,
              and on About and Resume that h1 is the same string. */}
          <div className="mc__rail-head">
            <p className="mc__rail-eyebrow t-mono">Mission computer</p>
            <p className="mc__rail-name">{profile.name}</p>
          </div>
          <ul className="mc__rail-list" role="tablist" aria-label="Sections">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className="mc__tab"
                  data-active={tab === t.id}
                  tabIndex={visible ? 0 : -1}
                  onClick={() => setCockpitView('full', t.id)}
                >
                  <span className="mc__tab-text">
                    <span className="mc__tab-label">{t.label}</span>
                    <span className="mc__tab-sub">{t.sub}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/*
            The resume, one click from anywhere.

            It is the thing a recruiter came for and it was two clicks in — open the section,
            then find the button. Outlined rather than filled: the Resume section's own
            download is the primary and there is only one accent colour to spend.
          */}
          <a
            className="pill mc__rail-cta"
            href={resumePdf}
            download={resume.file.split('/').pop() ?? 'resume.pdf'}
            tabIndex={visible ? 0 : -1}
          >
            <span aria-hidden="true">↓</span> Resume (PDF)
          </a>
          {/* One way out of the reader, and one out of the ship. Escape does the first. */}
          <div className="mc__rail-foot">
            <button
              type="button"
              className="pill mc__back"
              aria-label="Back to the cabin"
              onClick={() => setCockpitView('room')}
              tabIndex={visible ? 0 : -1}
            >
              <span aria-hidden="true">←</span> <span className="pill__text">Back to the cabin</span>
            </button>
            <button
              type="button"
              className="mc__exit"
              onClick={exitCockpit}
              tabIndex={visible ? 0 : -1}
            >
              Leave the rocket
            </button>
          </div>
        </nav>
        <div className="mc__page">
          <span className="mc__progress" ref={progressRef} aria-hidden="true" />
          <div className="mc__body" ref={bodyRef} role="tabpanel">
            {tab === 'about' && <AboutPanel />}
            {tab === 'skills' && <SkillsPanel />}
            {tab === 'resume' && <ResumePanel />}
            {tab === 'contact' && <ContactPanel />}
          </div>
          <span className="scroll-cue" data-visible={more} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
