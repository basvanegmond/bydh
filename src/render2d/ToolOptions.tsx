import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useViewStore, WALL_THICKNESSES } from '@/store/viewStore';

/** Options for the active tool, shown at the bottom of the plan. */
export function ToolOptions() {
  const { t } = useTranslation();
  const tool = useViewStore((s) => s.tool);
  const thickness = useViewStore((s) => s.wallThickness);
  const setThickness = useViewStore((s) => s.setWallThickness);
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
