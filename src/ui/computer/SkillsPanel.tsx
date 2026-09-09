import { portfolio } from '../../data/loadPortfolio';

export function SkillsPanel() {
  const groups = portfolio.data.skills.groups;
  return (
    <article className="mc-doc">
      <p className="t-mono">Capabilities</p>
      <h1 className="mc-doc__title">Skills</h1>
      <p className="mc-doc__lede">Grouped by the kind of work they show up in. No percentages — the projects are the proof.</p>
      <div className="skill-grid">
        {groups.map((g) => (
          <section key={g.id} className="skill-group">
            <h2 className="skill-group__name">{g.name}</h2>
            <ul className="tags">
              {g.items.map((item) => (
                <li key={item} className="tag">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
