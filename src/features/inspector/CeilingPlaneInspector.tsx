import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { distanceToFlatCeiling } from '@/domain/model/ceilingTools';
import type { CeilingPlane, Floor } from '@/domain/schema';
import { formatLength } from '@/domain/units/format';
import { parseSlope } from '@/features/ceilings/slope';
import { currentLocale } from '@/i18n';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { CommitInput, Field } from './fields';
import { cmToMmOrZero, mmToCm } from './units';

/** Properties of the selected ceiling plane, plus two derived figures. */
export function CeilingPlaneInspector({ floor, plane }: { floor: Floor; plane: CeilingPlane }) {
  const { t } = useTranslation();
  const editFloor = useProjectStore((s) => s.editFloor);
  const select = useViewStore((s) => s.select);
  const locale = currentLocale();
  const update = (label: string, change: (p: CeilingPlane) => void) =>
    editFloor(label, floor.id, (f) => {
      const p = f.ceilingPlanes[plane.id];
      if (p) change(p);
    });
  const reach = distanceToFlatCeiling(plane, floor);

  return (
    <div className="grid gap-3" data-testid="ceiling-plane-inspector">
      <h3 className="text-sm font-semibold">{t('ceilings.inspector.title')}</h3>
      <Field label={t('ceilings.kneeHeight')} htmlFor="plane-knee">
        <CommitInput
          key={`${plane.id}-k-${plane.kneeHeight}`}
          id="plane-knee"
          inputMode="decimal"
          value={mmToCm(plane.kneeHeight)}
          testId="plane-knee"
          onCommit={(v) => {
            const mm = cmToMmOrZero(v);
            if (mm !== null) update('Change knee height', (p) => void (p.kneeHeight = mm));
          }}
        />
      </Field>
      <Field label={t('ceilings.slope')} htmlFor="plane-slope">
        <CommitInput
          key={`${plane.id}-s-${plane.slopeDeg}`}
          id="plane-slope"
          inputMode="decimal"
          value={String(plane.slopeDeg).replace('.', ',')}
          testId="plane-slope"
          onCommit={(v) => {
            const deg = parseSlope(v);
            if (deg !== null) update('Change slope', (p) => void (p.slopeDeg = deg));
          }}
        />
      </Field>
      <Button
        variant="outline"
        size="sm"
        data-testid="plane-flip"
        onClick={() =>
          update(
            'Flip rising side',
            (p) => void (p.risesToward = p.risesToward === 'left' ? 'right' : 'left'),
          )
        }
      >
        {t('ceilings.inspector.rises', { side: t(`openings.side.${plane.risesToward}`) })}
      </Button>
      <dl className="grid gap-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('ceilings.inspector.eaveHeight')}</dt>
          <dd className="tabular-nums" data-testid="plane-eave-height">
            {formatLength(plane.kneeHeight, 'cm', locale)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{t('ceilings.inspector.reach')}</dt>
          <dd className="tabular-nums" data-testid="plane-reach">
            {reach === null ? t('ceilings.inspector.noReach') : formatLength(reach, 'cm', locale)}
          </dd>
        </div>
      </dl>
      <Button
        variant="destructive"
        size="sm"
        data-testid="delete-ceiling-plane"
        onClick={() => {
          editFloor('Delete ceiling plane', floor.id, (f) => {
            delete f.ceilingPlanes[plane.id];
          });
          select(null);
        }}
      >
        {t('inspector.delete')}
      </Button>
    </div>
  );
}
