import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <div>complift</div>;
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('standalone: #root container not found');
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
