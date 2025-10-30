import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import ResetPassword from './components/ResetPassword'
import { WSProvider } from './components/WSProvider'
import ErrorBoundary from './components/ErrorBoundary'
import { installApiInterceptor } from './utils/api'

// In some hosting setups, third-party or legacy code may expect a global React.
// This ensures `React` is available at runtime to prevent 'React is not defined' errors.
try { (window as any).React = (window as any).React || {} } catch {}

installApiInterceptor()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <WSProvider>
        <Root />
      </WSProvider>
    </ErrorBoundary>
  </StrictMode>,
)

function Root() {
  const path = window.location.pathname
  if (path === '/reset') return <ResetPassword />
  return <App />
}

