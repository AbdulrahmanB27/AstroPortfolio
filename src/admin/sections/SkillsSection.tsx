import type { SkillGroup } from '../../data/schema';
import { TextInput } from '../components/fields';
import { ListEditor } from '../components/ListEditor';
import { StringList } from '../components/StringList';
import type { SectionProps } from '../lib/sections';

export function SkillsSection({ draft, set }: SectionProps) {
  return (
    <ListEditor<SkillGroup>
      label="Skill groups"
      noun="group"
      addLabel="Add group"
      items={draft.skills.groups}
      onChange={(v) => set(['skills', 'groups'], v)}
      title={(g) => g.name}
      create={() => ({ id: 'new-group', name: 'New group', items: [''] })}
      hint="Each group becomes one block on the cockpit skills screen. Order here is display order."
    >
      {(group, update) => (
        <>
          <div className="grid-2">
            <TextInput
              label="Group id"
              mono
              value={group.id}
              onChange={(v) => update({ id: v ?? '' })}
              hint="Lowercase slug, unique."
            />
            <TextInput label="Group name" value={group.name} onChange={(v) => update({ name: v ?? '' })} />
          </div>
          <StringList label="Skills" noun="skill" items={group.items} onChange={(v) => update({ items: v })} />
        </>
      )}
    </ListEditor>
  );
}
