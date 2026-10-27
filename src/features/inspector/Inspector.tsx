import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { DEFAULT_WALL_COLOR, FLOOR_MATERIALS, findMaterial, floorFinishFor } from '@/data/materials';
import { usableArea } from '@/domain/model/ceilings';
import { findFloor, mainBuilding, resolveFloor } from '@/domain/model/project';
import { floorGeometry } from '@/domain/model/floorGeometry';
import { deleteWall, setWallLength, wallLength, wallsAtNode } from '@/domain/model/walls';
import type { Floor, Room, Underlay, Wall } from '@/domain/schema';
import { formatArea, formatLength } from '@/domain/units/format';
import { currentLocale } from '@/i18n';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { ColorField, CommitInput, Field, selectClass } from './fields';
import { RoofFromWallsButton } from '../ceilings/RoofFromWallsButton';
import { CeilingPlaneInspector } from './CeilingPlaneInspector';
import { OpeningInspector } from './OpeningInspector';
import { StairInspector } from './StairInspector';
import { cmToMm, mmToCm } from './units';

/** Minimum ceiling height (mm) that counts as usable floor area. */
const USABLE_HEADROOM_MM = 1800;

const JUSTIFICATIONS = ['center', 'left', 'right'] as const;
const isJustification = (value: string): value is Wall['justification'] =>
  (JUSTIFICATIONS as readonly string[]).includes(value);

