import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { bootstrapWeb } from './bootstrap';
import App from './App';

// Bootstrap DI container with web implementations
bootstrapWeb();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
