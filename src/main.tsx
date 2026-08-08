import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { initializeDatabase } from './stores/storage/initializeDatabase';
import './index.css';

// Ponytail: top-level await. Supported by Vite + esbuild for ES2022 (tsconfig target).
// If initializeDatabase throws, the screen stays blank and the error lands in console.
// Loud failure beats silent corruption — Pitfall 2 mitigation.
await initializeDatabase();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
