import { portfolio } from '../../data/loadPortfolio';
import { useApp } from '../../state/store';
import { isPlaceholder, stripPlaceholder } from '../../lib/content';

export function AboutPanel() {
  const { profile } = portfolio.data;
  const devMode = useApp((s) => s.devMode);
  const goals = profile.goals.filter((g) => devMode || !isPlaceholder(g));

  return (
    <article className="mc-doc">
      <p className="t-mono">Mission profile</p>
      <h1 className="mc-doc__title">{profile.name}</h1>
      <p className="mc-doc__lede">{profile.intro}</p>
      {profile.bio.map((p, i) => (
        <p key={i} className="mc-doc__p">
          {p}
        </p>
      ))}

      <div className="mc-grid">
        <section>
          <h2 className="mc-doc__h2">Education</h2>
          <ul className="mc-list">
            {profile.education.map((e) => (
              <li key={e.institution}>
                <strong>{e.institution}</strong>
                <span className="mc-list__meta">
                  {e.program}
                  {/* The separator travels with the location. Left loose it wrapped as a
                      line-ending orphan: "...(in progress) ·" then "University Park, PA". */}
                  {e.location ? <span className="nowrap">{` · ${e.location}`}</span> : ''}
                </span>
                <span className="mc-list__meta t-mono">{e.period}</span>
                {e.details.map((d) => (
                  <span key={d} className="mc-list__detail">
                    {d}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mc-doc__h2">Interests</h2>
          <ul className="tags">
            {profile.interests.map((i) => (
              <li key={i} className="tag">
                {i}
              </li>
            ))}
          </ul>
          {goals.length > 0 && (
            <>
              <h2 className="mc-doc__h2">Next</h2>
              <ul className="mc-list mc-list--plain">
                {goals.map((g) => (
                  <li key={g} data-placeholder={isPlaceholder(g)}>
                    {stripPlaceholder(g)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {profile.availability && <p className="mc-doc__note">{profile.availability}</p>}
        </section>
      </div>
    </article>
  );
}
