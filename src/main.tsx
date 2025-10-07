import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { WSProvider } from './components/WSProvider'
import ErrorBoundary from './components/ErrorBoundary'

// In some hosting setups, third-party or legacy code may expect a global React.
// This ensures `React` is available at runtime to prevent 'React is not defined' errors.
try { (window as any).React = (window as any).React || React } catch {}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WSProvider>
        <App />
      </WSProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
