import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { mainBuilding } from '@/domain/model/project';
import { stairDimensions } from '@/domain/model/stairs';
import type { Stair } from '@/domain/schema';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { CommitInput, Field, selectClass } from './fields';
import { cmToMm, mmToCm } from './units';

const SHAPES = ['straight', 'quarter-turn', 'half-turn'] as const;
type SupportedShape = (typeof SHAPES)[number];
const isShape = (v: string): v is SupportedShape => (SHAPES as readonly string[]).includes(v);

interface StairInspectorProps {
  stair: Stair;
  /** Floor-to-floor height of the floor the stair starts on, in mm. */
  floorHeight: number;
}

/** Properties of the selected stair: shape, size, step count and the resulting riser and tread. */
export function StairInspector({ stair, floorHeight }: StairInspectorProps) {
  const { t } = useTranslation();
  const select = useViewStore((s) => s.select);
  const update = (label: string, change: (s: Stair) => void) =>
    useProjectStore.getState().edit(label, (draft) => {
      const s = mainBuilding(draft)?.stairs[stair.id];
      if (s) change(s);
    });
  const dims = stairDimensions(stair, floorHeight);
  const decimal = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
  const turns = stair.shape === 'quarter-turn' || stair.shape === 'half-turn';

  return (
    <div className="grid gap-3" data-testid="stair-inspector">
      <h3 className="text-sm font-semibold">{t('stairs.inspector.title')}</h3>
      <Field label={t('stairs.inspector.shape')} htmlFor="stair-shape">
        <select
          id="stair-shape"
          className={selectClass}
          value={isShape(stair.shape) ? stair.shape : 'straight'}
          data-testid="stair-shape"
          onChange={(e) => {
            const next = e.target.value;
            if (isShape(next)) update('Change stair shape', (s) => void (s.shape = next));
          }}
        >
          {SHAPES.map((shape) => (
            <option key={shape} value={shape}>
              {t(`stairs.shape.${shape}`)}
            </option>
          ))}
        </select>
      </Field>
      {turns && (
        <Field label={t('stairs.inspector.turn')} htmlFor="stair-turn">
          <select
            id="stair-turn"
            className={selectClass}
            value={stair.turn ?? 'left'}
            data-testid="stair-turn"
            onChange={(e) => {
              const next = e.target.value;
              if (next === 'left' || next === 'right')
                update('Change stair turn', (s) => void (s.turn = next));
            }}
          >
            <option value="left">{t('stairs.turn.left')}</option>
            <option value="right">{t('stairs.turn.right')}</option>
          </select>
        </Field>
      )}
      <Field label={t('stairs.inspector.width')} htmlFor="stair-width">
        <CommitInput
          key={`${stair.id}-w-${stair.width}`}
          id="stair-width"
          inputMode="decimal"
          value={mmToCm(stair.width)}
          testId="stair-width"
          onCommit={(v) => {
            const mm = cmToMm(v);
            if (mm) update('Change stair width', (s) => void (s.width = mm));
          }}
        />
      </Field>
      <Field label={t('stairs.inspector.runLength')} htmlFor="stair-run">
        <CommitInput
          key={`${stair.id}-r-${stair.runLength}`}
          id="stair-run"
          inputMode="decimal"
          value={mmToCm(stair.runLength)}
          testId="stair-run"
          onCommit={(v) => {
            const mm = cmToMm(v);
            if (mm) update('Change stair length', (s) => void (s.runLength = mm));
          }}
        />
      </Field>
      <Field label={t('stairs.inspector.steps')} htmlFor="stair-steps">
        <CommitInput
          key={`${stair.id}-n-${stair.steps}`}
          id="stair-steps"
          inputMode="decimal"
          value={String(stair.steps)}
          testId="stair-steps"
          onCommit={(v) => {
            const n = Math.round(Number(v.replace(',', '.')));
            if (Number.isFinite(n) && n >= 2 && n <= 60)
              update('Change stair steps', (s) => void (s.steps = n));
          }}
        />
      </Field>
      <Field label={t('stairs.inspector.rotation')} htmlFor="stair-rotation">
        <CommitInput
          key={`${stair.id}-a-${stair.rotationDeg}`}
          id="stair-rotation"
          inputMode="decimal"
          value={decimal(stair.rotationDeg)}
          testId="stair-rotation"
          onCommit={(v) => {
            const deg = Number(v.replace(',', '.'));
            if (Number.isFinite(deg))
              update('Rotate stair', (s) => void (s.rotationDeg = ((deg % 360) + 360) % 360));
          }}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox
          id="stair-cuts-void"
          checked={stair.cutsVoid}
          data-testid="stair-cuts-void"
          onCheckedChange={(v) => update('Change stair opening', (s) => void (s.cutsVoid = v === true))}
        />
        <Label htmlFor="stair-cuts-void" className="text-sm">
          {t('stairs.inspector.cutsVoid')}
        </Label>
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('stairs.inspector.riser')}</dt>
          <dd className="tabular-nums" data-testid="stair-riser">
            {decimal(dims.riser / 10)} cm
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('stairs.inspector.tread')}</dt>
          <dd className="tabular-nums" data-testid="stair-tread">
            {decimal(dims.tread / 10)} cm
          </dd>
        </div>
      </dl>
      {dims.warnings.map((w) => (
        <p key={w} className="text-xs text-destructive" role="alert" data-testid={`stair-warning-${w}`}>
          {t(`stairs.warning.${w}`)}
        </p>
      ))}
      <Button
        variant="destructive"
        size="sm"
        data-testid="delete-stair"
        onClick={() => {
          useProjectStore.getState().edit('Delete stair', (draft) => {
            const b = mainBuilding(draft);
            if (b) delete b.stairs[stair.id];
          });
          select(null);
        }}
      >
        {t('inspector.delete')}
      </Button>
    </div>
  );
}
