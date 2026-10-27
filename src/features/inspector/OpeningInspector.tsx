import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { placeOpening } from '@/domain/model/openings';
import { findFloor } from '@/domain/model/project';
import type { Floor, Opening } from '@/domain/schema';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { ColorField, CommitInput, Field, selectClass } from './fields';
import { cmToMm, cmToMmOrZero, mmToCm } from './units';

const DOOR_OPERATIONS = ['swing', 'double-swing', 'sliding', 'pocket', 'doorway'] as const;
const WINDOW_OPERATIONS = ['fixed', 'tilt-turn', 'casement', 'sliding', 'top-hung'] as const;
type DoorOperation = (typeof DOOR_OPERATIONS)[number];
type WindowOperation = (typeof WINDOW_OPERATIONS)[number];
const isDoorOperation = (v: string): v is DoorOperation => (DOOR_OPERATIONS as readonly string[]).includes(v);
const isWindowOperation = (v: string): v is WindowOperation =>
  (WINDOW_OPERATIONS as readonly string[]).includes(v);

const DEFAULT_FRAME_COLOR = '#f2f0ea';
const flip = (side: 'left' | 'right'): 'left' | 'right' => (side === 'left' ? 'right' : 'left');

interface OpeningInspectorProps {
  floor: Floor;
  opening: Opening;
}

/** Properties of the selected door or window. Locked host walls make every field read-only. */
export function OpeningInspector({ floor, opening }: OpeningInspectorProps) {
  const { t } = useTranslation();
  const editFloor = useProjectStore((s) => s.editFloor);
  const select = useViewStore((s) => s.select);
  const [error, setError] = useState<string | null>(null);
  const locked = floor.walls[opening.wallId]?.locked === true;
  const { spec } = opening;
  const update = (label: string, change: (o: Opening) => void) =>
    editFloor(label, floor.id, (f) => {
      const o = f.openings[opening.id];
      if (o) change(o);
    });

  const commitWidth = (text: string) => {
    const width = cmToMm(text);
    if (!width) return;
    // Resizing must keep the opening clear of its neighbours and the wall ends.
    const placed = placeOpening(floor, { ...opening, width }, opening.wallId, opening.offset, opening.id);
    setError(placed ? null : t('openings.inspector.doesNotFit'));
    if (placed)
      update('Change opening width', (o) => void ((o.width = placed.width), (o.offset = placed.offset)));
  };

  return (
    <div className="grid gap-3" data-testid="opening-inspector">
      <h3 className="text-sm font-semibold">{t(`openings.inspector.${spec.type}`)}</h3>
      {locked && <p className="text-xs text-muted-foreground">{t('openings.inspector.wallLocked')}</p>}
      <Field label={t('openings.inspector.operation')} htmlFor="opening-operation">
        <select
          id="opening-operation"
          className={selectClass}
          value={spec.operation}
          disabled={locked}
          data-testid="opening-operation"
          onChange={(e) => {
            const next = e.target.value;
            update('Change opening type', (o) => {
              if (o.spec.type === 'door' && isDoorOperation(next)) o.spec.operation = next;
              else if (o.spec.type === 'window' && isWindowOperation(next)) o.spec.operation = next;
            });
          }}
        >
          {(spec.type === 'door' ? DOOR_OPERATIONS : WINDOW_OPERATIONS).map((op) => (
            <option key={op} value={op}>
              {t(`openings.operation.${op}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('openings.inspector.width')} htmlFor="opening-width">
        <CommitInput
          key={`${opening.id}-w-${opening.width}`}
          id="opening-width"
          inputMode="decimal"
          value={mmToCm(opening.width)}
          disabled={locked}
          testId="opening-width"
          onCommit={commitWidth}
        />
        {error && (
          <p className="text-xs text-destructive" role="alert" data-testid="opening-error">
            {error}
          </p>
        )}
      </Field>
      <Field label={t('openings.inspector.height')} htmlFor="opening-height">
        <CommitInput
          key={`${opening.id}-h-${opening.height}`}
          id="opening-height"
          inputMode="decimal"
          value={mmToCm(opening.height)}
          disabled={locked}
          testId="opening-height"
          onCommit={(v) => {
            const mm = cmToMm(v);
            if (mm) update('Change opening height', (o) => void (o.height = mm));
          }}
        />
      </Field>
      <Field label={t('openings.inspector.sill')} htmlFor="opening-sill">
        <CommitInput
          key={`${opening.id}-s-${opening.sillHeight}`}
          id="opening-sill"
          inputMode="decimal"
          value={mmToCm(opening.sillHeight)}
          disabled={locked}
          testId="opening-sill"
          onCommit={(v) => {
            const mm = cmToMmOrZero(v);
            if (mm !== null) update('Change sill height', (o) => void (o.sillHeight = mm));
          }}
        />
      </Field>
      <div className="grid gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={locked}
          data-testid="flip-hinge"
          onClick={() => update('Flip hinge', (o) => void (o.spec.hinge = flip(o.spec.hinge ?? 'left')))}
        >
          {t('openings.inspector.hinge', { side: t(`openings.side.${spec.hinge ?? 'left'}`) })}
        </Button>
        {spec.type === 'door' && (
          <Button
            variant="outline"
            size="sm"
            disabled={locked}
            data-testid="flip-opens-to"
            onClick={() =>
              update('Flip swing', (o) => {
                if (o.spec.type === 'door') o.spec.opensTo = flip(o.spec.opensTo);
              })
            }
          >
            {t('openings.inspector.opensTo', { side: t(`openings.side.${spec.opensTo}`) })}
          </Button>
        )}
      </div>
      <Field label={t('openings.inspector.frameColor')} htmlFor="opening-frame-color">
        <ColorField
          id="opening-frame-color"
          label="Paint frame"
          value={spec.frameColor ?? DEFAULT_FRAME_COLOR}
          onLive={(color) =>
            useProjectStore.getState().edit('Paint frame', (draft) => {
              const o = findFloor(draft, floor.id)?.openings[opening.id];
              if (o) o.spec.frameColor = color;
            })
          }
        />
      </Field>
      <Button
        variant="destructive"
        size="sm"
        disabled={locked}
        data-testid="delete-opening"
        onClick={() => {
          editFloor('Delete opening', floor.id, (f) => {
            delete f.openings[opening.id];
          });
          select(null);
        }}
      >
        {t('inspector.delete')}
      </Button>
    </div>
  );
}
