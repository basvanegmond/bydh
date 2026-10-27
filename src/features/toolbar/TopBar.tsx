import { Box, Columns2, Languages, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { currentLocale, setLocale } from '@/i18n';
import { selectActiveVariant, selectMainBuilding, useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import type { ViewMode } from '@/store/viewStore';

function FloorSwitcher() {
  const { t } = useTranslation();
  const building = useProjectStore(selectMainBuilding);
  const activeFloorId = useViewStore((state) => state.activeFloorId);
  const setActiveFloor = useViewStore((state) => state.setActiveFloor);
  if (!building) return null;
  const floors = building.floorOrder.flatMap((floorId) => building.floors[floorId] ?? []);
  const current = floors.find((floor) => floor.id === activeFloorId) ?? floors[0];
  const label = (floor: (typeof floors)[number]) => floor.name ?? t(`floor.level.${floor.level}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t('floor.label')} data-testid="floor-switcher">
          {current ? label(current) : t('floor.label')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {[...floors].reverse().map((floor) => (
          <DropdownMenuItem key={floor.id} onSelect={() => setActiveFloor(floor.id)}>
            {label(floor)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar() {
  const { t } = useTranslation();
  const projectName = useProjectStore((state) => state.project.name);
  const variantName = useProjectStore((state) => selectActiveVariant(state)?.name);
  const viewMode = useViewStore((state) => state.viewMode);
  const setViewMode = useViewStore((state) => state.setViewMode);
  const locale = currentLocale();

  return (
    <header className="flex h-12 items-center gap-3 border-b bg-background px-3">
      <span className="font-semibold tracking-tight" title={t('app.title')}>
        {t('app.name')}
      </span>
      <Separator orientation="vertical" className="h-6" />
      <span className="truncate text-sm" data-testid="project-name">
        {projectName}
        <span className="text-muted-foreground"> / {variantName}</span>
      </span>
      <FloorSwitcher />
      <div className="ml-auto flex items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={viewMode}
          onValueChange={(value) => value && setViewMode(value as ViewMode)}
          aria-label={t('view.label')}
        >
          <ToggleGroupItem value="2d" aria-label={t('view.2d')} data-testid="view-2d">
            <Square /> 2D
          </ToggleGroupItem>
          <ToggleGroupItem value="split" aria-label={t('view.split')} data-testid="view-split">
            <Columns2 />
          </ToggleGroupItem>
          <ToggleGroupItem value="3d" aria-label={t('view.3d')} data-testid="view-3d">
            <Box /> 3D
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="ghost"
          size="sm"
          data-testid="language-toggle"
          aria-label={t('language.label')}
          onClick={() => setLocale(locale === 'nl' ? 'en' : 'nl')}
        >
          <Languages /> {locale === 'nl' ? 'NL' : 'EN'}
        </Button>
      </div>
    </header>
  );
}
