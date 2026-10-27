import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import i18n from './i18n';
import { App } from './app/App';
import { startPersistence } from './storage/session';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Open the last project before the first render so the plan never flashes an empty project.
void startPersistence(i18n.t('app.defaultProjectName')).finally(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
