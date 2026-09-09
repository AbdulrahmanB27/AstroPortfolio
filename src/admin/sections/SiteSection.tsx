import { TextArea, TextInput } from '../components/fields';
import { StringList } from '../components/StringList';
import type { SectionProps } from '../lib/sections';

export function SiteSection({ draft, set }: SectionProps) {
  const meta = draft.meta;
  return (
    <>
      <TextInput
        label="Site title"
        value={meta.siteTitle}
        onChange={(v) => set(['meta', 'siteTitle'], v ?? '')}
        hint="Browser tab title and social preview title."
      />
      <TextArea
        label="Description"
        value={meta.description}
        onChange={(v) => set(['meta', 'description'], v ?? '')}
        rows={3}
        hint="Meta description for search engines and link previews."
      />
      <TextInput
        label="Site URL"
        type="url"
        optional
        mono
        value={meta.url}
        onChange={(v) => set(['meta', 'url'], v)}
        placeholder="https://…"
      />
      <div className="grid-2">
        <TextInput label="Version" mono value={meta.version} onChange={(v) => set(['meta', 'version'], v ?? '')} />
        <TextInput
          label="Updated"
          mono
          value={meta.updated}
          onChange={(v) => set(['meta', 'updated'], v ?? '')}
          hint="Free text, e.g. 2026-09-07."
        />
      </div>
      <StringList
        label="Content notes"
        noun="note"
        multiline
        items={meta.contentNotes}
        onChange={(v) => set(['meta', 'contentNotes'], v)}
        hint="Owner-facing reminders about content that still needs real words. Never shown on the site."
      />
    </>
  );
}