function LockToggle({
  id,
  locked,
  onChange,
}: {
  id: string;
  locked: boolean;
  onChange: (locked: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={locked}
        onCheckedChange={(v) => onChange(v === true)}
        data-testid="lock-toggle"
      />
      <Label htmlFor={id} className="text-sm">
        {t('inspector.locked')}
      </Label>
    </div>
  );
}

function WallInspector({ floor, wall }: { floor: Floor; wall: Wall }) {
  const { t } = useTranslation();
  const editFloor = useProjectStore((s) => s.editFloor);
  const select = useViewStore((s) => s.select);
  const update = (label: string, change: (w: Wall, f: Floor) => void) =>
    editFloor(label, floor.id, (f) => {
      const w = f.walls[wall.id];
      if (w) change(w, f);
    });
  const length = wallLength(floor, wall);
  // Changing the length moves the end node, which would also move locked walls sharing it.
  const locked = wall.locked === true;
  const lengthLocked = locked || wallsAtNode(floor, wall.endNodeId).some((w) => w.locked);
  const sideColor = (side: 'left' | 'right') => wall.sides[side].color ?? DEFAULT_WALL_COLOR;

  return (
    <div className="grid gap-3" data-testid="wall-inspector">
      <h3 className="text-sm font-semibold">{t('inspector.wall.title')}</h3>
      <Field label={t('inspector.wall.length')} htmlFor="wall-length">
        <CommitInput
          key={`${wall.id}-${length}`}
          id="wall-length"
          inputMode="decimal"
          value={mmToCm(length)}
          disabled={lengthLocked}
          testId="wall-length"
          onCommit={(v) => {
            const mm = cmToMm(v);
            if (mm) editFloor('Change wall length', floor.id, (f) => setWallLength(f, wall.id, mm));
          }}
        />
      </Field>
      <Field label={t('inspector.wall.thickness')} htmlFor="wall-thickness">
        <CommitInput
          key={`${wall.id}-${wall.thickness}`}
          id="wall-thickness"
          inputMode="decimal"
          value={mmToCm(wall.thickness)}
          disabled={locked}
          testId="wall-thickness"
          onCommit={(v) => {
            const mm = cmToMm(v);
            if (mm) update('Change wall thickness', (w) => void (w.thickness = mm));
          }}
        />
      </Field>
      <Field label={t('inspector.wall.height')} htmlFor="wall-height">
        <CommitInput
          key={`${wall.id}-${wall.height ?? 'auto'}`}
          id="wall-height"
          inputMode="decimal"
          value={wall.height ? mmToCm(wall.height) : ''}
          placeholder={mmToCm(floor.height)}
          disabled={locked}
          onCommit={(v) => {
            const mm = cmToMm(v);
            update('Change wall height', (w) => {
              if (mm) w.height = mm;
              else delete w.height;
            });
          }}
        />
      </Field>
      <Field label={t('inspector.wall.justification')} htmlFor="wall-justification">
        <select
          id="wall-justification"
          className={selectClass}
          value={wall.justification}
          disabled={locked}
          onChange={(e) => {
            const next = e.target.value;
            update('Change wall position', (w) => {
              if (isJustification(next)) w.justification = next;
            });
          }}
        >
          {JUSTIFICATIONS.map((j) => (
            <option key={j} value={j}>
              {t(`inspector.wall.${j}`)}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {(['left', 'right'] as const).map((side) => (
          <Field key={side} label={t(`inspector.wall.${side}Side`)} htmlFor={`wall-${side}-color`}>
            <ColorField
              id={`wall-${side}-color`}
              value={sideColor(side)}
              onLive={(color) =>
                useProjectStore.getState().edit('Paint wall', (draft) => {
                  const w = findFloor(draft, floor.id)?.walls[wall.id];
                  if (w) w.sides[side].color = color;
                })
              }
            />
          </Field>
        ))}
      </div>
      <LockToggle
        id="wall-locked"
        locked={locked}
        onChange={(v) => update(v ? 'Lock wall' : 'Unlock wall', (w) => void (w.locked = v))}
      />
      <Button
        variant="destructive"
        size="sm"
        disabled={locked}
        data-testid="delete-wall"
        onClick={() => {
          editFloor('Delete wall', floor.id, (f) => deleteWall(f, wall.id));
          select(null);
        }}
      >
        {t('inspector.delete')}
      </Button>
    </div>
  );
}

function RoomInspector({ floor, room }: { floor: Floor; room: Room }) {
  const { t } = useTranslation();
  const editFloor = useProjectStore((s) => s.editFloor);
  const project = useProjectStore((s) => s.project);
  const geometry = floorGeometry(floor).rooms[room.id];
  const area = geometry?.area ?? 0;
  const hasPlanes = Object.keys(floor.ceilingPlanes).length > 0;
  const usable = geometry && hasPlanes ? usableArea(geometry.polygon, floor, USABLE_HEADROOM_MM) : null;
  const update = (label: string, change: (r: Room) => void) =>
    editFloor(label, floor.id, (f) => {
      const r = f.rooms[room.id];
      if (r) change(r);
    });
  const material = findMaterial(project, room.floorFinish.materialId);

  return (
    <div className="grid gap-3" data-testid="room-inspector">
      <h3 className="text-sm font-semibold">{t('inspector.room.title')}</h3>
      <Field label={t('inspector.room.name')} htmlFor="room-name">
        <CommitInput
          key={`${room.id}-${room.name}`}
          id="room-name"
          value={room.name}
          placeholder={t('room.unnamed')}
          testId="room-name-input"
          onCommit={(v) => update('Rename room', (r) => void (r.name = v.trim()))}
        />
      </Field>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{t('inspector.room.area')}</span>
        <span className="tabular-nums" data-testid="room-area-value">
          {formatArea(area, currentLocale())}
        </span>
      </div>
      {usable !== null && (
        <div className="flex justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{t('ceilings.usableArea')}</span>
          <span className="tabular-nums" data-testid="room-usable-area-value">
            {formatArea(usable, currentLocale())}
          </span>
        </div>
      )}
      <Field label={t('inspector.room.floorMaterial')} htmlFor="room-floor">
        <div className="flex items-center gap-2">
          <span className="size-6 shrink-0 rounded border" style={{ background: material?.color }} />
          <select
            id="room-floor"
            className={selectClass}
            value={room.floorFinish.materialId}
            data-testid="room-floor-select"
            onChange={(e) => {
              const next = FLOOR_MATERIALS.find((m) => m.id === e.target.value);
              if (next) update('Change floor', (r) => void (r.floorFinish = floorFinishFor(next)));
            }}
          >
            {FLOOR_MATERIALS.map((m) => (
              <option key={m.id} value={m.id}>
                {t(`materials.${m.id}`, { defaultValue: m.name })}
              </option>
            ))}
          </select>
        </div>
      </Field>
    </div>
  );
}

function UnderlayInspector({ floor, underlay }: { floor: Floor; underlay: Underlay }) {
  const { t } = useTranslation();
  const editFloor = useProjectStore((s) => s.editFloor);
  const { select, setTool } = useViewStore.getState();
  const update = (label: string, change: (u: Underlay) => void) =>
    editFloor(label, floor.id, (f) => {
      const u = f.underlays[underlay.id];
      if (u) change(u);
    });
  const locked = underlay.locked === true;
  return (
    <div className="grid gap-3" data-testid="underlay-inspector">
      <h3 className="text-sm font-semibold">{t('inspector.underlay.title')}</h3>
      <p className="truncate text-xs text-muted-foreground" title={underlay.name}>
        {underlay.name}
      </p>
      <p className="text-xs" data-testid="underlay-scale">
        {t('inspector.underlay.scale', { value: formatLength(underlay.mmPerPx, 'cm', currentLocale()) })}
      </p>
      <Field label={t('inspector.underlay.opacity')} htmlFor="underlay-opacity">
        <Slider
          id="underlay-opacity"
          min={0.1}
          max={1}
          step={0.05}
          value={[underlay.opacity]}
          disabled={locked}
          onValueChange={([v]) => {
            if (v === undefined) return;
            // One undo step per slider drag.
            if (!useProjectStore.getState().transaction)
              useProjectStore.getState().beginTransaction('Change opacity');
            update('Change opacity', (u) => void (u.opacity = v));
          }}
          onValueCommit={() => useProjectStore.getState().commitTransaction()}
        />
      </Field>
      <Field label={t('inspector.underlay.rotation')} htmlFor="underlay-rotation">
        <CommitInput
          key={`${underlay.id}-${underlay.rotationDeg}`}
          id="underlay-rotation"
          inputMode="decimal"
          value={String(underlay.rotationDeg).replace('.', ',')}
          disabled={locked}
          onCommit={(v) => {
            const deg = Number(v.replace(',', '.'));
            if (Number.isFinite(deg)) update('Rotate background', (u) => void (u.rotationDeg = deg));
          }}
        />
      </Field>
      <Button variant="outline" size="sm" disabled={locked} onClick={() => setTool('calibrate')}>
        {t('inspector.underlay.calibrate')}
      </Button>
      <LockToggle
        id="underlay-locked"
        locked={locked}
        onChange={(v) => update(v ? 'Lock background' : 'Unlock background', (u) => void (u.locked = v))}
      />
      <Button
        variant="destructive"
        size="sm"
        disabled={locked}
        onClick={() => {
          editFloor('Delete background', floor.id, (f) => {
            delete f.underlays[underlay.id];
          });
          select(null);
        }}
      >
        {t('inspector.delete')}
      </Button>
    </div>
  );
}

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
  const project = useProjectStore((s) => s.project);
  const activeFloorId = useViewStore((s) => s.activeFloorId);
  const selection = useViewStore((s) => s.selection);
  const floor = resolveFloor(project, activeFloorId);

  const wall = selection?.kind === 'wall' ? floor?.walls[selection.id] : undefined;
  const room = selection?.kind === 'room' ? floor?.rooms[selection.id] : undefined;
  const underlay = selection?.kind === 'underlay' ? floor?.underlays[selection.id] : undefined;
  const opening = selection?.kind === 'opening' ? floor?.openings[selection.id] : undefined;
  const plane = selection?.kind === 'ceilingPlane' ? floor?.ceilingPlanes[selection.id] : undefined;
  const stair = selection?.kind === 'stair' ? mainBuilding(project)?.stairs[selection.id] : undefined;
  const stairFloor = stair ? findFloor(project, stair.fromFloorId) : undefined;

  return (
    <aside
      aria-label={t('inspector.title')}
      className="hidden w-64 flex-col gap-4 overflow-y-auto border-l bg-background p-4 lg:flex"
    >
      <h2 className="text-sm font-semibold">{t('inspector.title')}</h2>
      {floor && wall && <WallInspector key={wall.id} floor={floor} wall={wall} />}
      {floor && room && <RoomInspector key={room.id} floor={floor} room={room} />}
      {floor && underlay && <UnderlayInspector key={underlay.id} floor={floor} underlay={underlay} />}
      {floor && opening && <OpeningInspector key={opening.id} floor={floor} opening={opening} />}
      {floor && plane && <CeilingPlaneInspector key={plane.id} floor={floor} plane={plane} />}
      {stair && stairFloor && <StairInspector key={stair.id} stair={stair} floorHeight={stairFloor.height} />}
      {!wall && !room && !underlay && !opening && !stair && !plane && (
        <>
          <div>
            <p className="text-sm">{t('inspector.nothingSelected')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('inspector.hint')}</p>
          </div>
          <dl className="space-y-1">
            <Stat label={t('inspector.walls')} value={Object.keys(floor?.walls ?? {}).length} />
            <Stat label={t('inspector.rooms')} value={Object.keys(floor?.rooms ?? {}).length} />
          </dl>
          {floor && <RoofFromWallsButton />}
        </>
      )}
    </aside>
  );
}
