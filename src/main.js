// Zen Visuals: small enhancements, no libraries.
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Hero reel: keep muted for autoplay; pause for people who prefer less motion.
  const hero = document.querySelector('.hero-video');
  if (hero) {
    // Phones get a lighter version of the reel.
    if (hero.dataset.mobileSrc && window.matchMedia('(max-width: 760px)').matches) hero.src = hero.dataset.mobileSrc;
    hero.muted = true;
    if (reduceMotion) hero.pause();
    else { const p = hero.play(); if (p && p.catch) p.catch(() => {}); }
  }

  // Mobile menu.
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('mobile-menu');
  if (toggle && menu) {
    const setMenu = (open) => {
      document.documentElement.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
    };
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    window.matchMedia('(min-width: 761px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
  }

  // Typing effect: the line under the logo, and any [data-type] text when it scrolls into view.
  const typeOut = (el, delay = 0) => {
    const full = el.textContent.trim();
    if (!full) return;
    const h = el.getBoundingClientRect().height;
    el.setAttribute('aria-label', full);
    el.style.minHeight = h + 'px';
    el.innerHTML = '<span class="type-text" aria-hidden="true"></span><span class="type-caret" aria-hidden="true"></span>';
    const text = el.firstChild;
    const caret = el.lastChild;
    let i = 0;
    const step = () => {
      text.textContent = full.slice(0, ++i);
      if (i < full.length) setTimeout(step, full[i - 1] === ' ' ? 70 : 34 + Math.random() * 30);
      else { caret.classList.add('is-done'); el.style.minHeight = ''; }
    };
    setTimeout(step, delay);
  };
  if (!reduceMotion) {
    const tagline = document.querySelector('.hero-tagline');
    if (tagline) typeOut(tagline, 1100);
    const typeLater = document.querySelectorAll('[data-type]');
    if (typeLater.length && 'IntersectionObserver' in window) {
      const tio = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) { tio.unobserve(en.target); typeOut(en.target, 250); }
      }), { threshold: 0.6 });
      typeLater.forEach((el) => tio.observe(el));
    }
  }

  // Headings rise in word by word.
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
        } else if (child.nodeType === 1) walk(child);
      });
    };
    el.setAttribute('aria-label', el.textContent.trim());
    walk(el);
    el.classList.add('split');
  };

  // Gentle reveal as sections scroll into view.
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const sio = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); sio.unobserve(en.target); }
    }), { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('.section-title, .about-title, .path-title').forEach((el) => { splitWords(el); sio.observe(el); });

    const groups = [
      '.eyebrow', '.pricing-intro', '.path', '.film-thumb.featured', '.film-title--featured',
      '.film-card', '.about-text', '.review-featured', '.review', '.price-card', '.price-commercial',
      '.faq-item', '.prose > *', '.contact-intro', '.contact-form', '.related', '.footer > *',
    ];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const stagger = (els, cls) => els.forEach((el) => {
      const siblings = [...el.parentElement.children].filter((s) => s.matches(cls === 'reveal-img' ? '.g-item, .about-img' : '*'));
      const i = Math.max(0, siblings.indexOf(el)) % 4;
      el.style.setProperty('--d', `${i * 90}ms`);
      el.classList.add(cls);
      io.observe(el);
    });
    stagger(document.querySelectorAll(groups.join(',')), 'reveal');
    stagger(document.querySelectorAll('.g-item, .about-img'), 'reveal-img');
  }

  // Logo drifts up and fades as you scroll past the hero.
  const heroInner = document.querySelector('.hero-inner');
  if (heroInner && !reduceMotion) {
    heroInner.classList.add('hero-parallax');
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const h = heroInner.parentElement.offsetHeight || 1;
        const p = Math.min(1, Math.max(0, window.scrollY / h));
        if (p < 1) {
          heroInner.style.transform = `translate3d(0, ${p * -60}px, 0)`;
          heroInner.style.opacity = String(1 - p * 1.2);
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Menu bar tucks away while scrolling down and returns when scrolling up.
  const topbarEl = document.getElementById('topbar');
  if (topbarEl) {
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      const open = document.documentElement.classList.contains('menu-open');
      if (!open && y > 300 && y - lastY > 6) topbarEl.classList.add('is-hidden');
      else if (lastY - y > 6 || y < 300 || open) topbarEl.classList.remove('is-hidden');
      lastY = y;
    }, { passive: true });
  }

  // Top bar turns solid once you scroll past the hero.
  const bar = document.getElementById('topbar');
  const heroSection = document.querySelector('.hero');
  if (bar && heroSection && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      bar.classList.toggle('is-solid', !entry.isIntersecting);
    }, { rootMargin: '-80px 0px 0px 0px' }).observe(heroSection);
  }

  // Film player.
  const player = document.getElementById('player');
  const video = document.getElementById('player-video');
  const title = document.getElementById('player-title');
  document.querySelectorAll('[data-film-src]').forEach((btn) => {
    btn.addEventListener('click', () => {
      video.src = btn.dataset.filmSrc;
      video.poster = btn.dataset.filmPoster || '';
      title.textContent = btn.dataset.filmTitle || '';
      if (hero) hero.pause();
      player.showModal();
      const p = video.play(); if (p && p.catch) p.catch(() => {});
    });
  });
  player.addEventListener('close', () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (hero && !reduceMotion) { const p = hero.play(); if (p && p.catch) p.catch(() => {}); }
  });

  // Photo lightbox.
  const lightbox = document.getElementById('lightbox');
  const lightImg = document.getElementById('lightbox-img');
  document.querySelectorAll('[data-photo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lightImg.src = btn.dataset.photo;
      lightImg.alt = btn.dataset.alt || '';
      lightbox.showModal();
    });
  });

  // Close buttons, and click outside the content to close.
  document.querySelectorAll('dialog').forEach((d) => {
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  });

  // "Enquire" links pre-select the right enquiry type.
  const select = document.getElementById('enquiry-type');
  document.querySelectorAll('[data-enquiry]').forEach((a) => {
    a.addEventListener('click', () => {
      if (!select) return;
      const opt = [...select.options].find((o) => o.value === a.dataset.enquiry);
      if (opt) select.value = opt.value;
    });
  });

  // Enquiry form: send without leaving the page (falls back to /thank-you/ without JS).
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
