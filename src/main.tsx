import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { WSProvider } from './components/WSProvider'
import ErrorBoundary from './components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WSProvider>
        <App />
      </WSProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
