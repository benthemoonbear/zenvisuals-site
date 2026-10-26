// Builds the Zen Visuals site into ./dist
// Uses only Node's built-in modules, so there is nothing to install.
// Run locally with:  node build.mjs
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, openSync, readSync, closeSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'dist');
// The public address used for Google, sharing previews and the sitemap.
const SITE_URL = (process.env.SITE_URL || 'https://zenvisuals.co.uk').replace(/\/$/, '');
const TODAY = new Date().toISOString().slice(0, 10);

const load = (f) => JSON.parse(readFileSync(join(ROOT, 'content', f), 'utf8'));
const site = load('site.json');
const { films } = load('films.json');
const { photos } = load('photos.json');
const { reviews } = load('reviews.json');
const faqFile = existsSync(join(ROOT, 'content', 'faq.json')) ? load('faq.json') : { faqs: [] };
const faqs = faqFile.faqs || [];
const faqTitle = faqFile.title || 'Questions';
const pagesDir = join(ROOT, 'content', 'pages');
const landingPages = existsSync(pagesDir)
  ? readdirSync(pagesDir).filter((f) => f.endsWith('.json')).sort().map((f) => load('pages/' + f)).filter((p) => p.slug)
  : [];

// ---------- helpers ----------
const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const abs = (u) => (/^https?:/.test(u) ? u : SITE_URL + u);
const isoDuration = (s) => `PT${Math.floor(s / 60)}M${Math.round(s % 60)}S`;
const fileOf = (webPath) => join(ROOT, webPath.replace(/^\//, ''));

// Read width/height of a JPEG or PNG so images reserve space while loading.
function imageSize(webPath) {
  try {
    const file = fileOf(webPath);
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

// <picture> with lighter WebP versions when they exist (photo-800.webp / photo-1600.webp).
function pic(src, alt, { cls = '', sizes = '100vw', eager = false } = {}) {
  const base = src.replace(/\.(jpe?g|png)$/i, '');
  const variants = [800, 1600, 2400].filter((w) => existsSync(fileOf(`${base}-${w}.webp`)));
  const img = `<img src="${esc(src)}" alt="${esc(alt)}"${dims(src)}${cls ? ` class="${cls}"` : ''} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  if (!variants.length) return img;
  const srcset = variants.map((w) => `${esc(base)}-${w}.webp ${w}w`).join(', ');
  return `<picture><source type="image/webp" srcset="${srcset}" sizes="${sizes}">${img}</picture>`;
}

const playIcon = (size = 14) =>
  `<svg class="i-play" width="${size}" height="${size}" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 1.5v11l9-5.5z" fill="currentColor"/></svg>`;

// The wordmark, traced from the logo so it stays sharp at any size. It takes the colour of the text around it.
const LOGO_SVG = readFileSync(join(ROOT, 'media', 'brand', 'logo.svg'), 'utf8');
const logo = (cls, label = 'Zen Visuals') => LOGO_SVG.replace('<path ', '<path pathLength="1" ').replace('<svg ', label
  ? `<svg class="${cls}" role="img" aria-label="${esc(label)}" focusable="false" `
  : `<svg class="${cls}" aria-hidden="true" focusable="false" `);

// Set the last few words of a heading in italic; they type themselves out when the heading arrives.
const emLast = (text, n = 2, attr = 'data-type') => {
  const w = String(text).trim().split(/\s+/);
  if (w.length <= n) return `<em ${attr}>${esc(text)}</em>`;
  return `${esc(w.slice(0, -n).join(' '))} <em ${attr}>${esc(w.slice(-n).join(' '))}</em>`;
};
const minutes = (s) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');
const filmAttrs = (f) => `data-film-src="${esc(f.video)}" data-film-title="${esc(f.title)}" data-film-poster="${esc(f.poster)}"`;
const kind = (f) => (f.category === 'commercial' ? 'Commercial film' : 'Wedding film');

// Films as an index of names, with one frame that shows the film you point at.
const filmIndex = (list) => `<div class="index" data-index>
    <ul class="index-list" role="list">
      ${list.map((f, i) => `<li class="index-row${i === 0 ? ' is-active' : ''}" data-i="${i}" data-reveal>
        <button type="button" class="index-btn" ${filmAttrs(f)} aria-label="Play ${esc(f.title)}, ${esc(kind(f).toLowerCase())}, ${minutes(f.duration_seconds)}">
          <span class="index-thumb">${pic(f.poster, `Still from ${f.title}, ${kind(f).toLowerCase()}`, { sizes: '(max-width: 760px) 100vw, 1px' })}</span>
          <span class="index-name">${esc(f.title)}</span>
          <span class="index-meta">${kind(f)}${f.duration_seconds ? ` · ${minutes(f.duration_seconds)}` : ''}</span>
        </button>
      </li>`).join('\n      ')}
    </ul>
    <div class="index-frame" aria-hidden="true">
      ${list.map((f, i) => `<div class="index-shot${i === 0 ? ' is-active' : ''}">${pic(f.poster, '', { sizes: '(max-width: 760px) 1px, 40vw' })}</div>`).join('\n      ')}
      <span class="index-play">${playIcon(12)} Play film</span>
    </div>
  </div>`;

// Photographs placed in staggered pairs, like prints on a wall. Clicking opens them larger.
// Portraits take four columns; a landscape takes seven when it leads a pair and four when it follows.
const isTall = (p) => { const d = imageSize(p.image); return d ? d.h > d.w : p.size === 'tall'; };
const shot = (p, j, col) => `<figure class="shot shot-${j + 1} ${isTall(p) ? 'shot--tall' : 'shot--wide'}" style="--col:${col}">
        <button type="button" class="shot-btn" data-photo="${esc(p.image)}" data-alt="${esc(p.alt)}" aria-label="View larger: ${esc(p.alt)}">
          <span class="shot-frame">${pic(p.image, p.alt, { sizes: '(max-width: 760px) 100vw, 58vw' })}</span>
        </button>
      </figure>`;
const stagger = (items) => {
  const pairs = [];
  for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));
  return `<div class="stagger">
    ${pairs.map((pair, i) => {
      const leftFirst = i % 2 === 0;
      const w1 = isTall(pair[0]) ? 4 : 7;
      const w2 = pair[1] ? (isTall(pair[1]) ? 4 : (w1 === 4 ? 6 : 4)) : 0;
      const c1 = leftFirst ? `1 / ${1 + w1}` : `${13 - w1} / 13`;
      const c2 = leftFirst ? `${13 - w2} / 13` : `${w2 === 4 ? 2 : 1} / ${(w2 === 4 ? 2 : 1) + w2}`;
      return `<div class="pair">
      ${shot(pair[0], 0, c1)}
      ${pair[1] ? shot(pair[1], 1, c2) : ''}
    </div>`;
    }).join('\n    ')}
  </div>`;
};

const faqList = (items) => `<div class="faq-list">
    ${items.map((f) => `<details class="faq-item" data-reveal>
      <summary><h3>${esc(f.question)}</h3><span class="chev" aria-hidden="true"></span></summary>
      <div class="faq-a"><p>${esc(f.answer)}</p></div>
    </details>`).join('\n    ')}
  </div>`;
const faqSchema = (items) => ({
  '@type': 'FAQPage',
  mainEntity: items.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
});

// ---------- data ----------
const featured = films.find((f) => f.featured) || films[0];
const weddingFilms = films.filter((f) => f.category === 'wedding' && f !== featured);
const commercialFilms = films.filter((f) => f.category === 'commercial' && f !== featured);
const firstCommercial = commercialFilms[0];
const weddingPhotos = photos.filter((p) => p.category === 'wedding');
const commercialPhotos = photos.filter((p) => p.category === 'commercial');
const c = site.contact;
const telHref = 'tel:' + c.phone.replace(/[^0-9+]/g, '');
const pageUrl = (slug) => `${SITE_URL}/${slug}/`;
const pageBySlug = (s) => landingPages.find((p) => p.slug === s);

const business = {
  '@type': 'ProfessionalService',
  '@id': SITE_URL + '/#business',
  name: 'Zen Visuals',
  founder: [{ '@type': 'Person', name: 'Zuzia' }, { '@type': 'Person', name: 'Ben' }],
  priceRange: '£750–£1,650',
  description: site.seo.description,
  url: SITE_URL + '/',
  image: SITE_URL + site.seo.share_image,
  logo: SITE_URL + '/media/brand/logo-ink.png',
  telephone: c.phone,
  email: c.email,
  areaServed: [c.town, 'Derbyshire', 'United Kingdom'].filter(Boolean),
  address: { '@type': 'PostalAddress', ...(c.town ? { addressLocality: c.town } : {}), addressRegion: 'Derbyshire', addressCountry: 'GB' },
  sameAs: [site.social.facebook, site.social.instagram, site.social.google_business].filter(Boolean),
  makesOffer: site.pricing.packages.map((p) => ({
    '@type': 'Offer',
    name: 'Wedding ' + p.name,
    price: p.price.replace(/[^0-9.]/g, ''),
    priceCurrency: 'GBP',
  })),
};
const website = { '@type': 'WebSite', '@id': SITE_URL + '/#website', url: SITE_URL + '/', name: 'Zen Visuals', publisher: { '@id': SITE_URL + '/#business' } };
const videoSchema = (f) => ({
  '@type': 'VideoObject',
  name: f.title,
  description: f.description || `${f.title}, filmed by Zen Visuals.`,
  thumbnailUrl: abs(f.poster),
  contentUrl: abs(f.video),
  uploadDate: f.date_added || '2026-10-19',
  ...(f.duration_seconds ? { duration: isoDuration(f.duration_seconds) } : {}),
  publisher: { '@id': SITE_URL + '/#business' },
});
const ldScript = (graph) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;

// ---------- shared page parts ----------
const head = ({ title, description, url, image, graph, preload }) => `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script>document.documentElement.classList.add('js')</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-video-preview:-1">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Zen Visuals">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${abs(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#1A1916">
<link rel="icon" href="/media/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/media/brand/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/media/brand/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400..600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
${preload ? `<link rel="preload" as="image" href="${esc(preload)}">` : ''}
${ldScript(graph)}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
`;

// base = '' on the homepage (links jump within the page) and '/' elsewhere.
const topbar = (base) => `<header class="bar" id="topbar">
  <a href="${base ? '/' : '#top'}" class="bar-logo" aria-label="Zen Visuals, ${base ? 'home' : 'back to top'}">${logo('bar-mark', '')}</a>
  <nav class="bar-nav" aria-label="Main">
    <a href="${base}#films">Films</a>
    <a href="${base}#photos">Photographs</a>
    <a href="${base}#pricing">Pricing</a>
    <a href="${base}#about">About</a>
    <a href="#contact" class="btn btn-accent bar-cta" data-enquiry="Wedding">Check your date</a>
  </nav>
  <button type="button" class="menu-toggle" aria-expanded="false" aria-controls="mobile-menu"><span class="menu-word">Menu</span></button>
</header>
<div class="mobile-menu" id="mobile-menu" inert>
  <nav aria-label="Mobile">
    <a href="${base}#weddings">Weddings</a>
    <a href="${base}#films">Films</a>
    <a href="${base}#photos">Photographs</a>
    <a href="${base}#about">About us</a>
    <a href="${base}#pricing">Pricing</a>
    ${faqs.length ? `<a href="${base}#faq">Questions</a>` : ''}
    <a href="#contact">Contact</a>
  </nav>
  ${landingPages.length ? `<div class="mobile-menu-sub">${landingPages.map((p) => `<a href="/${esc(p.slug)}/">${esc(p.nav_label || p.h1)}</a>`).join('')}</div>` : ''}
  <a href="${telHref}" class="mobile-menu-phone">${esc(c.phone)}</a>
</div>
`;

const reviewsBlock = () => `<section class="voices" id="reviews" aria-labelledby="reviews-title">
  <h2 class="h-head voices-title" id="reviews-title" data-reveal>Kind <em>words</em><span class="sr">: reviews from our couples and clients</span></h2>
  <figure class="voice-lead" data-reveal>
    <blockquote><p>“${esc(site.reviews.featured_quote)}”</p></blockquote>
    <figcaption>${esc(site.reviews.featured_name)}${site.social.google_business ? ` · <a href="${esc(site.social.google_business)}" rel="noopener" target="_blank">${esc(site.reviews.rating_text)}</a>` : ` · ${esc(site.reviews.rating_text)}`}</figcaption>
  </figure>
  <div class="voice-corners">
    ${reviews.map((r) => `<figure class="voice" data-reveal>
      <blockquote><p>“${esc(r.text)}”</p></blockquote>
      <figcaption>${esc(r.name)}</figcaption>
    </figure>`).join('\n    ')}
  </div>
</section>
`;

// Pricing as one sentence. Pick photographs, film or both and the sentence and price follow.
const pkg = (re) => site.pricing.packages.find((p) => re(p.name)) || {};
const offers = {
  both: { ...pkg((n) => /\+/.test(n)), words: ['Photo and film,', 'the whole day'] },
  photo: { ...pkg((n) => /photo/i.test(n) && !/\+|film/i.test(n)), words: ['Photography,', 'the whole day'] },
  film: { ...pkg((n) => /^film$/i.test(n.trim())), words: ['A film of', 'the whole day'] },
};
const num = (p) => Number(String(p || '').replace(/[^0-9.]/g, '')) || 0;
const saving = num(offers.photo.price) + num(offers.film.price) - num(offers.both.price);
const offerText = (o) => `${o.description || ''}${o === offers.both && saving > 0 ? ` Booking both saves £${saving.toLocaleString('en-GB')}.` : ''}`;
const pricingBlock = (withCommercial = true) => `<section class="offer" id="pricing" data-offer aria-labelledby="pricing-title">
  <div class="offer-pick" role="group" aria-label="What would you like?" data-reveal>
    <button type="button" class="pick" aria-pressed="true" data-pick="photo">Photography</button>
    <button type="button" class="pick" aria-pressed="true" data-pick="film">Film</button>
  </div>
  <h2 class="offer-title" id="pricing-title" aria-live="polite" data-reveal><span class="sr">Wedding photography and film prices: </span><span class="offer-words" data-offer-words>${esc(offers.both.words[0])} <em data-type>${esc(offers.both.words[1])}</em></span> <span class="price-chip"><span data-offer-price>${esc(offers.both.price)}</span></span></h2>
  <div class="offer-foot" data-reveal>
    <div class="offer-copy">
      <p class="offer-text" data-offer-text>${esc(offerText(offers.both))}</p>
      <p class="offer-note">${esc(site.pricing.intro)} Half secures your date; the rest is due any time up to two weeks after the wedding.</p>
    </div>
    <div class="offer-actions">
      <a href="#contact" class="btn btn-accent" data-enquiry="Wedding">${esc(site.pricing.button_text)}</a>
      ${withCommercial ? `<a href="#contact" class="text-link" data-enquiry="Advert / promo film">Commercial work is quoted per project</a>` : ''}
    </div>
  </div>
  <script type="application/json" data-offer-data>${JSON.stringify(Object.fromEntries(Object.entries(offers).map(([k, o]) => [k, { words: o.words, price: o.price, text: offerText(o) }]))).replace(/</g, '\\u003c')}</script>
</section>
`;

const faqBlock = (title, items) => `<section class="faq" id="faq" aria-labelledby="faq-title">
  <h2 class="h-display faq-title" id="faq-title">${emLast(title, 2)}</h2>
  ${faqList(items)}
</section>
`;

const contactAndFooter = (enquiryDefault = '') => `<section class="contact" id="contact" aria-labelledby="contact-title">
  <div class="contact-top">
    <h2 class="h-display contact-title" id="contact-title">${esc(c.title)} <em data-type>${esc(c.title_emphasis)}</em></h2>
    <div class="contact-intro" data-reveal>
      <p>Tell us your date, your venue and what you have in mind. Weddings, adverts, promo films and events.</p>
    </div>
    <form class="contact-form" name="enquiry" method="POST" action="/thank-you/" data-netlify="true" netlify-honeypot="company-website" data-reveal>
      <input type="hidden" name="form-name" value="enquiry">
      <p class="hidden-field"><label>Leave this empty <input name="company-website" tabindex="-1" autocomplete="off"></label></p>
      <div class="field-row">
        <label>Name<input type="text" name="name" autocomplete="name" required></label>
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
      </div>
      <div class="field-row">
        <label>Enquiry<select name="enquiry-type" id="enquiry-type">${c.enquiry_types.map((t) => `<option${t === enquiryDefault ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label>Date<input type="text" name="date" placeholder="DD / MM / YYYY" inputmode="numeric"></label>
      </div>
      <label>Phone (optional)<input type="tel" name="phone" autocomplete="tel"></label>
      <label>Message<textarea name="message" rows="4" required></textarea></label>
      <button type="submit" class="btn btn-light">Send enquiry</button>
      <p class="form-status" role="status" aria-live="polite" hidden></p>
    </form>
  </div>
  <a class="contact-email" href="mailto:${esc(c.email)}" data-reveal>${esc(c.email).replace('@', '@<wbr>')}</a>
  <div class="contact-corners">
    <p><a href="${telHref}">${esc(c.phone)}</a></p>
    <p>${esc(c.area)}</p>
    <p>
      ${site.social.instagram ? `<a href="${esc(site.social.instagram)}" rel="noopener" target="_blank">Instagram</a>` : ''}
      ${site.social.facebook ? `<a href="${esc(site.social.facebook)}" rel="noopener" target="_blank">Facebook</a>` : ''}
      ${site.social.google_business ? `<a href="${esc(site.social.google_business)}" rel="noopener" target="_blank">Google reviews</a>` : ''}
    </p>
  </div>
</section>
</main>
<footer class="footer">
  <div class="footer-cols">
    ${landingPages.length ? `<nav class="footer-col" aria-label="Services"><p>Services</p>
      ${landingPages.map((p) => `<a href="/${esc(p.slug)}/">${esc(p.nav_label || p.h1)}</a>`).join('\n      ')}
    </nav>` : ''}
    <div class="footer-col"><p>Contact</p><a href="${telHref}">${esc(c.phone)}</a><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>
    <div class="footer-col"><p>Follow</p>
      ${site.social.instagram ? `<a href="${esc(site.social.instagram)}" rel="noopener" target="_blank">Instagram</a>` : ''}
      ${site.social.facebook ? `<a href="${esc(site.social.facebook)}" rel="noopener" target="_blank">Facebook</a>` : ''}
      ${site.social.google_business ? `<a href="${esc(site.social.google_business)}" rel="noopener" target="_blank">Google reviews</a>` : ''}
    </div>
    ${site.contact.areas ? `<div class="footer-col"><p>Where we work</p><span>${esc(site.contact.areas)}</span></div>` : ''}
  </div>
  <div class="footer-mark" data-footer-mark>
    ${logo('footer-logo', 'Zen Visuals')}
  </div>
  <div class="footer-bg" aria-hidden="true">
    <video class="footer-reel" data-src="${esc(site.hero.reel_mobile || site.hero.reel)}" poster="${esc(site.hero.reel_poster)}" muted loop playsinline preload="none"></video>
  </div>
  <p class="footer-legal">© ${new Date().getFullYear()} Zen Visuals · Wedding photographers &amp; videographers in ${esc(c.town || 'Derbyshire')}, Derbyshire</p>
</footer>
`;

const dialogsAndScripts = () => `
<dialog class="player" id="player" aria-label="Film player">
  <div class="player-bar">
    <span class="player-title" id="player-title"></span>
    <button type="button" class="btn btn-ghost" data-close>Close</button>
  </div>
  <video id="player-video" controls playsinline preload="none"></video>
</dialog>

<dialog class="lightbox" id="lightbox" aria-label="Photo viewer">
  <button type="button" class="btn btn-ghost lightbox-close" data-close>Close</button>
  <img id="lightbox-img" alt="">
</dialog>

<script>window.ZEN_THANKS = ${JSON.stringify(c.thank_you)};</script>
<script src="/assets/main.js" defer></script>
</body>
</html>
`;

const moreLink = (slug, text) => { const p = pageBySlug(slug); return p ? `<a href="/${esc(p.slug)}/" class="text-link">${esc(text || p.nav_label)}</a>` : ''; };

// ---------- homepage ----------
const homeGraph = [business, website, ...films.filter((f) => f.video).map(videoSchema)];
if (faqs.length) homeGraph.push(faqSchema(faqs));
const otherFilms = films.filter((f) => f !== featured);
const galleryPhotos = weddingPhotos.filter((p) => p.image !== site.weddings.image);

const home = head({ title: site.seo.title, description: site.seo.description, url: SITE_URL + '/', image: site.seo.share_image, graph: homeGraph, preload: site.hero.reel_poster })
+ topbar('') + `
<main id="main">

<section class="hero" id="top" data-hero>
  <div class="hero-film">
    <video class="hero-video" data-desktop="${esc(site.hero.reel)}" data-mobile="${esc(site.hero.reel_mobile || site.hero.reel)}" poster="${esc(site.hero.reel_poster)}" autoplay muted loop playsinline webkit-playsinline disablepictureinpicture disableremoteplayback preload="auto" aria-hidden="true"></video>
    <script>(function (v) {
      var phone = window.matchMedia('(max-width: 760px)').matches;
      v.muted = true; v.defaultMuted = true; v.setAttribute('muted', '');
      v.src = phone ? v.dataset.mobile : v.dataset.desktop;
      var start = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
      start();
      // Low Power Mode and some browsers block autoplay: try again on the first touch or scroll.
      var retry = function () { if (v.paused) start(); };
      ['touchstart', 'scroll', 'click'].forEach(function (e) { window.addEventListener(e, retry, { passive: true, once: true }); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) retry(); });
    })(document.currentScript.previousElementSibling);</script>
    <noscript><style>.hero-video { display: none; }</style></noscript>
  </div>
  <div class="hero-copy">
    <h1 class="hero-title" data-load style="--d:2600ms"><span data-type-now data-type-delay="2900">${esc(site.hero.tagline)}</span></h1>
    <p class="hero-sub" data-load style="--d:2750ms">Zuzia and Ben, based in ${esc(c.town || 'Derbyshire')}. One price for your whole day.</p>
    <button type="button" class="btn btn-light hero-play" data-load style="--d:2900ms" ${filmAttrs(featured)}>${playIcon(11)}${esc(site.hero.button_text)}</button>
  </div>
  <div class="hero-mark" data-hero-mark>${logo('hero-logo', 'Zen Visuals')}</div>
</section>

<section class="intro" id="weddings" aria-labelledby="weddings-title">
  <div class="intro-top">
    <h2 class="h-display" id="weddings-title">Your whole <em data-type>wedding day</em></h2>
    <p class="intro-note" data-reveal>${esc(site.weddings.text)}</p>
  </div>
  <dl class="facts">
    <div data-reveal><dt>Whole day</dt><dd>From getting ready to the last dance</dd></div>
    <div data-reveal><dt>3–6 min</dt><dd>The length of your wedding film</dd></div>
    <div data-reveal><dt>3–6 weeks</dt><dd>Until your photos and film arrive</dd></div>
    <div data-reveal><dt>From ${esc(offers.photo.price || '£750')}</dt><dd>One price for the day, never by the hour</dd></div>
  </dl>
  <div class="intro-bottom">
    <div class="intro-links" data-reveal>
      ${site.weddings.venues ? `<p>${esc(site.weddings.venues)}</p>` : ''}
      <div class="link-row">
        <a href="#contact" class="btn btn-accent" data-enquiry="Wedding">${esc(site.weddings.link_text)}</a>
        ${moreLink('wedding-videographer-derbyshire', 'Wedding films')}
        ${moreLink('wedding-photographer-derbyshire', 'Wedding photography')}
      </div>
    </div>
    <figure class="intro-pic" data-shutter>
      <span class="shot-frame">${pic(site.weddings.image, site.weddings.image_alt, { sizes: '(max-width: 760px) 100vw, 58vw' })}</span>
    </figure>
  </div>
</section>

<section class="films" id="films" aria-labelledby="films-title">
  <div class="films-head">
    <h2 class="h-display" id="films-title">Our <em data-type>films</em><span class="sr">: wedding and commercial films from Derbyshire</span></h2>
    <p data-reveal>Wedding films of three to six minutes, and short films for businesses. Press play on any of them.</p>
  </div>
  <div class="opening" data-opening>
    <div class="opening-stage">
      <div class="opening-pic">${pic(featured.poster, `Still from ${featured.title}, ${kind(featured).toLowerCase()} by Zen Visuals`, { sizes: '100vw' })}</div>
      <div class="opening-caption">
        <h3 class="h-head">${esc(featured.title)}</h3>
        <button type="button" class="btn btn-light" ${filmAttrs(featured)}>${playIcon(11)}Play the film${featured.duration_seconds ? ` · ${minutes(featured.duration_seconds)}` : ''}</button>
      </div>
    </div>
  </div>
  ${filmIndex(otherFilms)}
  <div class="commercial" id="commercial">
    <h3 class="h-head" data-reveal>${esc(site.commercial.title)}</h3>
    <p data-reveal>${esc(site.commercial.text)}</p>
    <div class="link-row" data-reveal>
      <a href="#contact" class="btn btn-light" data-enquiry="Advert / promo film">${esc(site.commercial.link_text)}</a>
      ${moreLink('video-production-derbyshire', 'Video production')}
    </div>
  </div>
</section>

<section class="photos" id="photos" aria-labelledby="photos-title">
  <h2 class="h-display" id="photos-title">In <em data-type>photographs</em><span class="sr">: wedding photography in Derbyshire</span></h2>
  ${stagger(galleryPhotos)}
</section>

<section class="about" id="about" aria-labelledby="about-title">
  <div class="about-side" data-reveal>
    <figure class="about-pic">${pic(site.about.image, site.about.image_alt, { sizes: '240px' })}</figure>
    <dl class="about-facts">
      <div><dt>Who</dt><dd>Zuzia and Ben</dd></div>
      <div><dt>Based in</dt><dd>${esc(c.town || 'Derbyshire')}, Derbyshire</dd></div>
      <div><dt>Married</dt><dd>March 2023</dd></div>
    </dl>
  </div>
  <div class="about-main">
    <h2 class="h-display about-title" id="about-title">${esc(site.about.title)} <em data-type>${esc(site.about.title_emphasis)}</em></h2>
    ${site.about.paragraphs.map((p) => `<p class="about-text" data-reveal>${esc(p)}</p>`).join('\n    ')}
    <div class="about-record">
      <div data-reveal><h3>Venues</h3><ul role="list"><li>Shottle Hall</li><li>West Mill, Darley Abbey</li><li>Weddings in London</li></ul></div>
      <div data-reveal><h3>Where we work</h3><ul role="list"><li>Belper and Derby</li><li>Matlock and Ashbourne</li><li>The Peak District</li><li>The rest of the UK</li></ul></div>
    </div>
  </div>
</section>

${reviewsBlock()}
${pricingBlock(true)}
${faqs.length ? faqBlock(faqTitle, faqs) : ''}
${contactAndFooter()}` + dialogsAndScripts();

// ---------- landing pages ----------
function landing(p) {
  const url = pageUrl(p.slug);
  const pFilms = p.film_category ? films.filter((f) => f.category === p.film_category) : [];
  const pPhotos = p.photo_category ? photos.filter((x) => x.category === p.photo_category && x.image !== p.hero_image).slice(0, p.photo_limit || 9) : [];
  const isCommercial = p.film_category === 'commercial' || p.photo_category === 'commercial';
  const graph = [
    business,
    {
      '@type': 'WebPage', '@id': url, url, name: p.seo_title, description: p.seo_description,
      isPartOf: { '@id': SITE_URL + '/#website' }, about: { '@id': SITE_URL + '/#business' },
      primaryImageOfPage: abs(p.hero_image),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL + '/' },
        { '@type': 'ListItem', position: 2, name: p.nav_label || p.h1, item: url },
      ],
    },
    {
      '@type': 'Service',
      name: p.h1,
      serviceType: p.eyebrow || p.nav_label,
      provider: { '@id': SITE_URL + '/#business' },
      areaServed: [c.town, 'Derbyshire', 'United Kingdom'].filter(Boolean),
      ...(p.show_pricing ? { offers: site.pricing.packages.map((x) => ({ '@type': 'Offer', name: 'Wedding ' + x.name, price: x.price.replace(/[^0-9.]/g, ''), priceCurrency: 'GBP' })) } : {}),
    },
    ...pFilms.map(videoSchema),
  ];
  if (p.faqs && p.faqs.length) graph.push(faqSchema(p.faqs));
  const others = landingPages.filter((x) => x.slug !== p.slug);
  const enquiry = isCommercial ? 'Advert / promo film' : 'Wedding';

  return head({ title: p.seo_title, description: p.seo_description, url, image: p.hero_image, graph, preload: null })
  + topbar('/') + `
<main id="main">

<section class="phero" id="top" data-hero>
  <div class="phero-copy">
    <nav class="breadcrumb" aria-label="Breadcrumb" data-load style="--d:100ms"><a href="/">Home</a> <span aria-hidden="true">/</span> <span>${esc(p.nav_label || p.h1)}</span></nav>
    <h1 class="h-display${p.h1.length > 40 ? ' is-long' : ''}" data-load style="--d:180ms">${emLast(p.h1, 2, 'data-type-now')}</h1>
    ${p.intro && p.intro[0] ? `<p class="phero-lead" data-load style="--d:300ms">${esc(p.intro[0])}</p>` : ''}
    <a href="#contact" class="btn btn-accent" data-enquiry="${enquiry}" data-load style="--d:420ms">${isCommercial ? 'Get a quote' : 'Check your date'}</a>
  </div>
  <figure class="phero-pic" data-hero-pic>${pic(p.hero_image, p.hero_alt, { sizes: '(max-width: 760px) 100vw, 50vw', eager: true })}</figure>
</section>

<section class="story" aria-label="${esc(p.nav_label || p.h1)}">
  ${(p.intro || []).slice(1).map((x) => `<p class="story-lead" data-reveal>${esc(x)}</p>`).join('\n  ')}
  ${(p.sections || []).map((s) => `<div class="story-row">
    <h2 class="h-head" data-reveal>${esc(s.heading)}</h2>
    <p data-reveal>${esc(s.text)}</p>
  </div>`).join('\n  ')}
</section>

${pFilms.length ? `<section class="films films--page" id="films" aria-labelledby="films-title">
  <div class="films-head"><h2 class="h-display" id="films-title">Our <em data-type>films</em><span class="sr">: ${esc((p.nav_label || '').toLowerCase())} in Derbyshire</span></h2></div>
  ${filmIndex(pFilms)}
</section>` : ''}

${pPhotos.length ? `<section class="photos" id="photos" aria-labelledby="photos-title">
  <h2 class="h-display" id="photos-title">In <em data-type>photographs</em><span class="sr">: ${isCommercial ? 'commercial and product photography' : 'wedding photography'} in Derbyshire</span></h2>
  ${stagger(pPhotos)}
</section>` : ''}

${isCommercial ? '' : reviewsBlock()}
${p.show_pricing ? pricingBlock(false) : ''}
${p.faqs && p.faqs.length ? faqBlock(`Questions about ${(p.nav_label || 'our work').toLowerCase()}`, p.faqs) : ''}

${others.length ? `<section class="related" aria-labelledby="related-title">
  <h2 class="h-head" id="related-title">More from <em>Zen Visuals</em></h2>
  <div class="related-links">
    <a href="/">Home</a>
    ${others.map((o) => `<a href="/${esc(o.slug)}/">${esc(o.nav_label || o.h1)}</a>`).join('\n    ')}
  </div>
</section>` : ''}

${contactAndFooter(enquiry)}` + dialogsAndScripts();
}

// ---------- simple pages ----------
const simplePage = (title, heading, text) => `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Zen Visuals</title><meta name="robots" content="noindex">
<link rel="icon" href="/media/brand/favicon.svg" type="image/svg+xml">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400..600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css"></head>
<body class="simple-page"><main class="simple">
${logo('simple-logo', 'Zen Visuals')}
<h1 class="h-display">${esc(heading)}</h1><p>${esc(text)}</p>
<a href="/" class="btn btn-accent">Back to the site</a>
</main></body></html>`;
const thanks = simplePage('Thank you', 'Thank you.', c.thank_you);
const notFound = simplePage('Page not found', 'Page not found.', 'That page doesn\'t exist, but our films and photos do.');

// ---------- sitemap (pages, images and videos) ----------
const imgTags = (list) => list.map((src) => `<image:image><image:loc>${esc(abs(src))}</image:loc></image:image>`).join('');
const vidTags = (list) => list.filter((f) => f.video).map((f) => `<video:video><video:thumbnail_loc>${esc(abs(f.poster))}</video:thumbnail_loc><video:title>${esc(f.title)}</video:title><video:description>${esc(f.description || f.title)}</video:description><video:content_loc>${esc(abs(f.video))}</video:content_loc>${f.duration_seconds ? `<video:duration>${Math.round(f.duration_seconds)}</video:duration>` : ''}<video:publication_date>${esc(f.date_added || '2026-10-19')}</video:publication_date></video:video>`).join('');
const sitemapEntries = [
  `<url><loc>${SITE_URL}/</loc><lastmod>${TODAY}</lastmod>${imgTags(photos.map((p) => p.image))}${vidTags(films)}</url>`,
  ...landingPages.map((p) => {
    const pPhotos = p.photo_category ? photos.filter((x) => x.category === p.photo_category).slice(0, p.photo_limit || 9) : [];
    const pFilms = p.film_category ? films.filter((f) => f.category === p.film_category) : [];
    return `<url><loc>${pageUrl(p.slug)}</loc><lastmod>${TODAY}</lastmod>${imgTags([p.hero_image, ...pPhotos.map((x) => x.image)])}${vidTags(pFilms)}</url>`;
  }),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${sitemapEntries.join('\n')}
</urlset>
`;

// ---------- llms.txt (a plain summary for AI search tools) ----------
const llms = `# Zen Visuals

> Wedding and commercial photography and film by Zuzia and Ben, based in ${c.town || 'Derbyshire'}, Derbyshire, UK, working across the UK.

## Key facts
- Wedding photography: ${site.pricing.packages.find((p) => /photo/i.test(p.name) && !/film/i.test(p.name))?.price || ''} for the whole day
- Wedding film: ${site.pricing.packages.find((p) => p.name === 'Film')?.price || ''} for the whole day
- Photography and film together: ${site.pricing.packages.find((p) => /\+/.test(p.name))?.price || ''}
- One price for the whole day, no hourly packages
${faqs.map((f) => `- ${f.question} ${f.answer}`).join('\n')}
- Rating: ${site.reviews.rating_text}
- Contact: ${c.phone}, ${c.email}

## Pages
- [Home](${SITE_URL}/): films, photographs, pricing, reviews and enquiries
${landingPages.map((p) => `- [${p.h1}](${pageUrl(p.slug)}): ${p.seo_description}`).join('\n')}

## Films
${films.map((f) => `- ${f.title} (${f.category}): ${f.description || ''}`).join('\n')}
`;

// ---------- write ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });
mkdirSync(join(OUT, 'thank-you'), { recursive: true });
cpSync(join(ROOT, 'media'), join(OUT, 'media'), { recursive: true });
cpSync(join(ROOT, 'src', 'styles.css'), join(OUT, 'assets', 'styles.css'));
cpSync(join(ROOT, 'src', 'main.js'), join(OUT, 'assets', 'main.js'));
writeFileSync(join(OUT, 'index.html'), home);
for (const p of landingPages) {
  mkdirSync(join(OUT, p.slug), { recursive: true });
  writeFileSync(join(OUT, p.slug, 'index.html'), landing(p));
}
writeFileSync(join(OUT, 'thank-you', 'index.html'), thanks);
writeFileSync(join(OUT, '404.html'), notFound);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
writeFileSync(join(OUT, 'sitemap.xml'), sitemap);
writeFileSync(join(OUT, 'llms.txt'), llms);
console.log(`Built home + ${landingPages.length} pages, ${films.length} films, ${photos.length} photos, ${reviews.length} reviews -> dist/`);
