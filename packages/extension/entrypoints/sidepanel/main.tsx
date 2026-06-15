import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createChromeAdapter } from '../../src/platform/chrome-adapter';
import { Workbench } from '../../src/ui/Workbench';

const adapter = createChromeAdapter();

const container = document.getElementById('root');
if (!container) {
  throw new Error('sidepanel: #root container not found');
}
createRoot(container).render(
  <StrictMode>
    <Workbench adapter={adapter} />
  </StrictMode>,
);
