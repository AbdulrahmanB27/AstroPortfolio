import { useId, useMemo, useState } from 'react';
import { portfolio } from '../../data/loadPortfolio';
import { projectsUsingSkill } from '../../data/skillProjects';

/**
 * Skills, each one a way into the work that shows it.
 *
 * The lede has always said "the projects are the proof", and until now nothing on the page
 * connected the two: a visitor curious whether "Python" meant a weekend or a shipped thing had
 * to leave, launch, and open planets one at a time to find out. A skill that appears in a
 * project's technologies is now a toggle; opening it lists those projects as links into the
 * orbit. A skill with no project behind it stays a plain tag — it is still true, it just has
 * nothing to point at, and pretending otherwise would be the percentage bar by another name.
 */
export function SkillsPanel() {
  const groups = portfolio.data.skills.groups;
  const projects = portfolio.data.projects;
  const [open, setOpen] = useState<string | null>(null);
  const baseId = useId();

  const usage = useMemo(() => {
    const map = new Map<string, typeof projects>();
    for (const g of groups) for (const item of g.items) map.set(item, projectsUsingSkill(item, projects));
    return map;
  }, [groups, projects]);

  const anyLinked = [...usage.values()].some((list) => list.length > 0);

  return (
    <article className="mc-doc">
      <p className="t-mono">Capabilities</p>
      <h1 className="mc-doc__title">Skills</h1>
      <p className="mc-doc__lede">
        Grouped by the kind of work they show up in. No percentages — the projects are the proof.
        {anyLinked && <span className="mc-doc__hint"> Select a highlighted skill to see where it was used.</span>}
      </p>
      <div className="skill-grid">
        {groups.map((g) => {
          const openHere = g.items.find((item) => item === open);
          const used = openHere ? usage.get(openHere) ?? [] : [];
          const panelId = `${baseId}-${g.id}`;
          return (
            <section key={g.id} className="skill-group">
              <h2 className="skill-group__name">{g.name}</h2>
              <ul className="tags">
                {g.items.map((item) => {
                  const count = usage.get(item)?.length ?? 0;
                  if (!count) {
                    return (
                      <li key={item} className="tag">
                        {item}
                      </li>
                    );
                  }
                  const expanded = open === item;
                  return (
                    <li key={item}>
                      <button
                        type="button"
                        className="tag tag--linked"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => setOpen(expanded ? null : item)}
                      >
                        {item}
                        <span className="tag__count" aria-hidden="true">
                          {count}
                        </span>
                        <span className="visually-hidden">{`, used in ${count} project${count === 1 ? '' : 's'}`}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div id={panelId} className="skill-usage" data-open={!!openHere} aria-live="polite">
                {openHere && (
                  <>
                    <span className="skill-usage__label t-mono">Used in</span>
                    <ul className="skill-usage__list">
                      {used.map((p) => (
                        <li key={p.id}>
                          <a href={`#/projects/${p.id}`} className="skill-usage__link">
                            {p.title}
                            <span aria-hidden="true"> ↗</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}
