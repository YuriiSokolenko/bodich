/* Local-only catalog review interactions. No remote data, tracking or network calls. */
(() => {
  'use strict';
  const controls = Object.fromEntries(
    ['language', 'category', 'editorial', 'visual', 'lifecycle', 'search'].map(
      (id) => [id, document.getElementById(id)]),
  );
  const cards = Array.from(document.querySelectorAll('.review-record'));
  const counter = document.getElementById('visible-count');
  const feedback = document.getElementById('filter-feedback');
  const localizable = Array.from(document.querySelectorAll('[data-i18n-en]'));
  const records = document.getElementById('records');
  let renderedLanguage = null;

  function update() {
    const language = controls.language.value;
    // Do not rewrite thousands of translated nodes on each search keystroke.
    if (language !== renderedLanguage) {
      renderedLanguage = language;
      document.body.dataset.locale = language;
      document.documentElement.lang = language;
      for (const node of localizable) {
        node.textContent = node.getAttribute('data-i18n-' + language);
      }
      controls.search.placeholder = controls.search.getAttribute('data-placeholder-' + language);
      records.setAttribute('aria-label', records.getAttribute('data-aria-' + language));
      for (const card of cards) {
        const img = card.querySelector('img[data-alt-en]');
        if (img) img.alt = img.getAttribute('data-alt-' + language);
      }
    }
    const query = controls.search.value.trim().normalize('NFKC').toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      const match = (!controls.category.value || card.dataset.category === controls.category.value) &&
        (!controls.editorial.value || card.dataset.editorial === controls.editorial.value) &&
        (!controls.visual.value || card.dataset.visual === controls.visual.value) &&
        (!controls.lifecycle.value || card.dataset.lifecycle === controls.lifecycle.value) &&
        (!query || card.dataset.search.normalize('NFKC').toLocaleLowerCase().includes(query));
      card.hidden = !match;
      if (match) visible += 1;
    }
    counter.textContent = String(visible);
    feedback.textContent = language === 'ro'
      ? visible + ' din ' + cards.length + ' referințe afișate. Niciuna nu este aprobată.'
      : visible + ' of ' + cards.length + ' source references shown. None are approved.';
  }

  for (const control of Object.values(controls)) {
    control.addEventListener(control.id === 'search' ? 'input' : 'change', update);
  }
  update();
})();
