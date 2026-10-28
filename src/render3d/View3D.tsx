import { lazy, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { useViewStore } from '@/store/viewStore';
import { STACK_MODES } from './stack';

const Scene3D = lazy(() => import('./Scene3D'));

function Message({ text, testId }: { text: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground"
    >
      {text}
    </div>
  );
}

/** Chooses which floors of the stack are drawn. */
function StackModeControl() {
  const { t } = useTranslation();
  const mode = useViewStore((s) => s.stackMode);
  const setMode = useViewStore((s) => s.setStackMode);
  return (
    <div
      role="radiogroup"
      aria-label={t('view3d.stackLabel')}
      className="flex gap-1 rounded-md border bg-background/90 p-1 text-xs shadow-sm"
    >
      {STACK_MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          data-testid={`stack-mode-${m}`}
          onClick={() => setMode(m)}
          className={`rounded px-2 py-1 ${mode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
        >
          {t(`view3d.stack.${m}`)}
        </button>
      ))}
    </div>
  );
}

function CameraControls() {
  const { t } = useTranslation();
  const cutaway = useViewStore((s) => s.cutaway);
  const inside = useViewStore((s) => s.insideView);
  const { toggleCutaway, toggleInsideView, resetView } = useViewStore.getState();
  const base = 'rounded px-2 py-1';
  const on = 'bg-primary text-primary-foreground';
  return (
    <div
      role="group"
      aria-label={t('view3d.toolsLabel')}
      className="flex gap-1 rounded-md border bg-background/90 p-1 text-xs shadow-sm"
    >
      <button
        type="button"
        data-testid="cutaway-toggle"
        aria-pressed={cutaway}
        onClick={toggleCutaway}
        className={`${base} ${cutaway ? on : 'hover:bg-muted'}`}
      >
        {t('view3d.cutaway')}
      </button>
      <button
        type="button"
        data-testid="inside-view"
        aria-pressed={inside}
        onClick={toggleInsideView}
        className={`${base} ${inside ? on : 'hover:bg-muted'}`}
      >
        {t('view3d.insideView')}
      </button>
      <button type="button" data-testid="reset-view" onClick={resetView} className={`${base} hover:bg-muted`}>
        {t('view3d.resetView')}
      </button>
    </div>
  );
}

/** Lazy 3D view with a friendly fallback when WebGL is unavailable. */
export function View3D() {
  const { t } = useTranslation();
  return (
    <div className="relative h-full w-full bg-[#e9eef3]">
      <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-2">
        <StackModeControl />
        <CameraControls />
      </div>
      <ErrorBoundary fallback={<Message text={t('viewer3d.error')} testId="scene-3d-error" />}>
        <Suspense fallback={<Message text={t('viewer3d.loading')} testId="scene-3d-loading" />}>
          <Scene3D />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
