/**
 * 화면 틀: 고정 문구, 언어 전환, iframe 삽입 모드, 바텀시트(좁은 화면), 알림.
 */
const SHEET_STATES = ['peek', 'half', 'full'];
const narrow = () => window.matchMedia('(max-width: 959px)').matches;

export function applyStaticText(i18n) {
  document.documentElement.lang = i18n.lang;
  document.title = i18n.t('app.documentTitle');
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', i18n.t('app.description'));
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = i18n.t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, i18n.t(key));
    }
  }
  const toggle = document.getElementById('lang-toggle');
  if (toggle) toggle.setAttribute('lang', i18n.lang === 'ko' ? 'en' : 'ko');
}

export function createShell({ i18n, embed, onLang, onSheetChange }) {
  const panel = document.getElementById('panel');
  const grip = document.getElementById('sheet-grip');
  const live = document.getElementById('live');
  const toastEl = document.getElementById('toast');

  if (embed) {
    document.body.classList.add('embed');
    // iframe 안에서 학교 홈페이지 링크가 프레임 안으로 열리지 않게
    for (const link of document.querySelectorAll('a[href^="http"]')) {
      link.target = '_blank';
      link.rel = 'noopener';
    }
  }

  document.getElementById('lang-toggle').addEventListener('click', () => {
    onLang(i18n.lang === 'ko' ? 'en' : 'ko');
  });

  function setSheet(state) {
    if (!SHEET_STATES.includes(state)) return;
    panel.dataset.sheet = state;
    const expanded = state !== 'peek';
    grip.setAttribute('aria-expanded', String(expanded));
    grip.setAttribute('aria-label', i18n.t(state === 'full' ? 'sheet.collapse' : 'sheet.expand'));
    if (onSheetChange) setTimeout(onSheetChange, 260);
  }

  grip.addEventListener('click', () => {
    const now = panel.dataset.sheet;
    setSheet(now === 'peek' ? 'half' : now === 'half' ? 'full' : 'half');
  });

  // 손잡이를 끌어 올리고 내린다. 놓으면 가까운 단계로 붙는다.
  let drag = null;
  const handle = panel.querySelector('.sheet-handle');
  handle.addEventListener('pointerdown', (event) => {
    if (!narrow()) return;
    drag = { y: event.clientY, height: panel.getBoundingClientRect().height, moved: false };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const delta = drag.y - event.clientY;
    if (Math.abs(delta) > 4) drag.moved = true;
    if (!drag.moved) return;
    panel.style.transition = 'none';
    panel.style.height = `${Math.max(120, drag.height + delta)}px`;
  });
  handle.addEventListener('pointerup', () => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    panel.style.transition = '';
    if (!wasDrag) return;
    const height = panel.getBoundingClientRect().height;
    const total = panel.parentElement.getBoundingClientRect().height;
    panel.style.height = '';
    const ratio = height / total;
    setSheet(ratio < 0.3 ? 'peek' : ratio < 0.75 ? 'half' : 'full');
  });

  let toastTimer = 0;
  return {
    setSheet,
    /** 좁은 화면에서만 의미가 있다. 넓은 화면에서는 아무 일도 하지 않는다. */
    ensureSheet(state) {
      if (!narrow()) return;
      const order = { peek: 0, half: 1, full: 2 };
      if (order[panel.dataset.sheet] < order[state]) setSheet(state);
    },
    announce(text) {
      live.textContent = '';
      // 같은 문장을 연달아 알려도 스크린리더가 다시 읽게 한 틀 쉰다
      setTimeout(() => { live.textContent = text; }, 60);
    },
    toast(text) {
      toastEl.textContent = text;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
    },
  };
}
