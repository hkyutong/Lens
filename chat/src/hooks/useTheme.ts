export function useTheme() {
  const html = document.documentElement

  const init = () => {
    const theme = 'light'
    html.dataset.theme = theme
    html.classList.remove('dark')
    html.style.colorScheme = theme
    localStorage.setItem('theme', theme)
    window.theme = theme
  }

  const toggle = () => {
    init()
  }

  return { init, toggle }
}
