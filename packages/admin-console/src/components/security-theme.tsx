import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Monitor,
  Moon,
  Palette,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'

export type ThemeMode = 'light' | 'dark' | 'system'
export type DensityMode = 'comfortable' | 'compact'

const THEME_STORAGE_KEY = 'promptshield-theme-mode'
const DENSITY_STORAGE_KEY = 'promptshield-density-mode'

type ThemeTokens = Record<string, string>

type ThemeContextValue = {
  theme: ThemeMode
  density: DensityMode
  resolvedTheme: 'light' | 'dark'
  setTheme: (mode: ThemeMode) => void
  setDensity: (mode: DensityMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export const cn = (...values: Array<string | undefined | false | null>) =>
  values.filter(Boolean).join(' ')

const themeTokens: Record<'light' | 'dark', ThemeTokens> = {
  light: {
    '--background': '210 40% 98%',
    '--foreground': '220 15% 18%',
    '--muted': '220 16% 92%',
    '--muted-foreground': '220 9% 46%',
    '--card': '0 0% 100%',
    '--card-foreground': '220 15% 15%',
    '--border': '214 32% 91%',
    '--primary': '225 71% 51%',
    '--primary-foreground': '0 0% 100%',
    '--secondary': '224 45% 85%',
    '--secondary-foreground': '225 70% 25%',
    '--accent': '164 78% 41%',
    '--accent-foreground': '0 0% 100%',
    '--destructive': '0 84% 60%',
    '--destructive-foreground': '0 0% 100%',
    '--ring': '224 76% 48%',
    '--input': '214 32% 91%',
  },
  dark: {
    '--background': '216 33% 8%',
    '--foreground': '210 40% 96%',
    '--muted': '215 19% 15%',
    '--muted-foreground': '214 15% 65%',
    '--card': '214 27% 12%',
    '--card-foreground': '210 40% 96%',
    '--border': '215 19% 18%',
    '--primary': '226 70% 70%',
    '--primary-foreground': '226 100% 16%',
    '--secondary': '226 40% 32%',
    '--secondary-foreground': '226 70% 88%',
    '--accent': '165 70% 45%',
    '--accent-foreground': '166 100% 12%',
    '--destructive': '4 82% 60%',
    '--destructive-foreground': '0 0% 100%',
    '--ring': '226 70% 70%',
    '--input': '214 27% 20%',
  },
}

const densityTokens: Record<DensityMode, ThemeTokens> = {
  comfortable: {
    '--radius': '8px',
    '--control-height': '40px',
    '--control-padding-x': '16px',
  },
  compact: {
    '--radius': '6px',
    '--control-height': '34px',
    '--control-padding-x': '12px',
  },
}

const getSystemTheme = (): 'light' | 'dark' =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'

const applyTokens = (tokens: ThemeTokens) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  Object.entries(tokens).forEach(([key, value]) => root.style.setProperty(key, value))
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null
    return stored ?? 'system'
  })
  const [density, setDensityState] = useState<DensityMode>(() => {
    if (typeof window === 'undefined') return 'comfortable'
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY) as DensityMode | null
    return stored ?? 'comfortable'
  })

  const resolvedTheme = useMemo<'light' | 'dark'>(() => {
    if (theme === 'system') {
      return getSystemTheme()
    }
    return theme
  }, [theme])

  useEffect(() => {
    applyTokens(themeTokens[resolvedTheme])
  }, [resolvedTheme])

  useEffect(() => {
    applyTokens(densityTokens[density])
  }, [density])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    root.dataset.density = density
  }, [resolvedTheme, density])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch (error) {
      console.error('Theme storage failed', error)
    }
  }, [theme])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, density)
    } catch (error) {
      console.error('Density storage failed', error)
    }
  }, [density])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTokens(themeTokens[getSystemTheme()])
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
  }, [])

  const setDensity = useCallback((mode: DensityMode) => {
    setDensityState(mode)
  }, [])

  const value = useMemo(
    () => ({ theme, density, resolvedTheme, setTheme, setDensity }),
    [theme, density, resolvedTheme, setTheme, setDensity],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary:
          'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:shadow-lg hover:shadow-[hsla(var(--primary),0.35)]',
        secondary:
          'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--secondary)/0.9)]',
        outline:
          'border border-[hsl(var(--border))] bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.4)]',
        ghost: 'bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.35)]',
        destructive:
          'bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:bg-[hsl(var(--destructive))]/90',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-[var(--control-height)] px-[var(--control-padding-x)]',
        lg: 'h-12 px-6 text-base',
        icon: 'h-[var(--control-height)] w-[var(--control-height)]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'

const inputClasses =
  'flex h-[var(--control-height)] w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-[calc(var(--control-padding-x)-4px)] text-sm text-[hsl(var(--foreground))] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 placeholder:text-[hsl(var(--muted-foreground))] disabled:cursor-not-allowed disabled:opacity-60'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId
    return (
      <div className="flex flex-col gap-1">
        {label ? (
          <label htmlFor={inputId} className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(inputClasses, error && 'border-[hsl(var(--destructive))] focus-visible:ring-[hsl(var(--destructive))]', className)}
          aria-invalid={Boolean(error) || undefined}
          {...props}
        />
        {error ? (
          <p className="text-xs text-[hsl(var(--destructive))]" role="alert">
            {error}
          </p>
        ) : hint ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>
        ) : null}
      </div>
    )
  },
)
Input.displayName = 'Input'

