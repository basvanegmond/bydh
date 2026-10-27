import { useEffect, useRef } from 'react';
import { Crosshair, Hand, ImagePlus, MousePointer2, PenLine, Ruler } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { resolveFloor } from '@/domain/model/project';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import type { Tool } from '@/store/viewStore';
import { importUnderlay } from '../underlay/importUnderlay';

interface ToolButtonProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  testId: string;
}

function ToolButton({ icon: Icon, label, active, disabled, onClick, testId }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span keeps the tooltip working on disabled buttons */}
        <span>
          <Button
            variant={active ? 'default' : 'ghost'}
            size="icon"
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            data-testid={testId}
          >
            <Icon />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

const SHORTCUTS: Record<string, Tool> = { v: 'select', h: 'pan', w: 'wall', c: 'calibrate' };

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function ToolRail() {
  const { t } = useTranslation();
  const tool = useViewStore((s) => s.tool);
  const setTool = useViewStore((s) => s.setTool);
  const showDimensions = useViewStore((s) => s.showDimensions);
  const toggleDimensions = useViewStore((s) => s.toggleDimensions);
  const activeFloorId = useViewStore((s) => s.activeFloorId);
  const hasUnderlay = useProjectStore((s) =>
    Object.values(resolveFloor(s.project, activeFloorId)?.underlays ?? {}).some((u) => !u.locked),
  );
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const next = SHORTCUTS[e.key.toLowerCase()];
      if (!next) return;
      // Switching tools mid-drag would leave the drag's transaction open.
      if (useProjectStore.getState().transaction) return;
      const { project } = useProjectStore.getState();
      const floor = resolveFloor(project, useViewStore.getState().activeFloorId);
      if (next === 'calibrate' && !Object.values(floor?.underlays ?? {}).some((u) => !u.locked)) return;
      setTool(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const floor = resolveFloor(useProjectStore.getState().project, activeFloorId);
    // Centre on the walls if there are any, else on the origin.
    const nodes = Object.values(floor?.wallNodes ?? {}).map((n) => n.position);
    const center = nodes.length
      ? {
          x: nodes.reduce((s, p) => s + p.x, 0) / nodes.length,
          y: nodes.reduce((s, p) => s + p.y, 0) / nodes.length,
        }
      : { x: 0, y: 0 };
    await importUnderlay(file, floor?.id ?? null, center);
    setTool('calibrate');
  };

  return (
    <nav
      aria-label={t('tools.label')}
      className="flex w-12 flex-col items-center gap-1 border-r bg-background py-2"
    >
      <ToolButton
        icon={MousePointer2}
        label={t('tools.select')}
        active={tool === 'select'}
        onClick={() => setTool('select')}
        testId="tool-select"
      />
      <ToolButton
        icon={Hand}
        label={t('tools.pan')}
        active={tool === 'pan'}
        onClick={() => setTool('pan')}
        testId="tool-pan"
      />
      <ToolButton
        icon={PenLine}
        label={t('tools.wall')}
        active={tool === 'wall'}
        onClick={() => setTool('wall')}
        testId="tool-wall"
      />
      <Separator className="my-1 w-8" />
      <ToolButton
        icon={ImagePlus}
        label={t('tools.importUnderlay')}
        onClick={() => fileInput.current?.click()}
        testId="tool-import-underlay"
      />
      <ToolButton
        icon={Crosshair}
        label={t('tools.calibrate')}
        active={tool === 'calibrate'}
        disabled={!hasUnderlay}
        onClick={() => setTool('calibrate')}
        testId="tool-calibrate"
      />
      <Separator className="my-1 w-8" />
      <ToolButton
        icon={Ruler}
        label={t('view.dimensions')}
        active={showDimensions}
        onClick={toggleDimensions}
        testId="toggle-dimensions"
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        data-testid="underlay-file"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </nav>
  );
}
