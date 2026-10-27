import { useTranslation } from 'react-i18next';
import { selectMainBuilding, useProjectStore } from '@/store/projectStore';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export function Inspector() {
  const { t } = useTranslation();
  const building = useProjectStore(selectMainBuilding);
  const floors = building ? Object.values(building.floors) : [];
  const count = (key: 'walls' | 'rooms') =>
    floors.reduce((sum, floor) => sum + Object.keys(floor[key]).length, 0);

  return (
    <aside
      aria-label={t('inspector.title')}
      className="hidden w-64 flex-col gap-4 border-l bg-background p-4 lg:flex"
    >
      <h2 className="text-sm font-semibold">{t('inspector.title')}</h2>
      <div>
        <p className="text-sm">{t('inspector.nothingSelected')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('inspector.hint')}</p>
      </div>
      <dl className="space-y-1">
        <Stat label={t('inspector.floors')} value={floors.length} />
        <Stat label={t('inspector.walls')} value={count('walls')} />
        <Stat label={t('inspector.rooms')} value={count('rooms')} />
      </dl>
    </aside>
  );
}
