import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createChromeAdapter } from '../../src/platform/chrome-adapter';
import { Standalone } from '../../src/ui/Standalone';

const adapter = createChromeAdapter();
const componentId = new URLSearchParams(window.location.search).get('componentId') ?? '';

const container = document.getElementById('root');
if (!container) {
  throw new Error('standalone: #root container not found');
}
createRoot(container).render(
  <StrictMode>
    <Standalone adapter={adapter} componentId={componentId} />
  </StrictMode>,
);
