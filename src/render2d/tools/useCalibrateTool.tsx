import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { calibrate } from '@/domain/model/underlay';
import type { Underlay, Vec2 } from '@/domain/schema';
import { parseLength } from '@/domain/units/format';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { planToScreen } from '../viewport';
import { ToolHint } from './ToolHint';
import type { ToolContext, ToolHandlers } from './types';

/** Two-point scale calibration of the selected (or first) background image. */
export function useCalibrateTool(ctx: ToolContext): ToolHandlers {
  const { t } = useTranslation();
  const editFloor = useProjectStore((s) => s.editFloor);
  const selection = useViewStore((s) => s.selection);
  const { setTool, select } = useViewStore.getState();
  const [points, setPoints] = useState<Vec2[]>([]);
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const underlays = Object.values(ctx.floor?.underlays ?? {});
  const selected = selection?.kind === 'underlay' ? ctx.floor?.underlays[selection.id] : undefined;
  const candidate: Underlay | undefined = selected ?? underlays.find((u) => !u.locked);
  // A locked background must not be rescaled.
  const lockedTarget = candidate?.locked === true;
  const target: Underlay | undefined = lockedTarget ? undefined : candidate;
  const reset = () => {
    setPoints([]);
    setValue('');
    setError(false);
  };

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const realMm = parseLength(value, 'cm');
    const [a, b] = points;
    const result = target && a && b && realMm ? calibrate(target, a, b, realMm) : null;
    if (!result || !target) {
      setError(true);
      return;
    }
    editFloor('Calibrate background', ctx.floorId, (f) => {
      const u = f.underlays[target.id];
      if (u && !u.locked) Object.assign(u, result);
    });
    reset();
    select({ kind: 'underlay', id: target.id });
    setTool('select');
  };

  const screens = points.map((p) => planToScreen(ctx.view, p));
  const [first, second] = screens;
  const overlay = (
    <g pointerEvents="none" data-testid="calibrate-overlay">
      {first && second && (
        <line
          x1={first.x}
          y1={first.y}
          x2={second.x}
          y2={second.y}
          stroke="var(--plan-selection)"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      )}
      {screens.map((s, i) => (
        <g key={i}>
          <line x1={s.x - 8} y1={s.y} x2={s.x + 8} y2={s.y} stroke="var(--plan-selection)" strokeWidth={2} />
          <line x1={s.x} y1={s.y - 8} x2={s.x} y2={s.y + 8} stroke="var(--plan-selection)" strokeWidth={2} />
        </g>
      ))}
    </g>
  );

  const hint = !target
    ? t(lockedTarget ? 'calibrate.locked' : 'calibrate.noUnderlay')
    : points.length === 0
      ? t('calibrate.hint')
      : t('calibrate.hintSecond');
  const html = (
    <>
      {points.length < 2 && <ToolHint>{hint}</ToolHint>}
      {points.length === 2 && (
        <form
          onSubmit={apply}
          className="absolute top-3 left-1/2 flex w-80 -translate-x-1/2 flex-col gap-2 rounded-md bg-background p-3 text-sm shadow-lg ring-1 ring-border"
          data-testid="calibrate-form"
        >
          <label htmlFor="calibrate-distance">{t('calibrate.prompt')}</label>
          <Input
            id="calibrate-distance"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error}
          />
          {error && <p className="text-xs text-destructive">{t('calibrate.invalid')}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              {t('calibrate.cancel')}
            </Button>
            <Button type="submit" size="sm">
              {t('calibrate.apply')}
            </Button>
          </div>
        </form>
      )}
    </>
  );

  return {
    onPointerDown: (e, p) => {
      if (e.button !== 0 || !target || points.length >= 2) return;
      setPoints((list) => [...list, p]);
    },
    onPointerMove: () => undefined,
    onPointerUp: () => undefined,
    onKeyDown: (e) => {
      if (e.key !== 'Escape') return false;
      if (points.length > 0) reset();
      else setTool('select');
      return true;
    },
    overlay,
    html,
    cursor: 'crosshair',
  };
}
