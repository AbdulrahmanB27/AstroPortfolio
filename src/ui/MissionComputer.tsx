import { useEffect, useRef } from 'react';
import { useApp, type CockpitTab } from '../state/store';
import { exitCockpit } from '../sequences';
import { useHasMoreBelow } from './useHasMoreBelow';
import { AboutPanel } from './computer/AboutPanel';
import { SkillsPanel } from './computer/SkillsPanel';
import { ResumePanel } from './computer/ResumePanel';
import { ContactPanel } from './computer/ContactPanel';

const TABS: { id: CockpitTab; label: string; sub: string }[] = [
  { id: 'about', label: 'About', sub: 'Mission profile' },
  { id: 'skills', label: 'Skills', sub: 'Capabilities' },
  { id: 'resume', label: 'Resume', sub: 'Mission record' },
  { id: 'contact', label: 'Contact', sub: 'Communications' },
];

/** The spacecraft's main computer: personal sections rendered on the cockpit screen. */
export function MissionComputer() {
  const scene = useApp((s) => s.scene);
  const tab = useApp((s) => s.cockpitTab);
  const setTab = useApp((s) => s.setCockpitTab);
  const visible = scene === 'cockpit';
  const frameRef = useRef<HTMLDivElement>(null);
  const { more, ref: bodyRef, current: body } = useHasMoreBelow<HTMLDivElement>([tab, visible]);

  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [tab]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitCockpit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  return (
    <section className="mc" data-visible={visible} aria-hidden={!visible} aria-label="Mission computer">
      <div className="mc__frame" ref={frameRef} data-more={more}>
        <header className="mc__header">
          <div className="mc__tabs" role="tablist" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className="mc__tab"
                data-active={tab === t.id}
                tabIndex={visible ? 0 : -1}
                onClick={() => setTab(t.id)}
              >
                <span className="mc__tab-label">{t.label}</span>
                <span className="mc__tab-sub">{t.sub}</span>
              </button>
            ))}
          </div>
          <button type="button" className="pill mc__exit" onClick={exitCockpit} tabIndex={visible ? 0 : -1}>
            <span aria-hidden="true">←</span> Exit cockpit
          </button>
        </header>
        <div className="mc__body" ref={bodyRef} role="tabpanel">
          {tab === 'about' && <AboutPanel />}
          {tab === 'skills' && <SkillsPanel />}
          {tab === 'resume' && <ResumePanel />}
          {tab === 'contact' && <ContactPanel />}
        </div>
        <span className="scroll-cue" data-visible={more} aria-hidden="true" />
        <i className="mc__corner mc__corner--tl" aria-hidden="true" />
        <i className="mc__corner mc__corner--tr" aria-hidden="true" />
        <i className="mc__corner mc__corner--bl" aria-hidden="true" />
        <i className="mc__corner mc__corner--br" aria-hidden="true" />
      </div>
    </section>
  );
}