export const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm backdrop-blur',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 border-b border-[hsl(var(--border))] px-6 py-4', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-base font-semibold tracking-tight', className)} {...props} />
  ),
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-[hsl(var(--muted-foreground))]', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-6 py-5 text-sm leading-6', className)} {...props} />
  ),
)
CardContent.displayName = 'CardContent'

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme, resolvedTheme } = useTheme()

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 shadow-sm" role="group" aria-label="Theme toggle">
      <ToggleChip
        icon={<Sun className="h-3.5 w-3.5" aria-hidden />}
        label="Light"
        pressed={resolvedTheme === 'light' && theme !== 'system'}
        onClick={() => setTheme('light')}
      />
      <ToggleChip
        icon={<Moon className="h-3.5 w-3.5" aria-hidden />}
        label="Dark"
        pressed={resolvedTheme === 'dark' && theme !== 'system'}
        onClick={() => setTheme('dark')}
      />
      <ToggleChip
        icon={<Monitor className="h-3.5 w-3.5" aria-hidden />}
        label="System"
        pressed={theme === 'system'}
        onClick={() => setTheme('system')}
      />
    </div>
  )
}

export const DensityToggle: React.FC = () => {
  const { density, setDensity } = useTheme()

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 shadow-sm" role="group" aria-label="Density toggle">
      <ToggleChip
        icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
        label="Comfort"
        pressed={density === 'comfortable'}
        onClick={() => setDensity('comfortable')}
      />
      <ToggleChip
        icon={<Zap className="h-3.5 w-3.5" aria-hidden />}
        label="Compact"
        pressed={density === 'compact'}
        onClick={() => setDensity('compact')}
      />
    </div>
  )
}

type ToggleChipProps = {
  icon: React.ReactNode
  label: string
  pressed: boolean
  onClick: () => void
}

const ToggleChip: React.FC<ToggleChipProps> = ({ icon, label, pressed, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2',
      pressed ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
    )}
    aria-pressed={pressed}
  >
    {icon}
    {label}
  </button>
)

export const SecurityThemeDemo: React.FC = () => (
  <div className="grid gap-4 md:grid-cols-[280px,1fr]" data-testid="security-theme-demo">
    <Card className="overflow-hidden">
      <CardHeader className="border-none bg-[hsla(var(--primary),0.12)]">
        <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-[hsl(var(--primary))]">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          PromptShield System
        </CardTitle>
        <CardDescription className="text-xs leading-5">
          Risk-adaptive guardrails that keep sensitive disclosures out of AI prompts and outputs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            Controls
          </p>
          <div className="flex flex-wrap gap-2">
            <ThemeToggle />
            <DensityToggle />
          </div>
        </div>
        <div className="grid gap-3">
          <div className="flex items-center justify-between rounded-lg border border-dashed border-[hsl(var(--border))] p-3 text-xs">
            <span className="font-medium text-[hsl(var(--muted-foreground))]">Policy Version</span>
            <span className="font-semibold text-[hsl(var(--foreground))]">4.2.1</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-dashed border-[hsl(var(--border))] p-3 text-xs">
            <span className="font-medium text-[hsl(var(--muted-foreground))]">Shadow AI Alerts</span>
            <span className="flex items-center gap-1 font-semibold text-[hsl(var(--destructive))]">
              12
              <Plus className="h-3 w-3" aria-hidden />
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Palette className="h-5 w-5" aria-hidden />
          21st.dev Experience
        </CardTitle>
        <CardDescription>
          Minimal, high-contrast surfaces that keep analysts in flow while respecting privacy-by-default logging.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between rounded-md bg-[hsla(var(--accent),0.16)] px-4 py-3 text-[hsl(var(--accent-foreground))]">
            <span className="font-medium">PII Capture</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold">
              42 incidents
            </span>
          </div>
          <div className="rounded-md border border-[hsl(var(--border))] px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Fail-closed response</p>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              Sanitized prompt and blocked outbound call after detecting API key signature.
            </p>
          </div>
        </div>
        <Button variant="primary" className="w-full" size="md">
          <Sparkles className="mr-2 h-4 w-4" aria-hidden />
          Launch Zero-Trust Flight Recorder
        </Button>
      </CardContent>
    </Card>
  </div>
)
