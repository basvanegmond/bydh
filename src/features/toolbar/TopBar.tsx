import { Box, ChevronDown, Columns2, Languages, Redo2, Square, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { orderedFloors, resolveFloor } from '@/domain/model/project';
import { currentLocale, setLocale } from '@/i18n';
import { canSaveToFile } from '@/storage/fileAccess';
import { openProject, usePersistence } from '@/storage/session';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import type { ViewMode } from '@/store/viewStore';
import { openImportDialog } from '../project/importStore';
import {
  deleteCurrentProject,
  deleteVariant,
  downloadProject,
  duplicateVariant,
  newProject,
  renameProject,
  renameVariant,
  saveProjectToFile,
  switchVariant,
} from '../project/actions';

function ProjectMenu() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const projects = usePersistence((s) => s.projects);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('project.menu')} data-testid="project-menu">
          <span className="max-w-40 truncate" data-testid="project-name">
            {project.name}
          </span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={() => void newProject()}>{t('project.new')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void renameProject()}>{t('project.rename')}</DropdownMenuItem>
        {projects.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('project.open')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={project.id} onValueChange={(id) => void openProject(id)}>
              {projects.map((p) => (
                <DropdownMenuRadioItem key={p.id} value={p.id}>
                  {p.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void downloadProject()} data-testid="export-json">
          {t('project.export')}
        </DropdownMenuItem>
        {canSaveToFile() && (
          <DropdownMenuItem onSelect={() => void saveProjectToFile()}>
            {t('project.saveToFile')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={openImportDialog} data-testid="import-json">
          {t('project.import')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void deleteCurrentProject()}>
          {t('project.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VariantMenu() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const variant = project.variants[project.activeVariantId];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('variant.menu')} data-testid="variant-menu">
          <span className="max-w-40 truncate text-muted-foreground" data-testid="variant-name">
            {variant?.name}
          </span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t('variant.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={project.activeVariantId} onValueChange={switchVariant}>
          {project.variantOrder.map((id) => (
            <DropdownMenuRadioItem key={id} value={id} data-testid="variant-option">
              {project.variants[id]?.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={duplicateVariant}>{t('variant.duplicate')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void renameVariant()}>{t('variant.rename')}</DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={project.variantOrder.length < 2}
          onSelect={() => void deleteVariant()}
        >
          {t('variant.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FloorSwitcher() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const activeFloorId = useViewStore((s) => s.activeFloorId);
  const setActiveFloor = useViewStore((s) => s.setActiveFloor);
  const floors = orderedFloors(project);
  const current = resolveFloor(project, activeFloorId);
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

function SaveStatus() {
  const { t } = useTranslation();
  const { status, error, durable } = usePersistence();
  const text = !durable
    ? t('save.notDurable')
    : status === 'saving'
      ? t('save.saving')
      : status === 'error'
        ? t('save.error', { error })
        : status === 'saved'
          ? t('save.saved')
          : '';
  return (
    <span
      className={`hidden text-xs md:inline ${status === 'error' || !durable ? 'text-destructive' : 'text-muted-foreground'}`}
      data-testid="save-status"
      data-status={status}
      aria-live="polite"
    >
      {text}
    </span>
  );
}

export function TopBar() {
  const { t } = useTranslation();
  const viewMode = useViewStore((s) => s.viewMode);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const canUndo = useProjectStore((s) => s.history.past.length > 0 || s.transaction !== null);
  const canRedo = useProjectStore((s) => s.history.future.length > 0);
  const { undo, redo } = useProjectStore.getState();
  const locale = currentLocale();

  return (
    <header className="flex h-12 items-center gap-2 border-b bg-background px-3">
      <span className="font-semibold tracking-tight" title={t('app.title')}>
        {t('app.name')}
      </span>
      <Separator orientation="vertical" className="h-6" />
      <ProjectMenu />
      <span className="text-muted-foreground">/</span>
      <VariantMenu />
      <FloorSwitcher />
      <div className="ml-1 flex items-center">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('history.undo')}
          title={t('history.undo')}
          disabled={!canUndo}
          onClick={undo}
          data-testid="undo"
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('history.redo')}
          title={t('history.redo')}
          disabled={!canRedo}
          onClick={redo}
          data-testid="redo"
        >
          <Redo2 />
        </Button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <SaveStatus />
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
