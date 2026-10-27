import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import './index.css';
import i18n from './i18n';
import { App } from './app/App';
import { CrashFallback } from './app/CrashFallback';
import { ExternalChangeBanner } from './app/ExternalChangeBanner';
import { startPersistence } from './storage/session';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Open the last project before the first render so the plan never flashes an empty project.
void startPersistence(i18n.t('app.defaultProjectName'), {
  variant: i18n.t('app.defaultVariantName'),
  building: i18n.t('app.defaultBuildingName'),
}).finally(() => {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary FallbackComponent={CrashFallback}>
        <App />
        <ExternalChangeBanner />
      </ErrorBoundary>
    </StrictMode>,
  );
});
