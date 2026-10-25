import { assetUrl, portfolio } from '../../data/loadPortfolio';
import { formatMonth } from '../../lib/content';

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
      <p className="t-mono">Mission record · updated {formatMonth(resume.updated)}</p>
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
                    {/* The planet is the full case study; the resume only has room for the
                        headline. A recruiter who wants the rest should not have to go and
                        find it in orbit. */}
                    <a className="mc-list__title-link" href={`#/projects/${p!.id}`}>
                      <strong>{p!.title}</strong>
                      <span className="mc-list__go" aria-hidden="true">
                        ↗
                      </span>
                      <span className="visually-hidden"> (open the project)</span>
                    </a>
                    <span className="mc-list__meta">{p!.tagline}</span>
                    {/*
                      One unbreakable item per technology, and no separator glyph at all.

                      Joined into a single string the browser broke the list wherever there was
                      a space — the resume rendered "MECHANICAL DESIGN · 3D" then "PRINTING",
                      which states a technology the data does not contain, and three lines
                      ended on a dangling "·". Moving the "·" onto the term that follows it
                      fixed the trailing artefact and created a leading one: three wrapped
                      lines then STARTED with a middot, which at 1x reads as a bullet or a
                      typo.

                      A glyph that can be orphaned at either end of a line is the wrong
                      separator for a wrapping list. The gap is the separator now — a flex row
                      with a column gap, which cannot be orphaned because it is not a glyph.
                    */}
                    <span className="mc-list__meta mc-list__tech t-mono">
                      {p!.technologies.slice(0, 4).map((t) => (
                        <span key={t} className="nowrap">
                          {t}
                        </span>
                      ))}
                    </span>
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
