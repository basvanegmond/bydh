import { useEffect } from 'react';
import { Hand, MousePointer2, PenLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useViewStore } from '@/store/viewStore';
import type { Tool } from '@/store/viewStore';

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

const SHORTCUTS: Record<string, Tool> = { v: 'select', h: 'pan' };

export function ToolRail() {
  const { t } = useTranslation();
  const tool = useViewStore((state) => state.tool);
  const setTool = useViewStore((state) => state.setTool);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
      const next = SHORTCUTS[e.key.toLowerCase()];
      if (next) setTool(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool]);

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
        label={t('tools.comingSoon', { tool: t('tools.wall'), phase: 1 })}
        disabled
        testId="tool-wall"
      />
    </nav>
  );
}
