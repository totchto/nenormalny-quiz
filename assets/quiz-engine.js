(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panels = ['view-home', 'view-game', 'view-between', 'view-finish'];
  let quiz = null;
  let STORAGE_KEY = '';
  let BEST_KEY = '';
  let totalQuestions = 0;
  let maxScore = 0;
  let state = null;
  let best = 0;

  function safelyRead(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  function safelyWrite(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* private mode can deny storage */ }
  }
  function readBest() {
    const n = Number(safelyRead(BEST_KEY));
    return Number.isInteger(n) && n >= 0 && n <= maxScore ? n : 0;
  }
  function shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function makeOrders() {
    return quiz.rounds.map(round => round.questions.map(q =>
      q.type === 'choice' ? shuffle(q.choices.map((_, index) => index)) : null
    ));
  }
  function blankState() {
    return {
      version: 1, quizId: quiz.id, round: 0, question: 0, score: 0,
      roundScores: quiz.rounds.map(() => 0),
      orders: makeOrders(), status: 'question', selected: null,
      pending: '', credited: false, wasCorrect: false
    };
  }
  function loadedState() {
    const raw = safelyRead(STORAGE_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (s.version !== 1 || s.quizId !== quiz.id) return null;
      if (!Number.isInteger(s.round) || s.round < 0 || s.round >= quiz.rounds.length) return null;
      if (!Number.isInteger(s.question) || s.question < 0 || s.question >= quiz.rounds[s.round].questions.length) return null;
      if (!['question', 'revealed', 'between', 'finished'].includes(s.status)) return null;
      if (!Number.isInteger(s.score) || s.score < 0 || s.score > maxScore) return null;
      if (!Array.isArray(s.roundScores) || s.roundScores.length !== quiz.rounds.length) return null;
      if (!s.roundScores.every((n, i) => Number.isInteger(n) && n >= 0 && n <= quiz.rounds[i].questions.length * (quiz.rounds[i].multiplier || 1))) return null;
      if (s.roundScores.reduce((a, b) => a + b, 0) !== s.score) return null;
      if (!Array.isArray(s.orders) || s.orders.length !== quiz.rounds.length) return null;
      for (let r = 0; r < quiz.rounds.length; r++) {
        const qs = quiz.rounds[r].questions;
        if (!Array.isArray(s.orders[r]) || s.orders[r].length !== qs.length) return null;
        for (let i = 0; i < qs.length; i++) {
          if (qs[i].type !== 'choice') continue;
          const order = s.orders[r][i];
          if (!Array.isArray(order) || order.length !== qs[i].choices.length || new Set(order).size !== order.length || order.some(x => !Number.isInteger(x) || x < 0 || x >= order.length)) return null;
        }
      }
      s.pending = typeof s.pending === 'string' ? s.pending.slice(0, 180) : '';
      s.selected = Number.isInteger(s.selected) ? s.selected : null;
      s.credited = Boolean(s.credited);
      s.wasCorrect = Boolean(s.wasCorrect);
      return s;
    } catch { return null; }
  }
  function save() { if (state) safelyWrite(STORAGE_KEY, JSON.stringify(state)); }
  function pointsForRound(roundIndex) { return quiz.rounds[roundIndex].multiplier || 1; }
  function currentQuestion() { return quiz.rounds[state.round].questions[state.question]; }
  function questionIndex() {
    let index = state.question;
    for (let i = 0; i < state.round; i++) index += quiz.rounds[i].questions.length;
    return index;
  }
  function norm(s) {
    return String(s || '').normalize('NFKC').toLowerCase().replaceAll('ё', 'е')
      .replace(/[^a-zа-я0-9]/g, '');
  }
  function showPanel(id) {
    for (const panel of panels) $(panel).hidden = panel !== id;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderHome() {
    // Store the display title as plain text nodes, not untrusted HTML.
    const header = $('home-title');
    header.replaceChildren();
    if (quiz.id === 'nenormalnaya-gruppa-2') {
      header.append(document.createTextNode('НЕНОРМАЛЬНАЯ'), el('br'), el('em', '', 'ГРУППА'), el('span', 'hero-two', '2'));
    } else if (quiz.id === 'nenormalnaya-gruppa-statistika') {
      header.append(document.createTextNode('ПЕРЕПИСЬ'), el('br'), el('em', '', 'НЕНОРМАЛЬНЫХ'));
    } else {
      header.textContent = quiz.title.toUpperCase();
    }
    $('hero-number').textContent = `ИГРА № ${quiz.edition || '01'}`;
    $('hero-subtitle').textContent = quiz.subtitle.toUpperCase();
    $('hero-description').textContent = quiz.description || '25 вопросов по вашей переписке.';
    const list = $('home-rounds');
    list.replaceChildren();
    quiz.rounds.forEach((r, index) => {
      const li = el('li');
      const num = el('div', 'round-num', String(index + 1).padStart(2, '0'));
      const info = el('div', 'round-info');
      info.append(el('strong', '', r.title), el('span', '', r.description));
      const count = el('span', 'round-points' + (r.multiplier ? ' double' : ''), r.multiplier ? '×2 ОЧКА' : '5 ВОПРОСОВ');
      li.append(num, info, count);
      list.append(li);
    });
    const playing = state && state.status !== 'finished';
    $('home-play').querySelector('span').textContent = playing ? '→' : '↗';
    $('home-play').firstChild.textContent = playing ? 'ПРОДОЛЖИТЬ ИГРУ ' : 'НАЧАТЬ КВИЗ ';
    $('home-new').hidden = !playing;
    $('home-best').hidden = best === 0;
    $('home-best').textContent = `ВАШ ЛУЧШИЙ РЕЗУЛЬТАТ: ${best} / ${maxScore}`;
    showPanel('view-home');
  }

  function renderGame() {
    const r = state.round;
    const q = currentQuestion();
    const mode = q.type;
    const revealed = state.status === 'revealed';
    $('game-score').textContent = `${String(state.score).padStart(2, '0')} / ${maxScore}`;
    $('round-label').textContent = `РАУНД ${String(r + 1).padStart(2, '0')} / ${String(quiz.rounds.length).padStart(2, '0')}`;
    $('question-label').textContent = `ВОПРОС ${String(questionIndex() + 1).padStart(2, '0')} / ${totalQuestions}`;
    $('progress-fill').style.width = `${((questionIndex() + (revealed ? 1 : 0)) / totalQuestions) * 100}%`;
    $('round-name').textContent = quiz.rounds[r].title;
    $('question-type').textContent = mode === 'choice' ? 'ВЫБОР ИЗ ЧЕТЫРЁХ' : 'РУЧНОЙ ОТВЕТ';
    $('question-value').textContent = pointsForRound(r) + (pointsForRound(r) > 1 ? ' ОЧКА' : ' ОЧКО');
    $('question-heading').textContent = q.question;
    $('answer-form').hidden = revealed;
    $('answer-reveal').hidden = !revealed;
    $('choice-fieldset').hidden = mode !== 'choice';
    $('input-wrap').hidden = mode !== 'text';
    const list = $('choice-list');
    list.replaceChildren();
    if (mode === 'choice') {
      state.orders[r][state.question].forEach((originalIndex, shownIndex) => {
        const label = el('label', 'answer-option');
        const input = el('input');
        input.type = 'radio'; input.name = 'quiz-choice'; input.value = String(originalIndex);
        input.checked = state.selected === originalIndex;
        input.addEventListener('change', () => {
          state.selected = originalIndex;
          save();
          $('check-answer').disabled = false;
        });
        label.append(input, el('span', 'option-letter', ['А', 'Б', 'В', 'Г'][shownIndex]), el('span', 'option-text', q.choices[originalIndex]));
        list.append(label);
      });
    }
    $('free-answer').value = state.pending;
    $('check-answer').disabled = mode === 'choice' ? state.selected === null : !state.pending.trim();
    if (revealed) renderReveal();
    showPanel('view-game');
  }

  function award() {
    if (state.credited) return;
    state.credited = true;
    const pts = pointsForRound(state.round);
    state.score += pts;
    state.roundScores[state.round] += pts;
  }

  function submit() {
    if (!state || state.status !== 'question') return;
    const q = currentQuestion();
    let correct;
    if (q.type === 'choice') {
      if (state.selected === null) return;
      correct = state.selected === q.correct;
    } else {
      state.pending = $('free-answer').value.trim();
      if (!state.pending) return;
      correct = q.answers.some(answer => norm(answer) === norm(state.pending));
    }
    state.status = 'revealed';
    state.wasCorrect = correct;
    if (correct) award();
    save();
    renderGame();
  }

  function renderReveal() {
    const q = currentQuestion();
    const correct = state.wasCorrect || state.credited;
    $('reveal-icon').textContent = correct ? '✓' : '×';
    $('reveal-icon').classList.toggle('is-wrong', !correct);
    $('reveal-title').textContent = correct ? 'ОТЛИЧНО, ВЕРНО!' : 'МИМО! БЫВАЕТ.';
    $('reveal-points').textContent = correct ? `+${pointsForRound(state.round)} ${pointsForRound(state.round) === 1 ? 'БАЛЛ' : 'БАЛЛА'}` : '0 БАЛЛОВ';
    $('correct-answer').textContent = q.type === 'choice' ? q.choices[q.correct] : q.displayAnswer;
    $('answer-explanation').textContent = q.explanation;
    $('answer-joke').textContent = q.joke;
    $('answer-source').textContent = q.source;
    $('manual-credit').hidden = q.type !== 'text' || state.credited;
    $('next-question').querySelector('span').textContent = '→';
    $('next-question').firstChild.textContent = state.round === quiz.rounds.length - 1 && state.question === quiz.rounds[state.round].questions.length - 1
      ? 'ПОСМОТРЕТЬ РЕЗУЛЬТАТ ' : state.question === quiz.rounds[state.round].questions.length - 1 ? 'ЗАКОНЧИТЬ РАУНД ' : 'СЛЕДУЮЩИЙ ВОПРОС ';
    $('game-score').textContent = `${String(state.score).padStart(2, '0')} / ${maxScore}`;
  }

  function next() {
    if (!state || state.status !== 'revealed') return;
    if (state.question < quiz.rounds[state.round].questions.length - 1) {
      state.question += 1;
      state.status = 'question';
      state.selected = null;
      state.pending = '';
      state.credited = false;
      state.wasCorrect = false;
    } else if (state.round < quiz.rounds.length - 1) {
      state.status = 'between';
    } else {
      state.status = 'finished';
      best = Math.max(best, state.score);
      safelyWrite(BEST_KEY, String(best));
    }
    save();
    renderState();
  }

  function renderBetween() {
    const idx = state.round;
    $('between-number').textContent = String(idx + 1).padStart(2, '0');
    $('between-title').textContent = quiz.rounds[idx].title;
    $('between-points').textContent = `${state.roundScores[idx]} / ${quiz.rounds[idx].questions.length * pointsForRound(idx)}`;
    const p = state.roundScores[idx];
    $('between-roast').textContent = p === 5 ? 'Пять из пяти! Вы чё, заучивали эти переписки вместо работы?'
      : p >= 3 ? 'Вполне достойно. Видно, что на работе вы были заняты важными делами.'
      : p > 0 ? 'Что-то ещё осталось в голове. Это радует.'
      : 'Ноль. Срочно нужна повторная адаптация в чате.';
    $('between-next-title').textContent = `0${idx + 2}. ${quiz.rounds[idx + 1].title}`;
    $('between-next-description').textContent = quiz.rounds[idx + 1].description + (idx === 3 ? ' · За каждый правильный ответ — 2 балла.' : '');
    showPanel('view-between');
  }

  function continueRound() {
    if (!state || state.status !== 'between') return;
    state.round += 1;
    state.question = 0;
    state.status = 'question';
    state.selected = null;
    state.pending = '';
    state.credited = false;
    state.wasCorrect = false;
    save();
    renderState();
  }

  function renderFinish() {
    $('finish-score').replaceChildren(document.createTextNode(String(state.score).padStart(2, '0')), el('span', '', `/${maxScore}`));
    const ratio = state.score / maxScore;
    $('finish-badge').textContent = ratio >= .9 ? 'ГЛАВНЫЙ ХРАНИТЕЛЬ КОМПРОМАТА'
      : ratio >= .7 ? 'МАСТЕР КОРПОРАТИВНОГО ЦИРКА'
      : ratio >= .45 ? 'СВИДЕТЕЛЬ ПРОИСХОДИВШЕГО'
      : 'ВЫ ТОЧНО РАБОТАЛИ С ЭТИМИ ЛЮДЬМИ?';
    $('finish-description').textContent = ratio >= .9 ? 'Вы помните даже то, что авторы давно хотели забыть. Пугающая память.'
      : ratio >= .7 ? 'Мемы, цитаты и офисная дичь — ваша стихия. Отдел кадров вами гордится. Наверное.'
      : ratio >= .45 ? 'Нормально. Хотя некоторые фрагменты истории мозг предусмотрительно удалил.'
      : 'Ваша память успешно прошла процедуру корпоративного очищения. Всё лишнее удалено.';
    $('finish-best').textContent = `ЛИЧНЫЙ РЕКОРД НА ЭТОМ УСТРОЙСТВЕ: ${best} / ${maxScore}`;
    const list = $('finish-rounds'); list.replaceChildren();
    quiz.rounds.forEach((r, i) => {
      const row = el('div', 'score-row');
      row.append(el('span', '', `${String(i + 1).padStart(2, '0')} / ${r.title}`), el('strong', '', `${state.roundScores[i]} / ${r.questions.length * pointsForRound(i)}`));
      list.append(row);
    });
    $('share-fallback').hidden = true;
    showPanel('view-finish');
  }

  function renderState() {
    if (!state) return renderHome();
    if (state.status === 'question' || state.status === 'revealed') return renderGame();
    if (state.status === 'between') return renderBetween();
    if (state.status === 'finished') return renderFinish();
    renderHome();
  }

  function begin() { state = blankState(); save(); renderState(); }
  function beginAgain() {
    if (state && state.status !== 'finished' && !window.confirm('Начать заново? Текущее прохождение сбросится.')) return;
    begin();
  }
  function toHome(event) { if (event) event.preventDefault(); window.location.href = '../../index.html'; }
  async function shareResult() {
    const text = `${quiz.title} — мой результат: ${state.score}/${maxScore} 🤘\nА ты сколько наберёшь?`;
    const url = location.protocol === 'file:' ? '' : `${location.origin}${location.pathname}`;
    const message = url ? `${text}\n${url}` : text;
    if (navigator.share) {
      try { await navigator.share({ title: quiz.title, text: message }); return; }
      catch (err) { if (err && err.name === 'AbortError') return; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(message);
        const btn = $('share-result');
        btn.firstChild.textContent = 'СКОПИРОВАНО! ';
        setTimeout(() => { btn.firstChild.textContent = 'ПОДЕЛИТЬСЯ РЕЗУЛЬТАТОМ '; }, 2000);
        return;
      } catch { /* fallback below */ }
    }
    $('share-fallback').hidden = false;
    $('share-message').value = message;
    $('share-message').focus();
    $('share-message').select();
  }

  $('home-logo').addEventListener('click', toHome);
  $('home-library').addEventListener('click', toHome);
  $('finish-library').addEventListener('click', toHome);
  $('home-play').addEventListener('click', () => { if (!state || state.status === 'finished') begin(); else renderState(); });
  $('home-new').addEventListener('click', beginAgain);
  $('game-home').addEventListener('click', toHome);
  $('game-restart').addEventListener('click', beginAgain);
  $('free-answer').addEventListener('input', event => {
    if (!state || state.status !== 'question') return;
    state.pending = event.target.value.slice(0, 180);
    $('check-answer').disabled = !state.pending.trim();
    save();
  });
  $('answer-form').addEventListener('submit', event => { event.preventDefault(); submit(); });
  $('manual-credit').addEventListener('click', () => {
    if (!state || state.status !== 'revealed' || state.credited || currentQuestion().type !== 'text') return;
    award(); save(); renderReveal();
  });
  $('next-question').addEventListener('click', next);
  $('between-continue').addEventListener('click', continueRound);
  $('between-home').addEventListener('click', toHome);
  $('share-result').addEventListener('click', shareResult);
  $('finish-restart').addEventListener('click', begin);

  async function initialize() {
    try {
      const response = await fetch('./questions.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      quiz = await response.json();
      if (!quiz || !quiz.id || !quiz.storagePrefix || !Array.isArray(quiz.rounds) || !quiz.rounds.length) {
        throw new Error('Некорректный формат questions.json');
      }
      for (const round of quiz.rounds) {
        if (!Array.isArray(round.questions) || !round.questions.length) throw new Error('В квизе нет вопросов');
      }
      const version = Number.isInteger(quiz.version) && quiz.version > 0 ? quiz.version : 1;
      STORAGE_KEY = `${quiz.storagePrefix}:session:v${version}`;
      BEST_KEY = `${quiz.storagePrefix}:best:v${version}`;
      totalQuestions = quiz.rounds.reduce((sum, round) => sum + round.questions.length, 0);
      maxScore = quiz.rounds.reduce((sum, round) => sum + round.questions.length * (round.multiplier || 1), 0);
      best = readBest();
      state = loadedState();
      document.title = `${quiz.title} — Ненормальный квиз`;
      renderHome();
    } catch (error) {
      console.error('Не удалось загрузить квиз:', error);
      const main = $('main-content');
      main.replaceChildren();
      const message = el('section', 'howto');
      message.append(el('h1', '', 'Не удалось загрузить вопросы'), el('p', '', 'Проверьте файл questions.json. Для просмотра на компьютере запустите локальный HTTP-сервер, а не открывайте HTML через file://.'));
      const link = el('a', 'btn btn-primary', 'Вернуться к списку квизов');
      link.href = '../../index.html';
      message.append(link);
      main.append(message);
    }
  }
  initialize();

})();
