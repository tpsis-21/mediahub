import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { warmupApiConnection } from './services/apiClient'

warmupApiConnection()
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) warmupApiConnection()
})
window.addEventListener('online', () => warmupApiConnection())

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('app_error_boundary', error)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Algo deu errado</h1>
          <p className="text-sm text-muted-foreground">
            Recarregue a página e tente novamente.
          </p>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Recarregar
          </button>
        </div>
      </div>
    )
  }
}

const renderFatalBootError = (title: string, detail: string) => {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Arial,sans-serif;background:#0b1020;color:#f8fafc;">
      <div style="max-width:560px;width:100%;background:#111827;border:1px solid #334155;border-radius:12px;padding:20px;">
        <h1 style="margin:0 0 10px 0;font-size:20px;">${title}</h1>
        <p style="margin:0 0 12px 0;font-size:14px;line-height:1.5;color:#cbd5e1;">${detail}</p>
        <button id="mediahub-reload-btn" style="height:36px;padding:0 14px;border-radius:8px;border:1px solid #475569;background:#1d4ed8;color:#fff;cursor:pointer;">
          Recarregar
        </button>
      </div>
    </div>
  `
  const reloadBtn = document.getElementById('mediahub-reload-btn')
  if (reloadBtn) reloadBtn.addEventListener('click', () => window.location.reload())
}

window.addEventListener('error', (event) => {
  console.error('window_error', event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('unhandled_rejection', event.reason)
})

try {
  const root = document.getElementById('root')
  if (!root) {
    renderFatalBootError(
      'Falha ao iniciar a aplicação',
      'Não foi possível localizar o container principal da interface.'
    )
  } else {
    createRoot(root).render(
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    )
  }
} catch (error) {
  console.error('boot_render_error', error)
  renderFatalBootError(
    'Falha ao iniciar a aplicação',
    'Ocorreu um erro durante a inicialização. Recarregue a página e tente novamente.'
  )
}
