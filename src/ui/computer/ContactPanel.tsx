import { portfolio } from '../../data/loadPortfolio';
import { CopyButton } from '../CopyButton';

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '') + new URL(url).pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function ContactPanel() {
  const { profile } = portfolio.data;
  const c = profile.contact;
  return (
    <article className="mc-doc">
      <p className="t-mono">Communications</p>
      <h1 className="mc-doc__title">Get in touch</h1>
      <p className="mc-doc__lede">
        {profile.availability ?? 'The fastest channel is email.'}
      </p>
      <ul className="contact-list">
        <li>
          <span className="contact-list__label t-mono">Email</span>
          {/* A mailto link does nothing visible for anyone without a desktop mail client,
              which is most people reading this on a work laptop's webmail. */}
          <span className="contact-list__row">
            <a className="contact-list__link" href={`mailto:${c.email}`}>
              {c.email}
            </a>
            <CopyButton text={c.email} label="Copy" />
          </span>
        </li>
        <li>
          <span className="contact-list__label t-mono">GitHub</span>
          <a className="contact-list__link" href={c.github} target="_blank" rel="noopener">
            {hostOf(c.github)}
          </a>
        </li>
        {c.linkedin && (
          <li>
            <span className="contact-list__label t-mono">LinkedIn</span>
            <a className="contact-list__link" href={c.linkedin} target="_blank" rel="noopener">
              {hostOf(c.linkedin)}
            </a>
          </li>
        )}
        {c.links.map((l) => (
          <li key={l.url}>
            <span className="contact-list__label t-mono">{l.label}</span>
            <a className="contact-list__link" href={l.url} target="_blank" rel="noopener">
              {hostOf(l.url)}
            </a>
          </li>
        ))}
      </ul>
      {profile.location && <p className="mc-doc__note">Based in {profile.location}.</p>}
    </article>
  );
}
