import { lazy, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

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

/** Lazy 3D view with a friendly fallback when WebGL is unavailable. */
export function View3D() {
  const { t } = useTranslation();
  return (
    <div className="h-full w-full bg-[#e9eef3]">
      <ErrorBoundary fallback={<Message text={t('viewer3d.error')} testId="scene-3d-error" />}>
        <Suspense fallback={<Message text={t('viewer3d.loading')} testId="scene-3d-loading" />}>
          <Scene3D />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
