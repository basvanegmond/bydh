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
      className="absolute left-2 top-2 z-10 flex gap-1 rounded-md border bg-background/90 p-1 text-xs shadow-sm"
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

/** Lazy 3D view with a friendly fallback when WebGL is unavailable. */
export function View3D() {
  const { t } = useTranslation();
  return (
    <div className="relative h-full w-full bg-[#e9eef3]">
      <StackModeControl />
      <ErrorBoundary fallback={<Message text={t('viewer3d.error')} testId="scene-3d-error" />}>
        <Suspense fallback={<Message text={t('viewer3d.loading')} testId="scene-3d-loading" />}>
          <Scene3D />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
