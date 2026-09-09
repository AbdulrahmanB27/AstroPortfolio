import { assetUrl, portfolio } from '../../data/loadPortfolio';

function Entries({ title, items }: { title: string; items: typeof portfolio.data.resume.activities }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mc-doc__h2">{title}</h2>
      <ul className="mc-list">
        {items.map((e) => (
          <li key={`${e.role}-${e.org}`}>
            <strong>{e.role}</strong>
            <span className="mc-list__meta">
              {e.org}
              {e.location ? ` · ${e.location}` : ''}
            </span>
            <span className="mc-list__meta t-mono">{e.period}</span>
            {e.bullets.map((b) => (
              <span key={b} className="mc-list__detail">
                {b}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** In-world visual resume plus the formal downloadable PDF. */
export function ResumePanel() {
  const { resume, profile, skills, projectById } = { ...portfolio.data, projectById: portfolio.projectById };
  const pdf = assetUrl(resume.file);
  const fileName = resume.file.split('/').pop() ?? 'resume.pdf';
  const highlights = resume.highlights.map((id) => projectById.get(id)).filter(Boolean);

  return (
    <article className="mc-doc">
      <p className="t-mono">Mission record · updated {resume.updated}</p>
      <h1 className="mc-doc__title">{profile.name}</h1>
      <p className="mc-doc__lede">{resume.headline}</p>
      <div className="resume-actions">
        <a className="pill pill--accent" href={pdf} download={fileName}>
          Download resume (PDF)
        </a>
        <a className="pill" href={pdf} target="_blank" rel="noopener">
          Open in new tab
        </a>
      </div>
      <p className="mc-doc__p">{resume.summary}</p>

      <div className="mc-grid">
        <div>
          <Entries title="Experience" items={resume.experience} />
          <Entries title="Activities & projects" items={resume.activities} />
          <section>
            <h2 className="mc-doc__h2">Education</h2>
            <ul className="mc-list">
              {profile.education.map((e) => (
                <li key={e.institution}>
                  <strong>{e.institution}</strong>
                  <span className="mc-list__meta">{e.program}</span>
                  <span className="mc-list__meta t-mono">{e.period}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div>
          {highlights.length > 0 && (
            <section>
              <h2 className="mc-doc__h2">Selected projects</h2>
              <ul className="mc-list">
                {highlights.map((p) => (
                  <li key={p!.id}>
                    <strong>{p!.title}</strong>
                    <span className="mc-list__meta">{p!.tagline}</span>
                    <span className="mc-list__meta t-mono">{p!.technologies.slice(0, 4).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="mc-doc__h2">Skills</h2>
            <ul className="mc-list mc-list--plain">
              {skills.groups.map((g) => (
                <li key={g.id}>
                  <span className="mc-list__meta">
                    <strong>{g.name}:</strong> {g.items.join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </article>
  );
}
