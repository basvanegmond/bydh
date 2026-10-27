import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { add, almostEqual, distance, normalize, scale, sub } from '@/domain/geometry/vec2';
import { addWall } from '@/domain/model/walls';
import type { Vec2 } from '@/domain/schema';
import { snapPoint } from '@/domain/snapping/snap';
import type { SnapResult } from '@/domain/snapping/snap';
import { formatLength, parseLength } from '@/domain/units/format';
import { currentLocale } from '@/i18n';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { snapTargets } from '../planData';
import { planToScreen } from '../viewport';
import { SnapMarker, ToolHint } from './ToolHint';
import type { ToolContext, ToolHandlers } from './types';

const TYPED_KEY = /^[0-9.,]$/;

/** Click-to-click wall drawing with snapping and typed lengths (cm by default). */
export function useWallTool(ctx: ToolContext): ToolHandlers {
  const { t } = useTranslation();
  const editFloor = useProjectStore((s) => s.editFloor);
  const thickness = useViewStore((s) => s.wallThickness);
  const [chain, setChain] = useState<{ first: Vec2; last: Vec2 } | null>(null);
  const [hover, setHover] = useState<SnapResult | null>(null);
  const [typed, setTyped] = useState('');

  const snap = (raw: Vec2, shift: boolean): SnapResult =>
    snapPoint(raw, {
      ...snapTargets(ctx.floor, [], ctx.ghostFloor),
      gridMm: ctx.gridMm,
      toleranceMm: ctx.toleranceMm,
      ...(chain ? { from: chain.last } : {}),
      ...(shift ? { forceAngleStepDeg: 45 } : {}),
    });

  const commit = (to: Vec2) => {
    setTyped('');
    if (!chain) {
      setChain({ first: to, last: to });
      return;
    }
    editFloor('Draw wall', ctx.floorId, (floor) => {
      addWall(floor, chain.last, to, { thickness, justification: 'center' }, 1);
    });
    // Closing the loop on the first point finishes the chain.
    setChain(
      almostEqual(to, chain.first, 1) && !almostEqual(to, chain.last, 1) ? null : { ...chain, last: to },
    );
  };

  const commitTyped = () => {
    const length = parseLength(typed, 'cm');
    if (!chain || !length || length <= 0) return;
    const towards = hover?.point ?? add(chain.last, { x: 1, y: 0 });
    const dir = distance(towards, chain.last) > 0 ? normalize(sub(towards, chain.last)) : { x: 1, y: 0 };
    commit(add(chain.last, scale(dir, length)));
  };

  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (e.key === 'Escape') {
      if (!chain) return false;
      setChain(null);
      setTyped('');
      return true;
    }
    if (!chain) return false;
    if (TYPED_KEY.test(e.key)) {
      setTyped((value) => value + e.key);
      return true;
    }
    if (e.key === 'Backspace' && typed) {
      setTyped((value) => value.slice(0, -1));
      return true;
    }
    if (e.key === 'Enter' && typed) {
      commitTyped();
      return true;
    }
    return false;
  };

  const locale = currentLocale();
  const preview =
    chain && hover ? { a: planToScreen(ctx.view, chain.last), b: planToScreen(ctx.view, hover.point) } : null;
  const hoverScreen = hover ? planToScreen(ctx.view, hover.point) : null;
  const previewLength = chain && hover ? distance(chain.last, hover.point) : 0;

  const overlay = (
    <g pointerEvents="none" data-testid="wall-tool-overlay">
      {hover?.guides.map((g, i) => {
        const a = planToScreen(ctx.view, g.a);
        const b = planToScreen(ctx.view, g.b);
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="var(--plan-selection)"
            strokeDasharray="4 4"
          />
        );
      })}
      {preview && (
        <>
          <line
            x1={preview.a.x}
            y1={preview.a.y}
            x2={preview.b.x}
            y2={preview.b.y}
            stroke="var(--plan-selection)"
            strokeOpacity={0.45}
            strokeWidth={Math.max(2, thickness * ctx.view.scale)}
          />
          <text
            x={(preview.a.x + preview.b.x) / 2}
            y={(preview.a.y + preview.b.y) / 2 - 10}
            textAnchor="middle"
            className="fill-foreground text-xs font-medium tabular-nums"
            paintOrder="stroke"
            stroke="var(--plan-paper)"
            strokeWidth={4}
            data-testid="wall-preview-length"
          >
            {formatLength(previewLength, 'm', locale)}
          </text>
        </>
      )}
      {hoverScreen && hover && <SnapMarker x={hoverScreen.x} y={hoverScreen.y} kind={hover.kind} />}
    </g>
  );

  const html = (
    <>
      <ToolHint>{t('wallTool.hint')}</ToolHint>
      {typed && hoverScreen && (
        <div
          className="pointer-events-none absolute rounded bg-background px-2 py-1 font-mono text-xs shadow ring-1 ring-border"
          style={{ left: hoverScreen.x + 14, top: hoverScreen.y + 14 }}
          data-testid="typed-length"
        >
          {t('wallTool.typed', { value: `${typed} cm` })}
        </div>
      )}
    </>
  );

  return {
    onPointerDown: (e, p) => {
      if (e.button === 0) commit(snap(p, e.shiftKey).point);
    },
    onPointerMove: (e, p) => setHover(snap(p, e.shiftKey)),
    onPointerUp: () => undefined,
    onDoubleClick: () => setChain(null),
    onKeyDown,
    overlay,
    html,
    cursor: 'crosshair',
  };
}
