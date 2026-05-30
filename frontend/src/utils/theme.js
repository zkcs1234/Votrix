export function applyTheme(theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark')
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark'
}

export function initTheme() {
  const stored = localStorage.getItem('votrix_theme')
  applyTheme(stored === 'dark' ? 'dark' : 'light')
}
