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
  const variants = [800, 1600].filter((w) => existsSync(fileOf(`${base}-${w}.webp`)));
  const img = `<img src="${esc(src)}" alt="${esc(alt)}"${dims(src)}${cls ? ` class="${cls}"` : ''} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  if (!variants.length) return img;
  const srcset = variants.map((w) => `${esc(base)}-${w}.webp ${w}w`).join(', ');
  return `<picture><source type="image/webp" srcset="${srcset}" sizes="${sizes}">${img}</picture>`;
}

const playIcon = (size = 16, color = '#F1EEE7') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 1.5v11l9-5.5z" fill="${color}"/></svg>`;

const filmButton = (f, cls = '') => `
  <button type="button" class="film-thumb ${cls}" data-film-src="${esc(f.video)}" data-film-title="${esc(f.title)}" data-film-poster="${esc(f.poster)}" aria-label="Play ${esc(f.title)}">
    ${pic(f.poster, '', { sizes: cls.includes('featured') ? '(max-width: 1280px) 100vw, 1216px' : '(max-width: 760px) 100vw, 50vw' })}
    <span class="play-ring">${playIcon(cls.includes('featured') ? 22 : 16)}</span>
  </button>`;

const filmCard = (f) => `
  <div class="film-card">
    ${filmButton(f)}
    <p class="film-title">${esc(f.title)}</p>
  </div>`;

const gallery = (items) => items.map((p) => `
    <button type="button" class="g-item g-${esc(p.size || 'normal')}" data-photo="${esc(p.image)}" data-alt="${esc(p.alt)}" aria-label="View larger: ${esc(p.alt)}">
      ${pic(p.image, p.alt, { sizes: p.size === 'full' ? '100vw' : p.size === 'wide' ? '(max-width: 760px) 100vw, 66vw' : '(max-width: 760px) 50vw, 33vw' })}
    </button>`).join('');

const faqList = (items, openFirst = true) => `<div class="faq-list">
    ${items.map((f, i) => `<details class="faq-item"${openFirst && i === 0 ? ' open' : ''}>
      <summary><h3>${esc(f.question)}</h3></summary>
      <p>${esc(f.answer)}</p>
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
<meta name="viewport" content="width=device-width, initial-scale=1">
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
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
${preload ? `<link rel="preload" as="image" href="${esc(preload)}">` : ''}
${ldScript(graph)}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
`;

// base = '' on the homepage (links jump within the page) and '/' elsewhere.
const topbar = (base) => `<header class="topbar" id="topbar">
  <a href="${base ? '/' : '#top'}" class="topbar-logo" aria-label="Zen Visuals, ${base ? 'home' : 'back to top'}"><img src="/media/brand/logo-cream.png" alt="Zen Visuals"${dims('/media/brand/logo-cream.png')}></a>
  <nav aria-label="Main">
    <a href="${base}#weddings">Weddings</a>
    <a href="${base}#commercial">Commercial</a>
    <a href="${base}#films">Films</a>
    <a href="${base}#about">About</a>
    <a href="${base}#pricing">Pricing</a>
    ${faqs.length ? `<a href="${base}#faq">FAQ</a>` : ''}
    <a href="${base ? '' : ''}#contact" class="nav-cta">Contact</a>
  </nav>
</header>
`;

const reviewsBlock = () => `<section class="wrap-narrow reviews" id="reviews">
  <figure class="review-featured">
    <div class="stars" role="img" aria-label="5 out of 5 stars">★★★★★</div>
    <p class="rating">${site.social.google_business ? `<a href="${esc(site.social.google_business)}" rel="noopener" target="_blank">${esc(site.reviews.rating_text)}</a>` : esc(site.reviews.rating_text)}</p>
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
`;

const pricingBlock = (withCommercial = true) => `<section class="wrap-narrow pricing" id="pricing">
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
  ${withCommercial ? `<div class="price-commercial">
    <div>
      <h3>${esc(site.pricing.commercial_title)}</h3>
      <p>${esc(site.pricing.commercial_text)}</p>
    </div>
    <a href="#contact" class="btn-dark" data-enquiry="Advert / promo film">${esc(site.pricing.commercial_button)}</a>
  </div>` : ''}
