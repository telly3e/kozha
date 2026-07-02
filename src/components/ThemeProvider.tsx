import { ReactNode, createContext, useEffect, useState } from "react"

export type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

const LEGACY_THEME_STORAGE_KEY = "vite-ui-theme"

const readStoredTheme = (storageKey: string): Theme => {
  const storedTheme = localStorage.getItem(storageKey) || (storageKey === "appearance" ? localStorage.getItem(LEGACY_THEME_STORAGE_KEY) : null)

  return storedTheme === "dark" || storedTheme === "light" || storedTheme === "system" ? storedTheme : "system"
}

export function ThemeProvider({ children, storageKey = "appearance" }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme(storageKey))

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove("light", "dark")

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

      root.classList.add(systemTheme)
      const themeColor = systemTheme === "dark" ? "hsl(30 15% 8%)" : "hsl(0 0% 98%)"
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor)
      return
    }

    root.classList.add(theme)
    const themeColor = theme === "dark" ? "hsl(30 15% 8%)" : "hsl(0 0% 98%)"
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor)
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      if (storageKey === "appearance") {
        localStorage.setItem(LEGACY_THEME_STORAGE_KEY, theme)
      }
      setTheme(theme)
    },
  }

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}

export { ThemeProviderContext }
