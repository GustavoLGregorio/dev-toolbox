document.addEventListener('DOMContentLoaded', () => {
  // Theme toggle
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    const getPreferredTheme = () => {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) return savedTheme;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    };

    const setTheme = (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    };

    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
    });
  }

  // Hub search filter
  const searchInput = document.getElementById('search-input');
  const cards = document.querySelectorAll('.card-grid .card');
  const emptyState = document.getElementById('search-empty');

  if (searchInput && cards.length > 0) {
    const filterCards = () => {
      const query = searchInput.value.trim().toLowerCase();
      let visibleCount = 0;

      cards.forEach((card) => {
        const text = card.textContent.toLowerCase();
        const matches = query === '' || text.includes(query);
        card.style.display = matches ? '' : 'none';
        if (matches) visibleCount++;
      });

      if (emptyState) {
        emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
      }
    };

    searchInput.addEventListener('input', filterCards);

    // Keyboard shortcut: '/' focuses search input
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        const isInputField = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
        if (!isInputField) {
          e.preventDefault();
          searchInput.focus();
        }
      } else if (e.key === 'Escape' && document.activeElement === searchInput) {
        searchInput.value = '';
        filterCards();
        searchInput.blur();
      }
    });
  }
});
