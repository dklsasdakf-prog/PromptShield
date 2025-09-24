import React, { useState } from 'react'
import { Toaster } from 'sonner'
import ComponentLibrarySpec from './components/ComponentLibrarySpec'
import { ThemeProvider, Button } from './components/security-theme'
import SecurityDashboard from './pages/SecurityDashboard'
import PolicyEditor from './pages/PolicyEditor'
import EventsPage from './pages/EventsPage'
import AppCatalog from './pages/AppCatalog'

type Route = 'overview' | 'apps' | 'policy' | 'events' | 'components'

const tabs: Array<{ key: Route; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'apps', label: 'App Catalog' },
  { key: 'policy', label: 'Policy' },
  { key: 'events', label: 'Events' },
  { key: 'components', label: 'Components' },
]

const logoUrl = new URL('../assets_logo.svg', import.meta.url).href

const App: React.FC = () => {
  const [route, setRoute] = useState<Route>('overview')

  return (
    <ThemeProvider>
      <>
        <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
          <header className="sticky top-0 z-20 border-b border-[hsl(var(--border))] bg-[hsla(var(--background),0.92)] backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt="Checkred AI Security logo"
                className="h-9 w-9 rounded-md border border-[hsla(var(--border),0.6)] bg-[hsla(var(--accent),0.08)] p-1.5"
              />
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                <span>Checkred AI Security</span>
                <span className="text-[hsl(var(--accent-foreground))]">MVP</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <Button
                  key={tab.key}
                  size="sm"
                  variant={route === tab.key ? 'primary' : 'outline'}
                  onClick={() => setRoute(tab.key)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl pb-12">
          {route === 'overview' && <SecurityDashboard />}
          {route === 'apps' && <AppCatalog />}
          {route === 'policy' && <PolicyEditor />}
          {route === 'events' && <EventsPage />}
          {route === 'components' && <ComponentLibrarySpec />}
        </main>
        </div>
        <Toaster position="top-right" richColors duration={4000} />
      </>
    </ThemeProvider>
  )
}

export default App
