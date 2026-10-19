// Zen Visuals: small enhancements, no libraries.
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Hero reel: keep muted for autoplay; pause for people who prefer less motion.
  const hero = document.querySelector('.hero-video');
  if (hero) {
    hero.muted = true;
    if (reduceMotion) hero.pause();
    else { const p = hero.play(); if (p && p.catch) p.catch(() => {}); }
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
