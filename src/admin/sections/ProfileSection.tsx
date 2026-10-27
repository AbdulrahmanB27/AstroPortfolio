import type { Education } from '../../data/schema';
import { TextArea, TextInput } from '../components/fields';
import { ListEditor } from '../components/ListEditor';
import { StringList } from '../components/StringList';
import type { SectionProps } from '../lib/sections';

type Link = { label: string; url: string };

export function ProfileSection({ draft, set }: SectionProps) {
  const profile = draft.profile;
  const contact = profile.contact;
  return (
    <>
      <div className="grid-2">
        <TextInput
          label="Name"
          value={profile.name}
          onChange={(v) => set(['profile', 'name'], v ?? '')}
          autoComplete="name"
        />
        <TextInput
          label="Short name"
          value={profile.shortName}
          onChange={(v) => set(['profile', 'shortName'], v ?? '')}
          hint="First name, used in headings."
        />
      </div>
      <TextInput
        label="Title"
        value={profile.title}
        onChange={(v) => set(['profile', 'title'], v ?? '')}
        hint="One line under the name, e.g. degree · school."
      />
      <TextArea
        label="Intro"
        value={profile.intro}
        onChange={(v) => set(['profile', 'intro'], v ?? '')}
        rows={4}
        hint="Opening paragraph on the About screen."
      />
      <StringList
        label="Bio paragraphs"
        noun="paragraph"
        multiline
        items={profile.bio}
        onChange={(v) => set(['profile', 'bio'], v)}
      />
      <div className="grid-2">
        <TextInput
          label="Location"
          optional
          value={profile.location}
          onChange={(v) => set(['profile', 'location'], v)}
        />
        <TextInput
          label="Availability"
          optional
          value={profile.availability}
          onChange={(v) => set(['profile', 'availability'], v)}
          hint="Shown on the contact screen."
        />
      </div>

      <ListEditor<Education>
        label="Education"
        noun="entry"
        items={profile.education}
        onChange={(v) => set(['profile', 'education'], v)}
        title={(e) => e.institution}
        create={() => ({
          institution: '',
          program: '',
          period: '',
          details: [],
        })}
      >
        {(entry, update) => (
          <>
            <div className="grid-2">
              <TextInput
                label="Institution"
                value={entry.institution}
                onChange={(v) => update({ institution: v ?? '' })}
              />
              <TextInput label="Program" value={entry.program} onChange={(v) => update({ program: v ?? '' })} />
              <TextInput
                label="Period"
                value={entry.period}
                onChange={(v) => update({ period: v ?? '' })}
                placeholder="2025 – present"
              />
              <TextInput label="Location" optional value={entry.location} onChange={(v) => update({ location: v })} />
            </div>
            <StringList label="Details" noun="detail" items={entry.details} onChange={(v) => update({ details: v })} />
          </>
        )}
      </ListEditor>

      <StringList
        label="Interests"
        noun="interest"
        items={profile.interests}
        onChange={(v) => set(['profile', 'interests'], v)}
      />
      <StringList
        label="Goals"
        noun="goal"
        multiline
        items={profile.goals}
        onChange={(v) => set(['profile', 'goals'], v)}
        hint='Text starting with "PLACEHOLDER:" is hidden in production and shown dashed in dev mode.'
      />

      <h3 className="list__title">Contact</h3>
      <div className="grid-2">
        <TextInput
          label="Email"
          type="email"
          mono
          value={contact.email}
          onChange={(v) => set(['profile', 'contact', 'email'], v ?? '')}
          autoComplete="email"
        />
        <TextInput
          label="GitHub URL"
          type="url"
          mono
          value={contact.github}
          onChange={(v) => set(['profile', 'contact', 'github'], v ?? '')}
        />
        <TextInput
          label="LinkedIn URL"
          type="url"
          mono
          optional
          value={contact.linkedin}
          onChange={(v) => set(['profile', 'contact', 'linkedin'], v)}
          placeholder="https://www.linkedin.com/in/…"
        />
      </div>
      <ListEditor<Link>
        label="Other links"
        noun="link"
        items={contact.links}
        onChange={(v) => set(['profile', 'contact', 'links'], v)}
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
    </>
  );
}
