import { ArrowDownToLine, ArrowUpToLine, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { orderedFloors } from '@/domain/model/project';
import type { Floor } from '@/domain/schema';
import { formatLength } from '@/domain/units/format';
import { parseLength } from '@/domain/units/format';
import { currentLocale } from '@/i18n';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { addFloorAt, deleteFloor, floorLabel, renameFloor, setHeight } from './actions';
import { setFloorsPanelOpen, useFloorsPanel } from './floorsPanelStore';

const commitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur();

function FloorRow({ floor, canDelete }: { floor: Floor; canDelete: boolean }) {
  const { t } = useTranslation();
  const unit = useProjectStore((s) => s.project.settings.displayUnit);
  const active = useViewStore((s) => s.activeFloorId === floor.id);
  const setActiveFloor = useViewStore((s) => s.setActiveFloor);
  const shownHeight = formatLength(floor.height, unit, currentLocale());

  const onName = (e: FocusEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value.trim();
    if (value !== floorLabel(floor)) renameFloor(floor.id, value);
  };
  const onHeight = (e: FocusEvent<HTMLInputElement>) => {
    const mm = parseLength(e.currentTarget.value, unit);
    if (mm === null || mm === floor.height || !setHeight(floor.id, mm)) e.currentTarget.value = shownHeight;
  };

  return (
    <li className="flex items-end gap-2" data-testid="floor-row" data-active={active ? 'true' : undefined}>
      <Button
        variant={active ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={active}
        onClick={() => setActiveFloor(floor.id)}
        data-testid="floor-activate"
      >
        {active ? t('floors.active') : t('floors.show')}
      </Button>
      <div className="grid flex-1 gap-1">
        <Label htmlFor={`floor-name-${floor.id}`} className="text-xs text-muted-foreground">
          {t('floors.name')}
        </Label>
        <Input
          id={`floor-name-${floor.id}`}
          key={`name-${floor.name ?? ''}-${floor.level}`}
          defaultValue={floorLabel(floor)}
          onBlur={onName}
          onKeyDown={commitOnEnter}
          data-testid="floor-name"
        />
      </div>
      <div className="grid w-24 gap-1">
        <Label htmlFor={`floor-height-${floor.id}`} className="text-xs text-muted-foreground">
          {t('floors.height')}
        </Label>
        <Input
          id={`floor-height-${floor.id}`}
          key={`height-${floor.height}-${unit}`}
          defaultValue={shownHeight}
          onBlur={onHeight}
          onKeyDown={commitOnEnter}
          inputMode="decimal"
          data-testid="floor-height"
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        disabled={!canDelete}
        aria-label={t('floors.delete')}
        title={canDelete ? t('floors.delete') : t('floors.lastFloor')}
        onClick={() => void deleteFloor(floor.id)}
        data-testid="floor-delete"
      >
        <Trash2 />
      </Button>
    </li>
  );
}

/** Floor management: list (top to bottom), add above/below, rename, height, delete. */
export function FloorsPanel() {
  const { t } = useTranslation();
  const open = useFloorsPanel((s) => s.open);
  const project = useProjectStore((s) => s.project);
  const [copyWalls, setCopyWalls] = useState(false);
  const floors = orderedFloors(project);
  return (
    <Dialog open={open} onOpenChange={setFloorsPanelOpen}>
      <DialogContent className="sm:max-w-xl" data-testid="floors-panel">
        <DialogHeader>
          <DialogTitle>{t('floors.title')}</DialogTitle>
          <DialogDescription>{t('floors.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => addFloorAt('above', copyWalls)}
            data-testid="floor-add-above"
          >
            <ArrowUpToLine /> {t('floors.addAbove')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addFloorAt('below')}
            data-testid="floor-add-below"
          >
            <ArrowDownToLine /> {t('floors.addBelow')}
          </Button>
          <div className="flex items-center gap-2">
            <Checkbox
              id="floors-copy-walls"
              checked={copyWalls}
              onCheckedChange={(v) => setCopyWalls(v === true)}
              data-testid="floor-copy-walls"
            />
            <Label htmlFor="floors-copy-walls">{t('floors.copyWalls')}</Label>
          </div>
        </div>
        <ul className="grid gap-3">
          {[...floors].reverse().map((floor) => (
            <FloorRow key={floor.id} floor={floor} canDelete={floors.length > 1} />
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
