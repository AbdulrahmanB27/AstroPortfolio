import type { Issue } from '../lib/sections';

interface IssuesPanelProps {
  issues: readonly Issue[];
  onOpen: (issue: Issue) => void;
}

/** Live schema validation. Each row jumps to the section (and project) it refers to. */
export function IssuesPanel({ issues, onOpen }: IssuesPanelProps) {
  return (
    <section className="issues" aria-labelledby="issues-title" data-count={issues.length}>
      <div className="issues__head">
        <h2 id="issues-title" className="eyebrow">
          Issues
        </h2>
        <span className={`pill${issues.length ? ' pill--accent' : ''}`} role="status" aria-live="polite">
          {issues.length === 0 ? 'Valid' : `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`}
        </span>
      </div>
      {issues.length === 0 ? (
        <p className="issues__ok">The draft satisfies the schema. Export is ready.</p>
      ) : (
        <ul className="issues__list">
          {issues.map((issue, i) => (
            <li key={`${issue.path}-${i}`} className="issues__item">
              <button type="button" className="issues__button" onClick={() => onOpen(issue)}>
                <span className="issues__path">{issue.path}</span>
                <span className="issues__msg">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
