// Pure HTML renderer for the formal resume. No I/O, no dates, no browser: it turns the
// validated portfolio data into a single-column, ATS-friendly document that
// scripts/build-resume.mjs prints to PDF. Keep every string from the JSON; never add facts.

/** Content the owner still needs to write starts with "PLACEHOLDER:" (see src/lib/content.ts). */
export function isPlaceholder(text) {
  return /^\s*placeholder\s*:/i.test(String(text ?? ''));
}

/** Keep only real, non-empty strings. */
export function realStrings(list) {
  return (Array.isArray(list) ? list : []).map((s) => String(s ?? '').trim()).filter((s) => s && !isPlaceholder(s));
}

/** Non-empty string that is not a placeholder, else undefined. */
export function realString(text) {
  const s = String(text ?? '').trim();
  return s && !isPlaceholder(s) ? s : undefined;
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const SEPARATOR = ' · ';

/**
 * Build the resume as plain data first (sections in the required order) so the HTML and
 * the console summary agree. Empty sections and placeholder text are dropped here.
 */
export function buildResumeModel(data) {
  const { profile, resume, skills, projects, meta } = data;
  const skipped = [];
  const placeholderEntries = [];
  const note = (path, text) => skipped.push(`${path}: ${String(text).slice(0, 60)}`);

  // Contact line: title · location · email · github · linkedin · other links (plain text).
  const contact = [];
  for (const [path, value] of [
    ['profile.title', profile.title],
    ['profile.location', profile.location],
    ['profile.contact.email', profile.contact?.email],
    ['profile.contact.github', profile.contact?.github],
    ['profile.contact.linkedin', profile.contact?.linkedin],
  ]) {
    if (value === undefined || value === null || value === '') continue;
    if (isPlaceholder(value)) note(path, value);
    else contact.push(String(value).trim());
  }
  for (const link of profile.contact?.links ?? []) {
    if (!link?.url) continue;
    if (isPlaceholder(link.url) || isPlaceholder(link.label)) note('profile.contact.links', link.url);
    else contact.push(String(link.url).trim());
  }

  const summary = realString(resume.summary);
  if (resume.summary && !summary) note('resume.summary', resume.summary);

  const education = (profile.education ?? [])
    .filter((e) => {
      const ok = realString(e.institution) && realString(e.program);
      if (!ok) note('profile.education', e.institution ?? e.program ?? '');
      return ok;
    })
    .map((e) => ({
      institution: e.institution.trim(),
      program: e.program.trim(),
      period: realString(e.period),
      location: realString(e.location),
      details: realStrings(e.details),
    }));

  const entries = (list, path) =>
    (list ?? [])
      .filter((e) => {
        const ok = realString(e.role) && realString(e.org);
        if (!ok) note(path, e.role ?? e.org ?? '');
        return ok;
      })
      .map((e) => ({
        role: e.role.trim(),
        org: e.org.trim(),
        period: realString(e.period),
        location: realString(e.location),
        bullets: realStrings(e.bullets),
      }));
  const experience = entries(resume.experience, 'resume.experience');
  const activities = entries(resume.activities, 'resume.activities');

  const byId = new Map((projects ?? []).map((p) => [p.id, p]));
  const highlights = [];
  for (const id of resume.highlights ?? []) {
    const p = byId.get(id);
    if (!p) {
      note('resume.highlights', `unknown project "${id}"`);
      continue;
    }
    const title = realString(p.title);
    if (!title) {
      note(`projects.${id}.title`, p.title ?? '');
      continue;
    }
    if (p.placeholder) placeholderEntries.push(`projects.${id} (placeholder: true)`);
    const links = [];
    if (realString(p.links?.live)) links.push({ label: 'Live', url: p.links.live.trim() });
    if (realString(p.links?.repo)) links.push({ label: 'Code', url: p.links.repo.trim() });
    for (const other of p.links?.other ?? []) {
      if (realString(other?.url) && realString(other?.label)) links.push({ label: other.label.trim(), url: other.url.trim() });
    }
    highlights.push({
      title,
      tagline: realString(p.tagline),
      year: realString(p.year),
      technologies: realStrings(p.technologies),
      links,
    });
  }

  const skillGroups = (skills?.groups ?? [])
    .map((g) => ({ name: realString(g.name), items: realStrings(g.items) }))
    .filter((g) => g.name && g.items.length);

  const sections = [];
  if (summary) sections.push({ id: 'summary', title: 'Summary', kind: 'text', text: summary });
  if (education.length) sections.push({ id: 'education', title: 'Education', kind: 'education', items: education });
  if (experience.length) sections.push({ id: 'experience', title: 'Experience', kind: 'entries', items: experience });
  if (activities.length) sections.push({ id: 'activities', title: 'Activities & Projects', kind: 'entries', items: activities });
  if (highlights.length) sections.push({ id: 'projects', title: 'Selected Projects', kind: 'projects', items: highlights });
  if (skillGroups.length) sections.push({ id: 'skills', title: 'Skills', kind: 'skills', items: skillGroups });

  const footer = [];
  if (realString(meta?.url)) footer.push(`Portfolio: ${meta.url.trim()}`);
  if (realString(resume.updated)) footer.push(`Updated ${resume.updated.trim()}`);

  return {
    name: String(profile.name ?? '').trim(),
    contact,
    sections,
    footer,
    skipped,
    placeholderEntries,
  };
}

/**
 * Entry heading: bold title, then the period inline after a separator. The period is not
 * right-aligned on purpose — a second "column" of dates breaks the reading order that
 * text extractors and ATS parsers rely on.
 */
function headHtml(title, period) {
  return `<p class="entry__head"><strong>${escapeHtml(title)}</strong>${period ? `${escapeHtml(SEPARATOR)}${escapeHtml(period)}` : ''}</p>`;
}

function entryHtml(e) {
  const meta = [e.org, e.location].filter(Boolean).join(', ');
  return `
      <div class="entry">
        ${headHtml(e.role, e.period)}
        ${meta ? `<p class="entry__meta">${escapeHtml(meta)}</p>` : ''}
        ${e.bullets.length ? `<ul>${e.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
      </div>`;
}

function educationHtml(e) {
  const meta = [e.program, e.location].filter(Boolean).join(SEPARATOR);
  return `
      <div class="entry">
        ${headHtml(e.institution, e.period)}
        <p class="entry__meta">${escapeHtml(meta)}</p>
        ${e.details.length ? `<ul>${e.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
      </div>`;
}

function projectHtml(p) {
  const lines = [];
  if (p.technologies.length) lines.push(`Technologies: ${p.technologies.join(', ')}`);
  if (p.links.length) lines.push(p.links.map((l) => `${l.label}: ${l.url}`).join(SEPARATOR));
  return `
      <div class="entry">
        ${headHtml(p.title, p.year)}
        ${p.tagline ? `<p class="entry__meta">${escapeHtml(p.tagline)}</p>` : ''}
        ${lines.map((l) => `<p class="entry__line">${escapeHtml(l)}</p>`).join('')}
      </div>`;
}

function sectionHtml(section) {
  let body = '';
  switch (section.kind) {
    case 'text':
      body = `<p>${escapeHtml(section.text)}</p>`;
      break;
    case 'education':
      body = section.items.map(educationHtml).join('');
      break;
    case 'entries':
      body = section.items.map(entryHtml).join('');
      break;
    case 'projects':
      body = section.items.map(projectHtml).join('');
      break;
    case 'skills':
      body = `<ul class="skills">${section.items
        .map((g) => `<li><strong>${escapeHtml(g.name)}:</strong> ${escapeHtml(g.items.join(', '))}</li>`)
        .join('')}</ul>`;
      break;
  }
  return `
    <section id="${section.id}">
      <h2>${escapeHtml(section.title)}</h2>${body}
    </section>`;
}

/**
 * Typography is deliberately tight (10pt body, 0.6in margins on Letter) so the current
 * content fits one page. Black on white, a single thin rule under each heading, no
 * columns, tables, icons or images: everything is real, selectable text.
 */
const CSS = `
  @page { size: Letter; margin: 0.6in; }
  html { -webkit-print-color-adjust: exact; }
  body {
    margin: 0;
    color: #000;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    line-height: 1.25;
  }
  @media screen {
    body { max-width: 8.5in; box-sizing: border-box; margin: 0 auto; padding: 0.6in; }
  }
  h1, h2 { font-family: Georgia, "Times New Roman", serif; font-weight: normal; margin: 0; }
  h1 { font-size: 22pt; line-height: 1.1; letter-spacing: 0.01em; }
  h2 {
    font-size: 11pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 8pt 0 3pt;
    padding-bottom: 2pt;
    border-bottom: 1px solid #000;
    page-break-after: avoid;
  }
  p { margin: 0; }
  .contact { margin-top: 3pt; font-size: 9pt; }
  .entry { margin: 0 0 3.5pt; page-break-inside: avoid; }
  .entry__meta, .entry__line { font-size: 9.5pt; }
  ul { margin: 1pt 0 0; padding-left: 14pt; }
  li { margin: 0; padding-left: 1pt; }
  .skills { list-style: none; padding-left: 0; }
  .skills li { margin-bottom: 1pt; }
  .footer { margin-top: 6pt; font-size: 8.5pt; }
`;

export function renderResumeHtml(data) {
  const model = buildResumeModel(data);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(model.name)} – Resume</title>
<meta name="author" content="${escapeHtml(model.name)}">
<style>${CSS}</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(model.name)}</h1>
    ${model.contact.length ? `<p class="contact">${model.contact.map(escapeHtml).join(escapeHtml(SEPARATOR))}</p>` : ''}
  </header>
  <main>${model.sections.map(sectionHtml).join('')}
  </main>
  ${model.footer.length ? `<footer><p class="footer">${model.footer.map(escapeHtml).join(escapeHtml(SEPARATOR))}</p></footer>` : ''}
</body>
</html>
`;
  return { html, model };
}
