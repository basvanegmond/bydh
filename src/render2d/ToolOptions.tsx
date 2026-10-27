import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CommitInput, Field } from '@/features/inspector/fields';
import { cmToMm, cmToMmOrZero, mmToCm } from '@/features/inspector/units';
import { useViewStore, WALL_THICKNESSES } from '@/store/viewStore';
import type { OpeningSize } from '@/store/viewStore';

/** Options for the active tool, shown at the bottom of the plan. */
export function ToolOptions() {
  const { t } = useTranslation();
  const tool = useViewStore((s) => s.tool);
  const thickness = useViewStore((s) => s.wallThickness);
  const setThickness = useViewStore((s) => s.setWallThickness);
  if (tool === 'door' || tool === 'window') return <OpeningOptions kind={tool} />;
  if (tool !== 'wall') return null;
  return (
    <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md bg-background/95 px-2 py-1 text-xs shadow ring-1 ring-border">
      <span className="text-muted-foreground">{t('wallTool.thickness')}</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={String(thickness)}
        onValueChange={(value) => value && setThickness(Number(value))}
        aria-label={t('wallTool.thickness')}
      >
        {WALL_THICKNESSES.map((mm) => (
          <ToggleGroupItem
            key={mm}
            value={String(mm)}
            data-testid={`thickness-${mm}`}
            className="px-2 tabular-nums"
          >
            {mm / 10} cm
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

const SIZE_FIELDS: { key: keyof OpeningSize; label: string; parse: (v: string) => number | null }[] = [
  { key: 'width', label: 'width', parse: cmToMm },
  { key: 'height', label: 'height', parse: cmToMm },
  { key: 'sillHeight', label: 'sill', parse: cmToMmOrZero },
];

/** Default size for the next door or window; stored per viewer, not in the project. */
function OpeningOptions({ kind }: { kind: 'door' | 'window' }) {
  const { t } = useTranslation();
  const size = useViewStore((s) => s.openingDefaults[kind]);
  const setDefault = useViewStore((s) => s.setOpeningDefault);
  return (
    <div
      className="absolute bottom-12 left-1/2 flex -translate-x-1/2 items-end gap-2 rounded-md bg-background/95 px-2 py-1 text-xs shadow ring-1 ring-border"
      data-testid="opening-options"
    >
      <span className="self-center font-medium">{t(`openings.defaults.${kind}`)}</span>
      {SIZE_FIELDS.map(({ key, label, parse }) => (
        <div key={key} className="w-24">
          <Field label={t(`openings.defaults.${label}`)} htmlFor={`default-${kind}-${key}`}>
            <CommitInput
              key={`${kind}-${key}-${size[key]}`}
              id={`default-${kind}-${key}`}
              inputMode="decimal"
              value={mmToCm(size[key])}
              testId={`default-${kind}-${key}`}
              onCommit={(v) => {
                const mm = parse(v);
                if (mm !== null) setDefault(kind, { [key]: mm });
              }}
            />
          </Field>
        </div>
      ))}
    </div>
  );
}
