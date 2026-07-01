document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('theme-toggle');
  if (!toggleBtn) return;

  /**
   * Retrieves the current active or preferred theme.
   * If a preference is saved, it uses it. Otherwise, it defaults to dark.
   */
  const getPreferredTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;
    // Default to dark mode for Gregorium Dev if no preference is recorded
    return 'dark';
  };

  /**
   * Toggles the data-theme attribute on the root HTML element, 
   * triggering CSS variables using light-dark() to switch instantly.
   */
  const setTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  };

  // Initialize page theme
  setTheme(getPreferredTheme());

  // Toggle theme action
  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  });
});
