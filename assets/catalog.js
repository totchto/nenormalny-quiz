(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const list = $('library-cards');
  const status = $('catalog-status');
  const element = (tag, css, value) => {
    const item = document.createElement(tag);
    if (css) item.className = css;
    if (value !== undefined) item.textContent = String(value);
    return item;
  };
  const local = key => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const progressFor = item => {
    const prefix = `${item.storagePrefix}:session:v${item.version}`;
    let state = null;
    try { state = JSON.parse(local(prefix)); } catch { /* not started */ }
    const playing = state && state.quizId === item.id && ['question', 'revealed', 'between'].includes(state.status);
    let best = Number(local(`${item.storagePrefix}:best:v${item.version}`) || 0);
    if (!Number.isInteger(best) || best < 0 || best > item.maxScore) best = 0;
    return { playing, best };
  };
  function makeCard(item, index) {
    const { playing, best } = progressFor(item);
    const article = element('article', 'quiz-tile');
    const label = element('div', 'quiz-tile-label');
    label.append(element('span', '', `ИГРА № ${String(index + 1).padStart(2, '0')}`), element('span', 'quiz-tile-badge', item.category.toUpperCase()));
    article.append(label, element('h2', '', item.title), element('div', 'quiz-sub', item.subtitle));
    article.append(element('p', '', item.description));
    const info = element('div', 'quiz-tile-info');
    info.append(element('span', '', `${item.roundCount} РАУНДОВ · ${item.questionCount} ВОПРОСОВ`), element('span', '', `${item.difficulty} · ≈ ${item.durationMinutes} МИН`));
    article.append(info);
    const record = element('p', 'catalog-record', playing ? '● ПРОХОЖДЕНИЕ НАЧАТО' : best > 0 ? `ВАШ РЕКОРД: ${best} / ${item.maxScore}` : 'ЕЩЁ НЕ ПРОХОДИЛИ');
    article.append(record);
    const link = element('a', 'btn btn-primary btn-big', playing ? 'ПРОДОЛЖИТЬ ИГРУ ↗' : 'ОТКРЫТЬ КВИЗ ↗');
    link.href = `./quizzes/${item.slug}/`;
    article.append(link);
    return article;
  }
  async function render() {
    try {
      const response = await fetch('./quizzes.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const { quizzes } = await response.json();
      if (!Array.isArray(quizzes) || quizzes.length === 0) throw new Error('Каталог пуст');
      const safe = quizzes.filter(item => typeof item.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug));
      if (!safe.length) throw new Error('В каталоге нет корректных адресов');
      const directQuiz = new URLSearchParams(location.search).get('quiz');
      // Old share links from the single-page version remain valid.
      const direct = safe.find(item => item.id === directQuiz);
      if (direct) { location.replace(`./quizzes/${direct.slug}/`); return; }
      $('library-count').textContent = `${safe.length} ${safe.length === 1 ? 'ИГРА' : safe.length < 5 ? 'ИГРЫ' : 'ИГР'}`;
      $('library-questions').textContent = `${safe.reduce((total, item) => total + item.questionCount, 0)} ВОПРОСОВ`;
      $('library-versions').textContent = 'НОВЫЕ КВИЗЫ БЕЗ ПЕРЕДЕЛКИ САЙТА';
      list.replaceChildren(...safe.map(makeCard));
    } catch (error) {
      console.error('Не удалось загрузить каталог:', error);
      status.textContent = 'Не удалось загрузить список игр. Для локального просмотра используйте HTTP-сервер (python3 -m http.server 8000).';
    }
  }
  render();
})();
