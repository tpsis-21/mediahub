import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { warmupApiConnection } from './services/apiClient'

warmupApiConnection()
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) warmupApiConnection()
})
window.addEventListener('online', () => warmupApiConnection())

createRoot(document.getElementById("root")!).render(<App />);
