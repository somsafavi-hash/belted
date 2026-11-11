import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './data/game';
import { App } from './ui/App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </StrictMode>,
);
