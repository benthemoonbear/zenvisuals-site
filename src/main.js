// Zen Visuals: motion and small enhancements, no libraries.
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const playSafe = (v) => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };

  // ---------- header reel: play on screen, pause off screen ----------
  const heroVideo = document.querySelector('.hero-video');
  if (heroVideo) {
    if (reduceMotion) heroVideo.pause();
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => { if (en.isIntersecting) playSafe(heroVideo); else heroVideo.pause(); }).observe(heroVideo);
    }
  }

  // ---------- smooth scrolling for mouse wheels (not touch, not reduced motion) ----------
  const smooth = (() => {
    if (reduceMotion || !finePointer) return null;
    let target = window.scrollY;
    let current = window.scrollY;
    let running = false;
    const max = () => root.scrollHeight - window.innerHeight;
    const blocked = (e) => e.ctrlKey || root.classList.contains('menu-open') || document.querySelector('dialog[open]')
      || (e.target instanceof Element && e.target.closest('textarea, select, [data-native-scroll]'));
    const tick = () => {
      current += (target - current) * 0.085;
      if (Math.abs(target - current) < 0.4) { current = target; running = false; }
      window.scrollTo(0, current);
      if (running) requestAnimationFrame(tick);
    };
    const go = (y) => {
      target = clamp(y, 0, max());
      if (!running) { running = true; current = window.scrollY; requestAnimationFrame(tick); }
    };
    window.addEventListener('wheel', (e) => {
      if (blocked(e) || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1;
      go((running ? target : window.scrollY) + e.deltaY * unit);
    }, { passive: false });
    // Keyboard, scrollbar and find-in-page move the page directly: follow them.
    window.addEventListener('scroll', () => { if (!running) target = current = window.scrollY; }, { passive: true });
    return { go };
  })();

  // In-page links glide to their section.
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const el = id ? document.getElementById(id) : null;
      if (!el && id !== 'top') return;
      e.preventDefault();
      const y = el ? el.getBoundingClientRect().top + window.scrollY - (id === 'top' ? 0 : 64) : 0;
      if (smooth) smooth.go(y); else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
      if (el && id !== 'top') { history.replaceState(null, '', '#' + id); }
    });
  });

  // ---------- mobile menu ----------
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('mobile-menu');
  if (toggle && menu) {
    const word = toggle.querySelector('.menu-word');
    const setMenu = (open) => {
      root.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (word) word.textContent = open ? 'Close' : 'Menu';
      if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
    };
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    window.matchMedia('(min-width: 761px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
  }

  // ---------- top bar: plain over the first screen, solid after it, tucks away while reading ----------
  const bar = document.getElementById('topbar');
  const heroEl = document.querySelector('[data-hero]');
  if (bar) {
    if (heroEl && 'IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => bar.classList.toggle('is-solid', !en.isIntersecting), { rootMargin: '-76px 0px 0px 0px' }).observe(heroEl);
    } else bar.classList.add('is-solid');
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (!root.classList.contains('menu-open')) {
        if (y > 400 && y - lastY > 4) bar.classList.add('is-hidden');
        else if (lastY - y > 4 || y < 400) bar.classList.remove('is-hidden');
      }
      lastY = y;
    }, { passive: true });
  }

  // ---------- entrances ----------
  const splitWords = (el) => {
    let n = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w';
            const inner = document.createElement('span'); inner.textContent = part; inner.style.setProperty('--i', n++);
            w.appendChild(inner); frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && !child.hasAttribute('data-type') && !child.classList.contains('sr')) walk(child);
      });
    };
    el.setAttribute('aria-label', el.textContent.trim());
    walk(el);
    el.classList.add('split');
  };

  // Typing: the italic words of a heading write themselves out, letter by letter.
  // The full text keeps its space while it types, so nothing around it moves.
  const typeOut = (el, delay = 0) => {
    const full = el.textContent;
    if (!full.trim() || el.dataset.typed) return;
    el.dataset.typed = '1';
    el.setAttribute('aria-label', full);
    el.innerHTML = '<span class="typed" aria-hidden="true"></span><span class="type-caret" aria-hidden="true"></span><span class="type-rest" aria-hidden="true"></span>';
    const typed = el.firstChild;
    const caret = typed.nextSibling;
    const rest = caret.nextSibling;
    rest.textContent = full;
    let i = 0;
    const step = () => {
      i += 1;
      typed.textContent = full.slice(0, i);
      rest.textContent = full.slice(i);
      if (i < full.length) setTimeout(step, full[i - 1] === ' ' ? 90 : 42 + Math.random() * 46);
      else setTimeout(() => caret.classList.add('is-done'), 1400);
    };
    setTimeout(step, delay);
  };
  window.zenType = typeOut;
  if (reduceMotion) window.zenType = () => {};

  if (!reduceMotion && 'IntersectionObserver' in window) {
    document.querySelectorAll('[data-type-now]').forEach((el) => typeOut(el, Number(el.dataset.typeDelay) || 900));
    const tio = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      tio.unobserve(en.target);
      en.target.querySelectorAll('[data-type]').forEach((em) => {
        const words = en.target.querySelectorAll('.w').length;
        typeOut(em, 350 + words * 70);
      });
    }), { rootMargin: '0px 0px -15% 0px' });
    document.querySelectorAll('h1, h2, h3').forEach((h) => { if (h.querySelector('[data-type]')) tio.observe(h); });

    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });

    document.querySelectorAll('.h-display:not(h1)').forEach((el) => { splitWords(el); io.observe(el); });
    // Stagger the parts of each section in reading order.
    document.querySelectorAll('main > section, .films > div').forEach((sec) => {
      let i = 0;
      sec.querySelectorAll(':scope [data-reveal]').forEach((el) => {
        if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', `${Math.min(i++, 5) * 80}ms`);
      });
    });
    document.querySelectorAll('[data-reveal], .shot, [data-shutter]').forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll('[data-reveal], .shot').forEach((el) => el.classList.add('is-in'));
  }

  // ---------- scroll-linked moves, one loop ----------
  const heroMark = document.querySelector('[data-hero-mark]');
  const heroFilm = document.querySelector('.hero-film');
  const footerMark = document.querySelector('[data-footer-mark]');
  const drifters = [...document.querySelectorAll('.shot-frame, .about-pic')];
  // Chapters: one wedding film per screen; scrolling moves from one to the next.
  const phone = window.matchMedia('(max-width: 760px)').matches;
  const chapterSets = reduceMotion ? [] : [...document.querySelectorAll('[data-chapters]')].map((wrap) => {
    const items = [...wrap.querySelectorAll('.chapter')];
    const nums = [...wrap.querySelectorAll('[data-ch-num]')];
    const fills = [...wrap.querySelectorAll('[data-ch-fill]')];
    const title = wrap.querySelector('[data-ch-title]');
    const meta = wrap.querySelector('[data-ch-meta]');
    let active = 0, loaded = false;
    const load = () => {
      if (loaded) return; loaded = true;
      items.forEach((it) => {
        const v = it.querySelector('.chapter-loop');
        if (!v) return;
        v.src = phone ? v.dataset.srcMobile : v.dataset.src;
        v.addEventListener('playing', () => v.classList.add('is-playing'));
      });
    };
    const play = (i) => items.forEach((it, j) => {
      const v = it.querySelector('.chapter-loop');
      if (!v) return;
      if (j === i) playSafe(v); else v.pause();
    });
    const swap = (el, text) => {
      if (!el || el.textContent === text) return;
      el.classList.remove('is-swap'); void el.offsetWidth;
      el.textContent = text; el.classList.add('is-swap');
    };
    const set = (i) => {
      if (i === active) return;
      active = i;
      nums.forEach((n, j) => n.classList.toggle('is-on', j === i));
      swap(title, items[i].dataset.title);
      swap(meta, items[i].dataset.meta);
      play(i);
    };
    return {
      update(vh) {
        const r = wrap.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) { if (loaded) items.forEach((it) => { const v = it.querySelector('.chapter-loop'); if (v) v.pause(); }); return; }
        load();
        // the stage grows out of the page as it arrives, then pins
        wrap.style.setProperty('--e', clamp(1 - r.top / vh, 0, 1).toFixed(4));
        const run = r.height - vh;
        const c = run > 0 ? clamp(-r.top / run, 0, 1) : 0;
        const n = items.length;
        const pos = c * n;                 // chapter j is centred when pos = j + 0.5
        // every value follows the scroll position directly, so a flick on a phone carries the film with it
        items.forEach((it, j) => {
          let d = pos - 0.5 - j;           // 0 = this chapter fills the screen; <0 still to come; >0 going
          if ((j === 0 && d < 0) || (j === n - 1 && d > 0)) d = 0;
          d = clamp(d, -1, 1.2);
          const a = d < 0 ? clamp(1 + (d + 0.18) / 0.42, 0, 1) : d > 1 ? 0 : 1;
          it.style.setProperty('--a', a.toFixed(3));
          it.style.setProperty('--k', d.toFixed(3));
          it.classList.toggle('is-off', a === 0);
        });
        const i = clamp(Math.round(pos - 0.5), 0, n - 1);
        fills.forEach((f, j) => f.style.setProperty('--fill', clamp(pos - j, 0, 1).toFixed(3)));
        if (r.top <= vh && r.bottom >= 0) { set(i); if (items[i].querySelector('.chapter-loop')?.paused) play(i); }
        else items.forEach((it) => { const v = it.querySelector('.chapter-loop'); if (v) v.pause(); });
      },
    };
  });
  // Once the wordmark has settled, a soft sheen crosses it.
  if (!reduceMotion) {
    const sheen = document.querySelectorAll('[data-sheen]');
    if (sheen.length) setTimeout(() => sheen.forEach((a) => { try { a.beginElement(); } catch (e) {} }), 3900);
  }

  // The edit: the playhead and timecode run along the timeline as the section passes.
  const edits = reduceMotion ? [] : [...document.querySelectorAll('[data-edit]')].map((sec) => {
    const suite = sec.querySelector('.suite');
    const tc = sec.querySelector('[data-edit-tc]');
    const v = sec.querySelector('.suite-loop');
    const two = (n) => String(n).padStart(2, '0');
    let loaded = false;
    return (vh) => {
      const r = suite.getBoundingClientRect();
      const on = r.bottom > 0 && r.top < vh;
      if (v) {
        if (on && !loaded) { loaded = true; v.src = phone ? v.dataset.srcMobile : v.dataset.src; v.addEventListener('playing', () => v.classList.add('is-playing')); }
        if (loaded) { if (on) { if (v.paused) playSafe(v); } else v.pause(); }
      }
      if (!on) return;
      const t = clamp((vh - r.top) / (vh + r.height), 0, 1);
      suite.style.setProperty('--t', t.toFixed(4));
      const frames = Math.round(t * 241 * 25);
      if (tc) tc.textContent = `00:${two(Math.floor(frames / 1500))}:${two(Math.floor(frames / 25) % 60)}:${two(frames % 25)}`;
    };
  });
  if (!reduceMotion) {
    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      if (heroEl && heroMark) {
        const p = clamp(window.scrollY / (heroEl.offsetHeight || vh), 0, 1);
        heroEl.style.setProperty('--p', p.toFixed(4));
      }
      for (const ch of chapterSets) ch.update(vh);
      for (const ed of edits) ed(vh);
      for (const el of drifters) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) continue;
        const t = clamp((r.top + r.height / 2 - vh / 2) / vh, -1, 1); // -1 above centre, 1 below
        el.style.setProperty('--drift', `${(t * -5).toFixed(2)}%`);
      }
      if (footerMark) {
        const r = footerMark.getBoundingClientRect();
        const f = clamp(1 - (r.bottom - vh) / (vh * 0.6), 0, 1);
        footerMark.style.setProperty('--f', f.toFixed(4));
      }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  // The wordmark at the foot of the page plays the reel through its letters.
  const footerEl = document.querySelector('.footer');
  if (footerMark && footerEl && !reduceMotion && 'IntersectionObserver' in window) {
    const reel = footerEl.querySelector('.footer-reel');
    let loaded = false;
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting) {
        if (!loaded) {
          loaded = true; reel.src = reel.dataset.src;
          reel.addEventListener('playing', () => footerEl.classList.add('is-playing'), { once: true });
        }
        playSafe(reel);
      } else if (loaded) reel.pause();
    }, { rootMargin: '200px 0px' }).observe(footerMark);
  }

  // ---------- film index: the frame shows the film you point at ----------
  document.querySelectorAll('[data-index]').forEach((index) => {
    const rows = [...index.querySelectorAll('.index-row')];
    const shots = [...index.querySelectorAll('.index-shot')];
    const set = (i) => {
      rows.forEach((r, j) => r.classList.toggle('is-active', j === i));
      shots.forEach((s, j) => s.classList.toggle('is-active', j === i));
    };
    rows.forEach((r, i) => {
      r.addEventListener('pointerenter', () => set(i));
      r.addEventListener('focusin', () => set(i));
    });
  });

  // ---------- pricing: pick photography, film or both ----------
  document.querySelectorAll('[data-offer]').forEach((offer) => {
    const data = JSON.parse(offer.querySelector('[data-offer-data]').textContent);
    const picks = [...offer.querySelectorAll('[data-pick]')];
    const extras = offer.querySelector('[data-extras]');
    const words = offer.querySelector('[data-offer-words]');
    const price = offer.querySelector('[data-offer-price]');
    const text = offer.querySelector('[data-offer-text]');
    const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const render = () => {
      const on = picks.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.pick);
      const key = on.length === 2 ? 'both' : on[0];
      const o = data[key];
      if (!o || price.textContent === o.price) return;
      words.textContent = o.words[0] + ' ';
      const em = document.createElement('em');
      em.textContent = o.words[1];
      words.appendChild(em);
      price.textContent = o.price;
      text.textContent = o.text;
      restart(words, 'swap');
      restart(price, 'roll-in');
      if (window.zenType) window.zenType(em, 180);
    };
    picks.forEach((b) => b.addEventListener('click', () => {
      const pressed = b.getAttribute('aria-pressed') === 'true';
      const others = picks.filter((x) => x !== b && x.getAttribute('aria-pressed') === 'true');
      if (pressed && !others.length) { picks.forEach((x) => x.setAttribute('aria-pressed', String(x !== b))); }
      else b.setAttribute('aria-pressed', String(!pressed));
      render();
      if (extras) extras.hidden = !picks.some((x) => x.dataset.pick === 'film' && x.getAttribute('aria-pressed') === 'true');
      const isOn = (k) => picks.some((x) => x.dataset.pick === k && x.getAttribute('aria-pressed') === 'true');
      if (window.zenPick) window.zenPick(isOn('photo'), isOn('film'));
    }));
  });

  // ---------- film player ----------
  const player = document.getElementById('player');
  const video = document.getElementById('player-video');
  const title = document.getElementById('player-title');
  document.querySelectorAll('[data-film-src]').forEach((btn) => {
    btn.addEventListener('click', () => {
      video.src = btn.dataset.filmSrc;
      video.poster = btn.dataset.filmPoster || '';
      title.textContent = btn.dataset.filmTitle || '';
      if (heroVideo) heroVideo.pause();
      player.showModal();
      playSafe(video);
    });
  });
  player.addEventListener('close', () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (heroVideo && !reduceMotion) playSafe(heroVideo);
  });

  // ---------- photo viewer ----------
  const lightbox = document.getElementById('lightbox');
  const lightImg = document.getElementById('lightbox-img');
  document.querySelectorAll('[data-photo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lightImg.src = btn.dataset.photo;
      lightImg.alt = btn.dataset.alt || '';
      lightbox.showModal();
    });
  });
  document.querySelectorAll('dialog').forEach((d) => {
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  });

  // ---------- "Check your date" and friends pre-select the enquiry type ----------
  const select = document.getElementById('enquiry-type');
  document.querySelectorAll('[data-enquiry]').forEach((a) => {
    a.addEventListener('click', () => {
      if (!select) return;
      const opt = [...select.options].find((o) => o.value === a.dataset.enquiry);
      if (opt) select.value = opt.value;
    });
  });

  // ---------- price calculator inside the enquiry form ----------
  const calc = document.querySelector('[data-calc]');
  if (calc) {
    const packs = [...calc.querySelectorAll('input[name="package"]')];
    const extrasBox = calc.querySelector('[data-calc-extras]');
    const extras = [...calc.querySelectorAll('input[name="extras"]')];
    const totalEl = calc.querySelector('[data-calc-total]');
    const est = calc.querySelector('[data-calc-estimate]');
    const money = (n) => '£' + Math.round(n).toLocaleString('en-GB');
    let shown = 0;
    const tween = (to) => {
      if (reduceMotion) { totalEl.textContent = money(to); shown = to; return; }
      const from = shown, t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 600); const e = 1 - Math.pow(1 - k, 3); totalEl.textContent = money(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); else shown = to; };
      requestAnimationFrame(step);
    };
    const update = (animate = true) => {
      const p = packs.find((x) => x.checked);
      const film = p && p.dataset.film === '1';
      extras.forEach((x) => { x.disabled = !film; if (!film) x.checked = false; });
      if (extrasBox) extrasBox.classList.toggle('is-off', !film);
      const chosen = extras.filter((x) => x.checked);
      const total = (p ? +p.dataset.price : 0) + chosen.reduce((a, x) => a + +x.dataset.price, 0);
      est.value = p ? [p.value, ...chosen.map((x) => x.value)].join(' + ') + ' = ' + money(total) : '';
      if (animate) tween(total); else { totalEl.textContent = money(total); shown = total; }
    };
    calc.addEventListener('change', () => update());
    update(false);
    // only weddings need it
    const type = document.getElementById('enquiry-type');
    const showCalc = () => { calc.hidden = type && type.value !== 'Wedding'; calc.disabled = calc.hidden; };
    if (type) { type.addEventListener('change', showCalc); showCalc(); }
    // choosing photography / film on the price card carries over to the form
    window.zenPick = (photo, film) => {
      const p = packs.find((x) => x.dataset.photo === (photo ? '1' : '0') && x.dataset.film === (film ? '1' : '0'));
      if (p && !p.checked) { p.checked = true; update(); }
    };
  }

  // ---------- enquiry form: send without leaving the page (falls back to /thank-you/ without JS) ----------
  const form = document.querySelector('.contact-form');
  if (form) {
    const status = form.querySelector('.form-status');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        const res = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)).toString(),
        });
        if (!res.ok) throw new Error(res.status);
        form.querySelectorAll('label, .field-row, button').forEach((el) => { el.hidden = true; });
        status.textContent = window.ZEN_THANKS || 'Thank you, we will be in touch soon.';
        status.hidden = false;
      } catch {
        btn.disabled = false;
        btn.textContent = 'Send enquiry';
        status.textContent = 'Sorry, that didn’t send. Please try again, or email us directly.';
        status.hidden = false;
      }
    });
  }
})();
