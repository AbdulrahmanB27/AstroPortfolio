import { useState } from 'react';
import { assetUrl } from '../../data/loadPortfolio';
import type { Media, Project } from '../../data/schema';
import { CheckboxInput, SelectInput, TextArea, TextInput } from '../components/fields';
import { ListEditor } from '../components/ListEditor';
import { StringList } from '../components/StringList';
import { insertItem, moveItem, removeItem } from '../lib/paths';
import type { SectionProps } from '../lib/sections';

type Link = { label: string; url: string };

const STATUS_OPTIONS = [
  { value: 'live', label: 'Live' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'archived', label: 'Archived' },
  { value: 'concept', label: 'Concept' },
] as const;

const MEDIA_TYPES = [
  { value: 'image', label: 'Image' },
  { value: 'gif', label: 'GIF' },
  { value: 'video', label: 'Video' },
] as const;

/** Array position is the orbit order: every list operation rewrites `order` as 1..n. */
export function renumber(projects: readonly Project[]): Project[] {
  return projects.map((p, i) => ({ ...p, order: i + 1 }));
}

function uniqueId(base: string, taken: readonly string[]): string {
  let id = base;
  let n = 2;
  while (taken.includes(id)) id = `${base}-${n++}`;
  return id;
}

export function newProject(order: number, category: string, taken: readonly string[]): Project {
  return {
    id: uniqueId('new-project', taken),
    title: 'New project',
    category,
    status: 'concept',
    tagline: 'PLACEHOLDER: one-line tagline',
    summary: 'PLACEHOLDER: two or three sentences about the project.',
    description: [],
    technologies: [],
    links: { other: [] },
    media: [],
    process: [],
    featured: false,
    order,
    planet: {
      style: 'rocky',
      color: '#8a8f99',
      size: 1,
      rings: false,
      moons: 0,
      orbit: {},
    },
    placeholder: true,
  };
}

function MediaThumb({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false);
  const src = media.type === 'video' ? media.poster : media.src;
  if (!src || failed) return <span className="media-thumb media-thumb--empty" aria-hidden="true" />;
  return <img className="media-thumb" src={assetUrl(src)} alt="" onError={() => setFailed(true)} />;
}

interface ProjectsSectionProps extends SectionProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
  onEditPlanet: (index: number) => void;
}

