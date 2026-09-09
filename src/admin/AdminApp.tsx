import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { validatePortfolio } from '../data/schema';
import { IssuesPanel } from './components/IssuesPanel';
import { useDraft } from './hooks/useDraft';
import { copyText, loadedIssues, serialize, SOURCE_PATH } from './lib/draft';
import { parseIssue, SECTIONS, type Issue, type SectionId } from './lib/sections';
import { CategoriesSection } from './sections/CategoriesSection';
import { PlanetSection } from './sections/PlanetSection';
import { ProfileSection } from './sections/ProfileSection';
import { ProjectsSection } from './sections/ProjectsSection';
import { ResumeSection } from './sections/ResumeSection';
import { SettingsSection } from './sections/SettingsSection';
import { SiteSection } from './sections/SiteSection';
import { SkillsSection } from './sections/SkillsSection';

const EXPORT_FILE = 'portfolio.json';

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Static content studio. Left: sections and live validation. Right: the editor for one
 * section. Export is the save: the file replaces src/data/portfolio.json in the repo.
 */
export function AdminApp() {
  const { draft, set, replace, reset, dirty, restored, keepRestored, discardRestored } = useDraft();
  const [section, setSection] = useState<SectionId>('profile');
  const [projectIndex, setProjectIndex] = useState(0);
  const [status, setStatus] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // The sticky top block (header + draft bars) can wrap at narrow widths; the sidebar and
  // the planet preview stick underneath it, so its real height is published as a CSS var.
  useLayoutEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty('--top-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Transient status toast (copy / import / reset feedback).
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(''), 7000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const validation = useMemo(() => validatePortfolio(draft), [draft]);
  const issues = useMemo<Issue[]>(() => (validation.ok ? [] : validation.issues.map(parseIssue)), [validation]);
  const exportJson = useMemo(() => (validation.ok ? serialize(validation.data) : null), [validation]);

  // Blob URL for the <a download> link; refreshed whenever the exportable JSON changes.
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!exportJson) {
      setExportUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([exportJson], { type: 'application/json' }));
    setExportUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [exportJson]);

  const safeProjectIndex = Math.max(0, Math.min(projectIndex, draft.projects.length - 1));

  const issueCounts = useMemo(() => {
    const counts = new Map<SectionId, number>();
    for (const issue of issues) counts.set(issue.section, (counts.get(issue.section) ?? 0) + 1);
    return counts;
  }, [issues]);

  const announce = useCallback((message: string) => setStatus(message), []);

  const openSection = useCallback((id: SectionId) => {
    setSection(id);
    editorRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  const openIssue = useCallback(
    (issue: Issue) => {
      if (issue.projectIndex !== undefined) setProjectIndex(issue.projectIndex);
      openSection(issue.section);
    },
    [openSection],
  );

  const onCopy = async () => {
    if (!exportJson) return;
    const ok = await copyText(exportJson);
    announce(ok ? `Copied ${EXPORT_FILE} to the clipboard.` : 'Copy failed in this browser. Use Export JSON instead.');
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = validatePortfolio(parsed);
      if (result.ok) {
        replace(result.data);
        setProjectIndex(0);
        announce(`Imported ${file.name}. It replaces the draft; export when you are done.`);
      } else {
        announce(
          `Import rejected: ${file.name} has ${result.issues.length} issue${result.issues.length === 1 ? '' : 's'} (first: ${result.issues[0] ?? ''}). The draft was not changed.`,
        );
      }
    } catch {
      announce(`Import failed: ${file.name} is not valid JSON.`);
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const onReset = () => {
    reset();
    setProjectIndex(0);
    announce(`Reset to the data compiled from ${SOURCE_PATH}.`);
  };

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!;

  let body: ReactNode;
  switch (section) {
    case 'site':
      body = <SiteSection draft={draft} set={set} />;
      break;
    case 'profile':
      body = <ProfileSection draft={draft} set={set} />;
      break;
    case 'skills':
      body = <SkillsSection draft={draft} set={set} />;
      break;
    case 'resume':
      body = <ResumeSection draft={draft} set={set} />;
      break;
    case 'categories':
      body = <CategoriesSection draft={draft} set={set} />;
      break;
    case 'projects':
      body = (
        <ProjectsSection
          draft={draft}
          set={set}
          selectedIndex={safeProjectIndex}
          onSelect={setProjectIndex}
          onEditPlanet={(i) => {
            setProjectIndex(i);
            openSection('planet');
          }}
        />
      );
      break;
    case 'planet':
      body = <PlanetSection draft={draft} set={set} selectedIndex={safeProjectIndex} onSelect={setProjectIndex} />;
      break;
    case 'settings':
      body = <SettingsSection draft={draft} set={set} />;
      break;
  }

  const valid = validation.ok;

  return (
    <div className="studio">
      <div className="studio__top" ref={topRef}>
        <header className="studio__header">
          <div className="brand">
            <h1 className="brand__title">Content studio</h1>
            <span className="brand__path mono">{SOURCE_PATH}</span>
          </div>
          <div className="studio__state">
            <span className={`pill${valid ? '' : ' pill--accent'}`} data-valid={valid}>
              {valid ? 'Valid' : `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`}
            </span>
            <span className="pill pill--quiet">{dirty ? 'Unsaved draft' : 'Matches file'}</span>
          </div>
          <div className="studio__actions" role="group" aria-label="Draft actions">
            {exportUrl ? (
              <a
                className="btn btn--primary"
                href={exportUrl}
                download={EXPORT_FILE}
                onClick={() => announce(`Downloading ${EXPORT_FILE}. Replace ${SOURCE_PATH} with it.`)}
              >
                Export JSON
              </a>
            ) : (
              <a
                className="btn btn--primary"
                role="link"
                aria-disabled="true"
                tabIndex={-1}
                title="Fix the listed issues to enable export"
                onClick={(e) => e.preventDefault()}
              >
                Export JSON
              </a>
            )}
            <button type="button" className="btn" disabled={!valid} onClick={onCopy}>
              Copy JSON
            </button>
            <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
              Import JSON…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              aria-label="Import a portfolio JSON file"
              tabIndex={-1}
              onChange={(e) => void onImportFile(e.target.files?.[0])}
            />
            <button type="button" className="btn" onClick={onReset}>
              Reset to loaded data
            </button>
          </div>
        </header>

        {restored ? (
          <div className="draft-bar" role="status">
            <span>
              Draft restored — discard? A draft saved in this browser
              {restored.savedAt ? ` on ${formatSavedAt(restored.savedAt)}` : ''} replaced the compiled data.
            </span>
            <span className="draft-bar__actions">
              <button type="button" className="btn btn--small" onClick={discardRestored}>
                Discard draft
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={keepRestored}>
                Keep editing
              </button>
            </span>
          </div>
        ) : null}

        {loadedIssues.length ? (
          <div className="draft-bar" role="alert">
            The compiled {SOURCE_PATH} does not satisfy the schema ({loadedIssues.length} issues). Fix them here and
            export.
          </div>
        ) : null}
      </div>

      <p className="studio__status" role="status" aria-live="polite" data-visible={status ? 'true' : 'false'}>
        {status}
      </p>

      <div className="studio__body">
        <aside className="studio__side">
          <nav className="nav" aria-label="Sections">
            <ul className="nav__list">
              {SECTIONS.map((s) => {
                const count = issueCounts.get(s.id) ?? 0;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="nav__item"
                      aria-current={s.id === section ? 'page' : undefined}
                      onClick={() => openSection(s.id)}
                    >
                      <span>{s.label}</span>
                      {count ? (
                        <span className="nav__badge mono" aria-label={`${count} issues`}>
                          {count}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <IssuesPanel issues={issues} onOpen={openIssue} />
          <p className="side__note">
            Export is the save. Replace <span className="mono">{SOURCE_PATH}</span> with the downloaded file and push.
            See <span className="mono">docs/ADMIN.md</span>.
          </p>
        </aside>

        <main className="studio__main" ref={editorRef} aria-labelledby="section-title" tabIndex={-1}>
          <header className="section-head">
            <p className="eyebrow">Section</p>
            <h2 id="section-title" className="section-head__title">
              {current.label}
            </h2>
            <p className="section-head__blurb">{current.blurb}</p>
          </header>
          {body}
        </main>
      </div>
    </div>
  );
}
