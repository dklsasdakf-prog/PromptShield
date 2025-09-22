import React, { useState } from 'react'
import ComponentLibrarySpec from './components/ComponentLibrarySpec'
import { ThemeProvider, Button } from './components/security-theme'
import SecurityDashboard from './pages/SecurityDashboard'

type Route = 'dashboard' | 'components'

const App: React.FC = () => {
  const [route, setRoute] = useState<Route>('dashboard')

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        <header className="sticky top-0 z-20 border-b border-[hsl(var(--border))] bg-[hsla(var(--background),0.92)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              <span>PromptShield</span>
              <span className="text-[hsl(var(--accent-foreground))]">MVP</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={route === 'dashboard' ? 'primary' : 'outline'}
                onClick={() => setRoute('dashboard')}
              >
                Security Dashboard
              </Button>
              <Button
                size="sm"
                variant={route === 'components' ? 'primary' : 'outline'}
                onClick={() => setRoute('components')}
              >
                Component Library
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl pb-12">
          {route === 'dashboard' ? <SecurityDashboard /> : <ComponentLibrarySpec />}
        </main>
      </div>
    </ThemeProvider>
  )
}

export default App