export function ProjectsSection({ draft, set, selectedIndex, onSelect, onEditPlanet }: ProjectsSectionProps) {
  const projects = draft.projects;
  const ids = projects.map((p) => p.id);
  const commit = (list: readonly Project[]) => set(['projects'], renumber(list));
  const project = projects[selectedIndex];
  const setField = (key: keyof Project, value: unknown) => set(['projects', selectedIndex, key], value);
  const categoryOptions = draft.categories.map((c) => ({
    value: c.id,
    label: c.name || c.id,
  }));

  const add = () => {
    commit([...projects, newProject(projects.length + 1, draft.categories[0]?.id ?? '', ids)]);
    onSelect(projects.length);
  };
  const duplicate = (i: number) => {
    const source = projects[i];
    if (!source) return;
    const copy: Project = structuredClone(source);
    copy.id = uniqueId(`${source.id}-copy`, ids);
    copy.title = `${source.title} (copy)`;
    commit(insertItem(projects, i + 1, copy));
    onSelect(i + 1);
  };
  const remove = (i: number) => {
    commit(removeItem(projects, i));
    onSelect(Math.max(0, Math.min(i, projects.length - 2)));
  };
  const move = (from: number, to: number) => {
    commit(moveItem(projects, from, to));
    onSelect(to);
  };

  return (
    <>
      <ol className="plist" aria-label="Projects in orbit order">
        {projects.map((p, i) => (
          <li key={i} className="plist__row" aria-current={i === selectedIndex ? 'true' : undefined}>
            <span className="plist__order mono" aria-label={`order ${p.order}`}>
              {p.order}
            </span>
            <button
              type="button"
              className="plist__title"
              onClick={() => onSelect(i)}
              aria-pressed={i === selectedIndex}
            >
              <span>{p.title || '(untitled)'}</span>
              <span className="plist__id mono">
                {p.id}
                {p.featured ? ' · featured' : ''}
                {p.placeholder ? ' · placeholder' : ''}
              </span>
            </button>
            <span className="row-actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
                aria-label={`Move ${p.title} up`}
              >
                Up
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={i === projects.length - 1}
                onClick={() => move(i, i + 1)}
                aria-label={`Move ${p.title} down`}
              >
                Down
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => duplicate(i)}
                aria-label={`Duplicate ${p.title}`}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={projects.length <= 1}
                onClick={() => remove(i)}
                aria-label={`Remove ${p.title}`}
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="toolbar">
        <button type="button" className="btn" onClick={add}>
          Add project
        </button>
        <p className="field__hint">
          Up and down change the orbit order (1 = innermost ring). New projects start as placeholders.
        </p>
      </div>

      {project ? (
        <div className="subsection" key={selectedIndex}>
          <div className="subsection__head">
            <h3 className="subsection__title">
              {project.title || '(untitled)'} <span className="mono muted">order {project.order}</span>
            </h3>
            <button type="button" className="btn btn--small" onClick={() => onEditPlanet(selectedIndex)}>
              Edit planet
            </button>
          </div>

          <div className="grid-2">
            <TextInput
              label="Project id"
              mono
              value={project.id}
              onChange={(v) => setField('id', v ?? '')}
              hint="Lowercase slug; the deep link is #/projects/<id>."
            />
            <TextInput label="Title" value={project.title} onChange={(v) => setField('title', v ?? '')} />
            <SelectInput
              label="Category"
              value={project.category}
              options={categoryOptions}
              onChange={(v) => setField('category', v)}
            />
            <SelectInput
              label="Status"
              value={project.status}
              options={STATUS_OPTIONS}
              onChange={(v) => setField('status', v)}
              hint='Anything but "live" is shown in the panel header.'
            />
            <TextInput
              label="Year"
              optional
              value={project.year}
              onChange={(v) => setField('year', v)}
              placeholder="2025 or 2024 – 2025"
            />
          </div>
          <TextInput
            label="Tagline"
            value={project.tagline}
            onChange={(v) => setField('tagline', v ?? '')}
            hint="Shown under the planet label and in the panel header."
          />
          <TextArea label="Summary" value={project.summary} onChange={(v) => setField('summary', v ?? '')} rows={3} />
          <StringList
            label="Description paragraphs"
            noun="paragraph"
            multiline
            items={project.description}
            onChange={(v) => setField('description', v)}
          />
          <StringList
            label="Technologies"
            noun="technology"
            items={project.technologies}
            onChange={(v) => setField('technologies', v)}
          />

          <h3 className="list__title">Links</h3>
          <div className="grid-2">
            <TextInput
              label="Repository URL"
              type="url"
              mono
              optional
              value={project.links.repo}
              onChange={(v) => set(['projects', selectedIndex, 'links', 'repo'], v)}
            />
            <TextInput
              label="Live URL"
              type="url"
              mono
              optional
              value={project.links.live}
              onChange={(v) => set(['projects', selectedIndex, 'links', 'live'], v)}
            />
          </div>
          <ListEditor<Link>
            label="Other links"
            noun="link"
            items={project.links.other}
            onChange={(v) => set(['projects', selectedIndex, 'links', 'other'], v)}
            title={(l) => l.label}
            create={() => ({ label: '', url: '' })}
          >
            {(link, update) => (
              <div className="grid-2">
                <TextInput label="Label" value={link.label} onChange={(v) => update({ label: v ?? '' })} />
                <TextInput label="URL" type="url" mono value={link.url} onChange={(v) => update({ url: v ?? '' })} />
              </div>
            )}
          </ListEditor>

          <ListEditor<Media>
            label="Media"
            noun="media item"
            addLabel="Add media"
            items={project.media}
            onChange={(v) => setField('media', v)}
            title={(m) => m.src}
            create={() => ({ type: 'image', src: 'media/projects/', alt: '' })}
            hint="Drop originals in media-src/projects/ and run npm run media:optimise; reference the .webp it writes to public/media/projects/. Paths are site-relative (no leading slash)."
          >
            {(media, update) => (
              <div className="media-row">
                <MediaThumb media={media} />
                <div className="media-row__fields">
                  <div className="grid-2">
                    <SelectInput
                      label="Type"
                      value={media.type}
                      options={MEDIA_TYPES}
                      onChange={(v) => update({ type: v })}
                    />
                    <TextInput
                      label="Source path"
                      mono
                      value={media.src}
                      onChange={(v) => update({ src: v ?? '' })}
                      placeholder="media/projects/file.webp"
                    />
                  </div>
                  <TextInput
                    label="Alt text"
                    value={media.alt}
                    onChange={(v) => update({ alt: v ?? '' })}
                    hint="Describe the image for screen readers."
                  />
                  <div className="grid-2">
                    <TextInput
                      label="Caption"
                      optional
                      value={media.caption}
                      onChange={(v) => update({ caption: v })}
                    />
                    <TextInput
                      label="Poster path"
                      mono
                      optional
                      value={media.poster}
                      onChange={(v) => update({ poster: v })}
                      hint="Videos only."
                    />
                  </div>
                </div>
              </div>
            )}
          </ListEditor>

          <StringList
            label="Process notes"
            noun="step"
            multiline
            items={project.process}
            onChange={(v) => setField('process', v)}
            hint="How it was made; shown under the description."
          />
          <div className="grid-2">
            <CheckboxInput
              label="Featured (bigger planet, higher label priority)"
              checked={project.featured}
              onChange={(v) => setField('featured', v)}
            />
            <CheckboxInput
              label="Placeholder (still needs confirmation)"
              checked={project.placeholder}
              onChange={(v) => setField('placeholder', v)}
            />
          </div>
        </div>
      ) : (
        <p className="list__empty">No projects. Add one to place a planet.</p>
      )}
    </>
  );
}
