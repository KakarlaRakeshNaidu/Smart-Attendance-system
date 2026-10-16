import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';
import { ThemeRuntime } from './components/common/ThemeControl';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeRuntime><BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster position="top-right" toastOptions={{ style: { background: 'rgb(var(--surface))', color: 'rgb(var(--text))', border: '1px solid rgb(var(--border))' } }} />
      </AuthProvider>
    </BrowserRouter></ThemeRuntime>
  </React.StrictMode>
);
