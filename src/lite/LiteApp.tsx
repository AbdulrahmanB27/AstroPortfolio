import { assetUrl, portfolio } from '../data/loadPortfolio';
import { isPlaceholder, stripPlaceholder } from '../lib/content';
import { Starfield } from './Starfield';
import { CopyButton } from '../ui/CopyButton';

/**
 * The simplified portfolio: the same universe, told flat.
 *
 * This is a separate HTML entry rather than a mode inside the 3D app, and that is the whole
 * point — nothing here imports three, so the page never downloads the ~190 KB renderer or
 * pays for a WebGL context. It reads the same `portfolio.json` through the same loader as
 * the 3D site, so there is still exactly one place content lives.
 *
 * It is also the honest fallback: on a machine with no working WebGL, or a browser where the
 * 3D site would be a black rectangle, this is a real portfolio rather than an apology.
 */
export function LiteApp() {
  const { profile, skills, resume, projects, categories } = portfolio.data;
  const ordered = projects.slice().sort((a, b) => a.order - b.order);
  const categoryOf = (id: string) => categories.find((c) => c.id === id);
  const goals = profile.goals.filter((g) => !isPlaceholder(g));

  return (
    <div className="lite">
      <Starfield />

      <header className="lite__hero">
        <p className="t-mono lite__eyebrow">Portfolio</p>
        <h1 className="lite__name">{profile.name}</h1>
        <p className="lite__title">{profile.title}</p>
        <nav className="lite__nav" aria-label="Sections">
          <a href="#work">Work</a>
          <a href="#about">About</a>
          <a href="#skills">Skills</a>
          <a href="#resume">Resume</a>
          <a href="#contact">Contact</a>
        </nav>
        <p className="lite__switch">
          {/* No trailing arrow. `frontend-design` lists "a '→' appended to link and button
              text" as template chrome, and it is right here: the pager's "Next →" earns its
              arrow because the arrow is the direction, and this one does not. */}
          <a href="../">Open the interactive version</a>
        </p>
      </header>

      <main>
        <section id="work" className="lite__section">
          <h2 className="lite__h2">
            <span className="t-mono lite__index">01</span> Work
          </h2>
          <ul className="lite__projects">
            {ordered.map((p) => {
              const cat = categoryOf(p.category);
              const shot = p.media.find((m) => m.type === 'image' || m.type === 'gif');
              return (
                <li key={p.id} className="lite-card" data-placeholder={p.placeholder}>
                  {shot && (
                    <img
                      className="lite-card__shot"
                      src={assetUrl(shot.src)}
                      alt={shot.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <div className="lite-card__body">
                    <p className="t-mono lite-card__meta">
                      <span className="lite-card__dot" style={{ background: cat?.color }} aria-hidden="true" />
                      {cat?.name}
                      {p.year ? ` · ${p.year}` : ''}
                      {p.status !== 'live' ? ` · ${p.status.replace('-', ' ')}` : ''}
                    </p>
                    <h3 className="lite-card__title">{p.title}</h3>
                    <p className="lite-card__tagline">{p.tagline}</p>
                    <p className="lite-card__summary">{p.summary}</p>
                    {p.technologies.length > 0 && (
                      <ul className="tags lite-card__tech">
                        {p.technologies.map((t) => (
                          <li key={t} className="tag">
                            {t}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="lite-card__links">
                      {p.links.live && (
                        <a className="lite-link lite-link--accent" href={p.links.live} target="_blank" rel="noopener">
                          Open live site
                        </a>
                      )}
                      {p.links.repo && (
                        <a className="lite-link" href={p.links.repo} target="_blank" rel="noopener">
                          Source on GitHub
                        </a>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="about" className="lite__section">
          <h2 className="lite__h2">
            <span className="t-mono lite__index">02</span> About
          </h2>
          <p className="lite__lede">{profile.intro}</p>
          {profile.bio.map((para, i) => (
            <p key={i} className="lite__p">
              {para}
            </p>
          ))}
          <div className="lite__grid">
            <section>
              <h3 className="lite__h3">Education</h3>
              <ul className="lite__list">
                {profile.education.map((e) => (
                  <li key={e.institution}>
                    <strong>{e.institution}</strong>
                    <span className="lite__meta">
                      {e.program}
                      {e.location ? <span className="nowrap">{` · ${e.location}`}</span> : ''}
                    </span>
                    <span className="lite__meta t-mono">{e.period}</span>
                    {e.details.map((d) => (
                      <span key={d} className="lite__detail">
                        {d}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="lite__h3">Interests</h3>
              <ul className="tags">
                {profile.interests.map((i) => (
                  <li key={i} className="tag">
                    {i}
                  </li>
                ))}
              </ul>
              {goals.length > 0 && (
                <>
                  <h3 className="lite__h3">Next</h3>
                  <ul className="lite__list lite__list--plain">
                    {goals.map((g) => (
                      <li key={g}>{stripPlaceholder(g)}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </section>

        <section id="skills" className="lite__section">
          <h2 className="lite__h2">
            <span className="t-mono lite__index">03</span> Skills
          </h2>
          <div className="lite__grid">
            {skills.groups.map((group) => (
              <section key={group.id}>
                <h3 className="lite__h3">{group.name}</h3>
                <ul className="tags">
                  {group.items.map((item) => (
                    <li key={item} className="tag">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <section id="resume" className="lite__section">
          <h2 className="lite__h2">
            <span className="t-mono lite__index">04</span> Resume
          </h2>
          <p className="lite__lede">{resume.summary}</p>
          <p className="lite-card__links">
            <a className="lite-link lite-link--accent" href={assetUrl(resume.file)} download>
              Download the PDF
            </a>
            <span className="lite__meta t-mono">Updated {resume.updated}</span>
          </p>
          {[
            { title: 'Experience', items: resume.experience },
            { title: 'Activities & projects', items: resume.activities },
          ].map(({ title, items }) =>
            items.length === 0 ? null : (
              <section key={title}>
                <h3 className="lite__h3">{title}</h3>
                <ul className="lite__list">
                  {items.map((e) => (
                    <li key={`${e.role}-${e.org}`}>
                      <strong>{e.role}</strong>
                      <span className="lite__meta">
                        {e.org}
                        {e.location ? <span className="nowrap">{` · ${e.location}`}</span> : ''}
                      </span>
                      <span className="lite__meta t-mono">{e.period}</span>
                      {e.bullets.map((b) => (
                        <span key={b} className="lite__detail">
                          {b}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </section>

        <section id="contact" className="lite__section">
          <h2 className="lite__h2">
            <span className="t-mono lite__index">05</span> Contact
          </h2>
          <p className="lite__lede">{profile.availability ?? 'The fastest channel is email.'}</p>
          <ul className="lite__list lite__list--plain lite__contact">
            <li>
              <span className="t-mono lite__meta">Email</span>
              <span className="lite__contact-value">
                <a className="lite-link" href={`mailto:${profile.contact.email}`}>
                  {profile.contact.email}
                </a>
                <CopyButton value={profile.contact.email} label={`Copy email address ${profile.contact.email}`} className="lite-link" />
              </span>
            </li>
            <li>
              <span className="t-mono lite__meta">GitHub</span>
              <a className="lite-link" href={profile.contact.github} target="_blank" rel="noopener">
                {profile.contact.github.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
            </li>
            {profile.contact.linkedin && (
              <li>
                <span className="t-mono lite__meta">LinkedIn</span>
                <a className="lite-link" href={profile.contact.linkedin} target="_blank" rel="noopener">
                  {profile.contact.linkedin.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              </li>
            )}
            {profile.contact.links.map((l) => (
              <li key={l.url}>
                <span className="t-mono lite__meta">{l.label}</span>
                <a className="lite-link" href={l.url} target="_blank" rel="noopener">
                  {l.url.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="lite__footer">
        <p className="t-mono">{profile.name}</p>
        <p>
          <a href="../">Interactive version</a>
        </p>
      </footer>
    </div>
  );
}
