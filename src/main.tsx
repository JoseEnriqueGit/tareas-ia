import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth';
import App from './App';
import UpdateBanner from './components/UpdateBanner';
import { startUpdateChecks } from './lib/pwaUpdate';
import './styles.css';

startUpdateChecks();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UpdateBanner />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
