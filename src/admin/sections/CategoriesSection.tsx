import type { Category } from '../../data/schema';
import { ColorInput, TextInput } from '../components/fields';
import { ListEditor } from '../components/ListEditor';
import type { SectionProps } from '../lib/sections';

export function CategoriesSection({ draft, set }: SectionProps) {
  const usage = new Map<string, number>();
  for (const p of draft.projects) usage.set(p.category, (usage.get(p.category) ?? 0) + 1);
  return (
    <ListEditor<Category>
      label="Categories"
      noun="category"
      items={draft.categories}
      onChange={(v) => set(['categories'], v)}
      title={(c) => {
        const n = usage.get(c.id) ?? 0;
        return `${c.name || c.id}${n ? ` · used by ${n} project${n === 1 ? '' : 's'}` : ' · unused'}`;
      }}
      create={() => ({
        id: 'new-category',
        name: 'New category',
        color: '#8a8f99',
      })}
      hint="Keep colors desaturated so tags and planets sit inside the same world (see docs/ART_DIRECTION.md)."
    >
      {(category, update) => (
        <div className="grid-3">
          <TextInput
            label="Category id"
            mono
            value={category.id}
            onChange={(v) => update({ id: v ?? '' })}
            hint="Referenced by projects."
          />
          <TextInput label="Name" value={category.name} onChange={(v) => update({ name: v ?? '' })} />
          <ColorInput label="Color" value={category.color} onChange={(v) => update({ color: v ?? '' })} />
        </div>
      )}
    </ListEditor>
  );
}
