import { TooltipProvider } from '@/components/ui/tooltip';
import { Inspector } from '@/features/inspector/Inspector';
import { ToolRail } from '@/features/toolbar/ToolRail';
import { TopBar } from '@/features/toolbar/TopBar';
import { PlanView } from '@/render2d/PlanView';
import { View3D } from '@/render3d/View3D';
import { useViewStore } from '@/store/viewStore';

export function App() {
  const viewMode = useViewStore((state) => state.viewMode);
  const show2d = viewMode !== '3d';
  const show3d = viewMode !== '2d';

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <ToolRail />
          <main
            className="grid min-w-0 flex-1"
            style={{ gridTemplateColumns: show2d && show3d ? '1fr 1fr' : '1fr' }}
          >
            {show2d && (
              <section className="min-h-0 min-w-0" data-testid="pane-2d">
                <PlanView />
              </section>
            )}
            {show3d && (
              <section className="min-h-0 min-w-0 border-l" data-testid="pane-3d">
                <View3D />
              </section>
            )}
          </main>
          <Inspector />
        </div>
      </div>
    </TooltipProvider>
  );
}