</section>
`;

const contactAndFooter = (enquiryDefault = '') => `<section class="contact" id="contact">
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
        <label>Enquiry<select name="enquiry-type" id="enquiry-type">${c.enquiry_types.map((t) => `<option${t === enquiryDefault ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
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
    ${landingPages.length ? `<nav class="footer-services" aria-label="Services">
      ${landingPages.map((p) => `<a href="/${esc(p.slug)}/">${esc(p.nav_label || p.h1)}</a>`).join('\n      ')}
    </nav>` : ''}
    ${site.contact.areas ? `<p class="footer-areas">${esc(site.contact.areas)}</p>` : ''}
    <div class="footer-links">
      ${site.social.instagram ? `<a href="${esc(site.social.instagram)}" rel="noopener" target="_blank">Instagram</a>` : ''}
      ${site.social.facebook ? `<a href="${esc(site.social.facebook)}" rel="noopener" target="_blank">Facebook</a>` : ''}
      ${site.social.google_business ? `<a href="${esc(site.social.google_business)}" rel="noopener" target="_blank">Google reviews</a>` : ''}
      <span>© ${new Date().getFullYear()} Zen Visuals</span>
    </div>
  </footer>
</section>
`;

const dialogsAndScripts = () => `
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

const moreLink = (slug, text) => { const p = pageBySlug(slug); return p ? `<a href="/${esc(p.slug)}/" class="more-link">${esc(text || p.nav_label)} →</a>` : ''; };

// ---------- homepage ----------
const homeGraph = [business, website, ...films.filter((f) => f.video).map(videoSchema)];
if (faqs.length) homeGraph.push(faqSchema(faqs));

const home = head({ title: site.seo.title, description: site.seo.description, url: SITE_URL + '/', image: site.seo.share_image, graph: homeGraph, preload: site.hero.reel_poster })
+ topbar('') + `
<main id="main">

<section class="hero" id="top">
  <video class="hero-video" src="${esc(site.hero.reel)}"${site.hero.reel_mobile ? ` data-mobile-src="${esc(site.hero.reel_mobile)}"` : ''} poster="${esc(site.hero.reel_poster)}" autoplay muted loop playsinline preload="metadata" aria-hidden="true"></video>
  <div class="hero-shade"></div>
  <div class="hero-inner">
    <div class="hero-logo"><img src="/media/brand/logo-cream.png" alt="Zen Visuals"${dims('/media/brand/logo-cream.png')}></div>
    <h1 class="hero-tagline">${esc(site.hero.tagline)}</h1>
  </div>
  <div class="hero-actions">
    <button type="button" class="btn-ghost" data-film-src="${esc(featured.video)}" data-film-title="${esc(featured.title)}" data-film-poster="${esc(featured.poster)}">${playIcon(10)}${esc(site.hero.button_text)}</button>
  </div>
</section>

<section class="wrap paths">
  <article id="weddings" class="path">
    ${pic(site.weddings.image, site.weddings.image_alt, { cls: 'path-img', sizes: '(max-width: 760px) 100vw, 50vw' })}
    <h2 class="path-title">${esc(site.weddings.title)}</h2>
    <p class="path-text">${esc(site.weddings.text)}</p>
    ${site.weddings.venues ? `<p class="path-note">${esc(site.weddings.venues)}</p>` : ''}
    <div class="path-links">
      <a href="#contact" class="text-link" data-enquiry="Wedding">${esc(site.weddings.link_text)}</a>
      ${moreLink('wedding-videographer-derbyshire', 'Wedding films')}
      ${moreLink('wedding-photographer-derbyshire', 'Wedding photography')}
    </div>
  </article>
  <article id="commercial" class="path">
    ${firstCommercial ? `<button type="button" class="path-media" data-film-src="${esc(firstCommercial.video)}" data-film-title="${esc(firstCommercial.title)}" data-film-poster="${esc(firstCommercial.poster)}" aria-label="Play ${esc(firstCommercial.title)}">
      ${pic(site.commercial.image, '', { cls: 'path-img', sizes: '(max-width: 760px) 100vw, 50vw' })}
      <span class="play-ring play-ring--lg">${playIcon(18)}</span>
    </button>` : pic(site.commercial.image, site.commercial.image_alt, { cls: 'path-img', sizes: '(max-width: 760px) 100vw, 50vw' })}
    <h2 class="path-title">${esc(site.commercial.title)}</h2>
    <p class="path-text">${esc(site.commercial.text)}</p>
    <div class="path-links">
      <a href="#contact" class="text-link" data-enquiry="Advert / promo film">${esc(site.commercial.link_text)}</a>
      ${moreLink('video-production-derbyshire', 'Video production')}
    </div>
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
  ${pic(site.about.image, site.about.image_alt, { cls: 'about-img', sizes: '380px' })}
  <div class="about-text">
    <h2 class="about-title">${esc(site.about.title)} <em>${esc(site.about.title_emphasis)}</em></h2>
    ${site.about.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}
  </div>
</section>

${reviewsBlock()}
${pricingBlock(true)}
${faqs.length ? `<section class="wrap-narrow faq" id="faq">
  <h2 class="section-title">${esc(faqTitle)}</h2>
  ${faqList(faqs)}
</section>
` : ''}
${contactAndFooter()}
</main>
` + dialogsAndScripts();

// ---------- landing pages ----------
function landing(p) {
  const url = pageUrl(p.slug);
  const pFilms = p.film_category ? films.filter((f) => f.category === p.film_category) : [];
  const pPhotos = p.photo_category ? photos.filter((x) => x.category === p.photo_category).slice(0, p.photo_limit || 9) : [];
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

  return head({ title: p.seo_title, description: p.seo_description, url, image: p.hero_image, graph, preload: null })
  + topbar('/') + `
<main id="main">

<section class="hero hero--page" id="top">
  ${pic(p.hero_image, p.hero_alt, { cls: 'hero-image', sizes: '100vw', eager: true })}
  <div class="hero-shade"></div>
  <div class="hero-inner hero-inner--page">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <span>${esc(p.nav_label || p.h1)}</span></nav>
    <p class="hero-eyebrow">${esc(p.eyebrow || '')}</p>
    <h1 class="page-title">${esc(p.h1)}</h1>
    <a href="#contact" class="btn-light" data-enquiry="${isCommercial ? 'Advert / promo film' : 'Wedding'}">${isCommercial ? 'Get a quote' : 'Check your date'}</a>
  </div>
</section>

<section class="wrap-narrow prose">
  ${(p.intro || []).map((x, i) => `<p${i === 0 ? ' class="lead"' : ''}>${esc(x)}</p>`).join('\n  ')}
  ${(p.sections || []).map((s) => `<h2>${esc(s.heading)}</h2>
  <p>${esc(s.text)}</p>`).join('\n  ')}
</section>

${pFilms.length ? `<section class="films films--page" id="films">
  <div class="wrap">
    <h2 class="section-title">Films</h2>
    <div class="film-grid film-grid--2">${pFilms.map(filmCard).join('')}</div>
  </div>
</section>` : ''}

${pPhotos.length ? `<section class="wrap photos" id="photos">
  <h2 class="section-title">Photographs</h2>
  <div class="gallery">${gallery(pPhotos)}
  </div>
</section>` : ''}

${isCommercial ? '' : reviewsBlock()}
${p.show_pricing ? pricingBlock(false) : ''}
${p.faqs && p.faqs.length ? `<section class="wrap-narrow faq" id="faq">
  <h2 class="section-title">Questions</h2>
  ${faqList(p.faqs)}
</section>` : ''}

${others.length ? `<section class="wrap-narrow related">
  <p class="eyebrow eyebrow--dark">More from Zen Visuals</p>
  <div class="related-links">
    <a href="/">Home</a>
    ${others.map((o) => `<a href="/${esc(o.slug)}/">${esc(o.nav_label || o.h1)}</a>`).join('\n    ')}
  </div>
</section>` : ''}

${contactAndFooter(isCommercial ? 'Advert / promo film' : 'Wedding')}
</main>
` + dialogsAndScripts();
}

// ---------- simple pages ----------
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
