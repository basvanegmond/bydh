import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { openingMinCeiling } from '@/domain/model/ceilings';
import { DEFAULT_OPENING_FRAME_COLOR, placeOpening } from '@/domain/model/openings';
import { findFloor } from '@/domain/model/project';
import type { Floor, Opening } from '@/domain/schema';
import { useCeilingSlab, useProjectStore } from '@/store/projectStore';
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

const flip = (side: 'left' | 'right'): 'left' | 'right' => (side === 'left' ? 'right' : 'left');

type UpdateOpening = (label: string, change: (o: Opening) => void) => void;

interface PartProps {
  opening: Opening;
  locked: boolean;
  update: UpdateOpening;
}

function OperationField({ opening, locked, update }: PartProps) {
  const { t } = useTranslation();
  const { spec } = opening;
  return (
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
  );
}

interface CmFieldProps {
  id: string;
  label: string;
  mm: number;
  disabled: boolean;
  onCommit: (text: string) => void;
  children?: ReactNode;
}

function CmField({ id, label, mm, disabled, onCommit, children }: CmFieldProps) {
  return (
    <Field label={label} htmlFor={id}>
      <CommitInput
        key={`${id}-${mm}`}
        id={id}
        inputMode="decimal"
        value={mmToCm(mm)}
        disabled={disabled}
        testId={id}
        onCommit={onCommit}
      />
      {children}
    </Field>
  );
}

function SizeFields({ floor, opening, locked, update }: PartProps & { floor: Floor }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
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
    <>
      <CmField
        id="opening-width"
        label={t('openings.inspector.width')}
        mm={opening.width}
        disabled={locked}
        onCommit={commitWidth}
      >
        {error && (
          <p className="text-xs text-destructive" role="alert" data-testid="opening-error">
            {error}
          </p>
        )}
      </CmField>
      <CmField
        id="opening-height"
        label={t('openings.inspector.height')}
        mm={opening.height}
        disabled={locked}
        onCommit={(v) => {
          const mm = cmToMm(v);
          if (mm) update('Change opening height', (o) => void (o.height = mm));
        }}
      />
      <CmField
        id="opening-sill"
        label={t('openings.inspector.sill')}
        mm={opening.sillHeight}
        disabled={locked}
        onCommit={(v) => {
          const mm = cmToMmOrZero(v);
          if (mm !== null) update('Change sill height', (o) => void (o.sillHeight = mm));
        }}
      />
    </>
  );
}

function FlipButtons({ opening, locked, update }: PartProps) {
  const { t } = useTranslation();
  const { spec } = opening;
  return (
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
  );
}

function FrameColorField({ floorId, opening }: { floorId: string; opening: Opening }) {
  const { t } = useTranslation();
  return (
    <Field label={t('openings.inspector.frameColor')} htmlFor="opening-frame-color">
      <ColorField
        id="opening-frame-color"
        label="Paint frame"
        value={opening.spec.frameColor ?? DEFAULT_OPENING_FRAME_COLOR}
        onLive={(color) =>
          useProjectStore.getState().edit('Paint frame', (draft) => {
            const o = findFloor(draft, floorId)?.openings[opening.id];
            if (o) o.spec.frameColor = color;
          })
        }
      />
    </Field>
  );
}

interface OpeningInspectorProps {
  floor: Floor;
  opening: Opening;
}

/** Properties of the selected door or window. Locked host walls make every field read-only. */
export function OpeningInspector({ floor, opening }: OpeningInspectorProps) {
  const { t } = useTranslation();
  const editFloor = useProjectStore((s) => s.editFloor);
  const select = useViewStore((s) => s.select);
  const cs = useCeilingSlab(floor.id);
  const locked = floor.walls[opening.wallId]?.locked === true;
  const ceiling = openingMinCeiling(floor, opening, cs);
  const tooTall = ceiling !== null && opening.sillHeight + opening.height > ceiling;
  const update: UpdateOpening = (label, change) =>
    editFloor(label, floor.id, (f) => {
      const o = f.openings[opening.id];
      if (o) change(o);
    });
  const part = { opening, locked, update };

  return (
    <div className="grid gap-3" data-testid="opening-inspector">
      <h3 className="text-sm font-semibold">{t(`openings.inspector.${opening.spec.type}`)}</h3>
      {tooTall && (
        <p className="text-xs text-destructive" role="alert" data-testid="opening-ceiling-warning">
          {t('ceilings.openingTooTall', { ceiling: mmToCm(ceiling) })}
        </p>
      )}
      {locked && <p className="text-xs text-muted-foreground">{t('openings.inspector.wallLocked')}</p>}
      <OperationField {...part} />
      <SizeFields floor={floor} {...part} />
      <FlipButtons {...part} />
      <FrameColorField floorId={floor.id} opening={opening} />
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
