// Builds the Zen Visuals one-page site into ./dist
// Uses only Node's built-in modules, so there is nothing to install.
// Run locally with:  node build.mjs
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'dist');
// The public address used for Google, sharing previews and the sitemap.
const SITE_URL = (process.env.SITE_URL || 'https://zenvisuals.co.uk').replace(/\/$/, '');

const load = (f) => JSON.parse(readFileSync(join(ROOT, 'content', f), 'utf8'));
const site = load('site.json');
const { films } = load('films.json');
const { photos } = load('photos.json');
const { reviews } = load('reviews.json');

// ---------- helpers ----------
const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Read width/height of a JPEG or PNG so images reserve space while loading.
function imageSize(webPath) {
  try {
    const file = join(ROOT, webPath.replace(/^\//, ''));
    if (!existsSync(file)) return null;
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(256 * 1024);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < n) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch { /* fall through */ }
  return null;
}
const dims = (p) => { const d = imageSize(p); return d ? ` width="${d.w}" height="${d.h}"` : ''; };

const playIcon = (size = 16, color = '#F1EEE7') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 1.5v11l9-5.5z" fill="${color}"/></svg>`;

const filmButton = (f, cls = '') => `
  <button type="button" class="film-thumb ${cls}" data-film-src="${esc(f.video)}" data-film-title="${esc(f.title)}" data-film-poster="${esc(f.poster)}" aria-label="Play ${esc(f.title)}">
    <img src="${esc(f.poster)}" alt=""${dims(f.poster)} loading="lazy" decoding="async">
    <span class="play-ring">${playIcon(cls.includes('featured') ? 22 : 16)}</span>
  </button>`;

const filmCard = (f) => `
  <div class="film-card">
    ${filmButton(f)}
    <p class="film-title">${esc(f.title)}</p>
  </div>`;

const gallery = (items) => items.map((p) => `
    <button type="button" class="g-item g-${esc(p.size || 'normal')}" data-photo="${esc(p.image)}" data-alt="${esc(p.alt)}" aria-label="View larger: ${esc(p.alt)}">
      <img src="${esc(p.image)}" alt="${esc(p.alt)}"${dims(p.image)} loading="lazy" decoding="async">
    </button>`).join('');

// ---------- data ----------
const featured = films.find((f) => f.featured) || films[0];
const weddingFilms = films.filter((f) => f.category === 'wedding' && f !== featured);
const commercialFilms = films.filter((f) => f.category === 'commercial' && f !== featured);
const firstCommercial = commercialFilms[0];
const weddingPhotos = photos.filter((p) => p.category === 'wedding');
const commercialPhotos = photos.filter((p) => p.category === 'commercial');
const c = site.contact;
const telHref = 'tel:' + c.phone.replace(/[^0-9+]/g, '');

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  name: 'Zen Visuals',
  description: site.seo.description,
  url: SITE_URL + '/',
  image: SITE_URL + site.seo.share_image,
  logo: SITE_URL + '/media/brand/logo-ink.png',
  telephone: c.phone,
  email: c.email,
  areaServed: ['Derbyshire', 'United Kingdom'],
  address: { '@type': 'PostalAddress', addressRegion: 'Derbyshire', addressCountry: 'GB' },
  sameAs: [site.social.facebook, site.social.instagram].filter(Boolean),
  makesOffer: site.pricing.packages.map((p) => ({
    '@type': 'Offer',
    name: 'Wedding ' + p.name,
    price: p.price.replace(/[^0-9.]/g, ''),
    priceCurrency: 'GBP',
  })),
};

// ---------- page ----------
const page = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(site.seo.title)}</title>
<meta name="description" content="${esc(site.seo.description)}">
<link rel="canonical" href="${SITE_URL}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(site.seo.title)}">
<meta property="og:description" content="${esc(site.seo.description)}">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:image" content="${SITE_URL}${esc(site.seo.share_image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1A1916">
<link rel="icon" href="/media/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/media/brand/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/media/brand/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
<link rel="preload" as="image" href="${esc(site.hero.reel_poster)}">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

<header class="topbar" id="topbar">
  <a href="#top" class="topbar-logo" aria-label="Zen Visuals, back to top"><img src="/media/brand/logo-cream.png" alt="Zen Visuals"${dims('/media/brand/logo-cream.png')}></a>
  <nav aria-label="Main">
    <a href="#weddings">Weddings</a>
    <a href="#commercial">Commercial</a>
    <a href="#films">Films</a>
    <a href="#about">About</a>
    <a href="#pricing">Pricing</a>
    <a href="#contact" class="nav-cta">Contact</a>
  </nav>
</header>

<main id="main">

<section class="hero" id="top">
  <video class="hero-video" src="${esc(site.hero.reel)}" poster="${esc(site.hero.reel_poster)}" autoplay muted loop playsinline preload="metadata" aria-hidden="true"></video>
  <div class="hero-shade"></div>
  <div class="hero-inner">
    <h1 class="hero-logo"><img src="/media/brand/logo-cream.png" alt="Zen Visuals"${dims('/media/brand/logo-cream.png')}></h1>
    <p class="hero-tagline">${esc(site.hero.tagline)}</p>
  </div>
  <div class="hero-actions">
    <button type="button" class="btn-ghost" data-film-src="${esc(featured.video)}" data-film-title="${esc(featured.title)}" data-film-poster="${esc(featured.poster)}">${playIcon(10)}${esc(site.hero.button_text)}</button>
  </div>
</section>

<section class="wrap paths">
  <article id="weddings" class="path">
    <img src="${esc(site.weddings.image)}" alt="${esc(site.weddings.image_alt)}"${dims(site.weddings.image)} loading="lazy" decoding="async" class="path-img">
    <h2 class="path-title">${esc(site.weddings.title)}</h2>
    <p class="path-text">${esc(site.weddings.text)}</p>
    <a href="#contact" class="text-link" data-enquiry="Wedding">${esc(site.weddings.link_text)}</a>
  </article>
  <article id="commercial" class="path">
    ${firstCommercial ? `<button type="button" class="path-media" data-film-src="${esc(firstCommercial.video)}" data-film-title="${esc(firstCommercial.title)}" data-film-poster="${esc(firstCommercial.poster)}" aria-label="Play ${esc(firstCommercial.title)}">
      <img src="${esc(site.commercial.image)}" alt=""${dims(site.commercial.image)} loading="lazy" decoding="async" class="path-img">
      <span class="play-ring play-ring--lg">${playIcon(18)}</span>
    </button>` : `<img src="${esc(site.commercial.image)}" alt="${esc(site.commercial.image_alt)}"${dims(site.commercial.image)} loading="lazy" decoding="async" class="path-img">`}
    <h2 class="path-title">${esc(site.commercial.title)}</h2>
    <p class="path-text">${esc(site.commercial.text)}</p>
    <a href="#contact" class="text-link" data-enquiry="Advert / promo film">${esc(site.commercial.link_text)}</a>
  </article>
</section>

<section class="films" id="films">
  <div class="wrap">
    <h2 class="section-title">Films</h2>
    ${filmButton(featured, 'featured')}
    <p class="film-title film-title--featured">${esc(featured.title)}</p>
    ${weddingFilms.length ? `<p class="eyebrow">Weddings</p>
    <div class="film-grid film-grid--3">${weddingFilms.map(filmCard).join('')}</div>` : ''}
    ${commercialFilms.length ? `<p class="eyebrow eyebrow--spaced">Commercial</p>
    <div class="film-grid film-grid--2">${commercialFilms.map(filmCard).join('')}</div>` : ''}
  </div>
</section>

<section class="wrap photos" id="photos">
  <h2 class="section-title">Photographs</h2>
  <div class="gallery">${gallery(weddingPhotos)}
  </div>
  ${commercialPhotos.length ? `<p class="eyebrow eyebrow--dark eyebrow--spaced">Commercial</p>
  <div class="gallery">${gallery(commercialPhotos)}
  </div>` : ''}
</section>

<section class="wrap-narrow about" id="about">
  <img src="${esc(site.about.image)}" alt="${esc(site.about.image_alt)}"${dims(site.about.image)} loading="lazy" decoding="async" class="about-img">
  <div class="about-text">
    <h2 class="about-title">${esc(site.about.title)} <em>${esc(site.about.title_emphasis)}</em></h2>
    ${site.about.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}
  </div>
</section>

<section class="wrap-narrow reviews" id="reviews">
  <figure class="review-featured">
    <div class="stars" role="img" aria-label="5 out of 5 stars">★★★★★</div>
    <p class="rating">${esc(site.reviews.rating_text)}</p>
    <blockquote>“${esc(site.reviews.featured_quote)}”</blockquote>
    <figcaption>${esc(site.reviews.featured_name)}</figcaption>
  </figure>
  <div class="review-list">
    ${reviews.map((r) => `<figure class="review">
      <blockquote>“${esc(r.text)}”</blockquote>
      <figcaption>${esc(r.name)}</figcaption>
    </figure>`).join('\n    ')}
  </div>
</section>

<section class="wrap-narrow pricing" id="pricing">
  <h2 class="section-title">Pricing</h2>
  <p class="pricing-intro">${esc(site.pricing.intro)}</p>
  <div class="price-grid">
    ${site.pricing.packages.map((p) => `<div class="price-card${p.highlight ? ' price-card--dark' : ''}">
      <div class="price-head"><h3>${esc(p.name)}</h3>${p.badge ? `<span class="price-badge">${esc(p.badge)}</span>` : ''}</div>
      <div class="price">${esc(p.price)}</div>
      <p class="price-text">${esc(p.description)}</p>
      <a href="#contact" class="text-link" data-enquiry="Wedding">${esc(site.pricing.button_text)}</a>
    </div>`).join('\n    ')}
  </div>
  <div class="price-commercial">
    <div>
      <h3>${esc(site.pricing.commercial_title)}</h3>
      <p>${esc(site.pricing.commercial_text)}</p>
    </div>
    <a href="#contact" class="btn-dark" data-enquiry="Advert / promo film">${esc(site.pricing.commercial_button)}</a>
  </div>
</section>

<section class="contact" id="contact">
  <div class="wrap-narrow contact-inner">
    <div class="contact-intro">
      <h2 class="contact-title">${esc(c.title)} <em>${esc(c.title_emphasis)}</em></h2>
      <div class="contact-details">
        <a href="${telHref}">${esc(c.phone)}</a>
        <a href="mailto:${esc(c.email)}" class="underlined">${esc(c.email)}</a>
        <span class="muted">${esc(c.area)}</span>
      </div>
    </div>
    <form class="contact-form" name="enquiry" method="POST" action="/thank-you/" data-netlify="true" netlify-honeypot="company-website">
      <input type="hidden" name="form-name" value="enquiry">
      <p class="hidden-field"><label>Leave this empty <input name="company-website" tabindex="-1" autocomplete="off"></label></p>
      <div class="field-row">
        <label>Name<input type="text" name="name" autocomplete="name" required></label>
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
      </div>
      <div class="field-row">
        <label>Enquiry<select name="enquiry-type" id="enquiry-type">${c.enquiry_types.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
        <label>Date<input type="text" name="date" placeholder="DD / MM / YYYY" inputmode="numeric"></label>
      </div>
      <label>Phone (optional)<input type="tel" name="phone" autocomplete="tel"></label>
      <label>Message<textarea name="message" rows="4" required></textarea></label>
      <button type="submit" class="btn-light">Send enquiry</button>
      <p class="form-status" role="status" aria-live="polite" hidden></p>
    </form>
  </div>
  <footer class="footer wrap-narrow">
    <img src="/media/brand/logo-sage.png" alt="Zen Visuals"${dims('/media/brand/logo-sage.png')} loading="lazy" class="footer-logo">
    <div class="footer-links">
      ${site.social.instagram ? `<a href="${esc(site.social.instagram)}" rel="noopener" target="_blank">Instagram</a>` : ''}
      ${site.social.facebook ? `<a href="${esc(site.social.facebook)}" rel="noopener" target="_blank">Facebook</a>` : ''}
      <span>© ${new Date().getFullYear()} Zen Visuals</span>
    </div>
  </footer>
</section>

</main>

<dialog class="player" id="player" aria-label="Film player">
  <div class="player-bar">
    <span class="player-title" id="player-title"></span>
    <button type="button" class="btn-ghost btn-small" data-close>Close</button>
  </div>
  <video id="player-video" controls playsinline preload="none"></video>
</dialog>

<dialog class="lightbox" id="lightbox" aria-label="Photo viewer">
  <button type="button" class="btn-ghost btn-small lightbox-close" data-close>Close</button>
  <img id="lightbox-img" alt="">
</dialog>

<script>window.ZEN_THANKS = ${JSON.stringify(c.thank_you)};</script>
<script src="/assets/main.js" defer></script>
</body>
</html>
`;

const thanks = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thank you | Zen Visuals</title><meta name="robots" content="noindex">
<link rel="icon" href="/media/brand/favicon.svg" type="image/svg+xml">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css"></head>
<body class="simple-page"><main class="simple">
<img src="/media/brand/logo-sage.png" alt="Zen Visuals" class="simple-logo">
<h1>Thank you.</h1><p>${esc(c.thank_you)}</p>
<a href="/" class="btn-light">Back to the site</a>
</main></body></html>`;

const notFound = thanks
  .replace('<title>Thank you | Zen Visuals</title>', '<title>Page not found | Zen Visuals</title>')
  .replace('<h1>Thank you.</h1>', '<h1>Page not found.</h1>')
  .replace(`<p>${esc(c.thank_you)}</p>`, '<p>That page doesn\'t exist, but our films and photos do.</p>');

// ---------- write ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });
mkdirSync(join(OUT, 'thank-you'), { recursive: true });
cpSync(join(ROOT, 'media'), join(OUT, 'media'), { recursive: true });
cpSync(join(ROOT, 'src', 'styles.css'), join(OUT, 'assets', 'styles.css'));
cpSync(join(ROOT, 'src', 'main.js'), join(OUT, 'assets', 'main.js'));
writeFileSync(join(OUT, 'index.html'), page);
writeFileSync(join(OUT, 'thank-you', 'index.html'), thanks);
writeFileSync(join(OUT, '404.html'), notFound);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}/</loc></url></urlset>\n`);
console.log(`Built ${films.length} films, ${photos.length} photos, ${reviews.length} reviews -> dist/`);
