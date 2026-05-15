const fs   = require('fs');
const path = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const CONFIG = {
  whitePage:        'site.html',
  offerPage:        'offer/offer.html',
  allowedCountries: ['SA'],   // e.g. ['US','GB'] or [] for all
  blockProxies:     true,
};
// ───────────────────────────────────────────────────────────────────────────────

const BOT_UA = [
  /googlebot/i, /google-inspectiontool/i, /bingbot/i, /slurp/i,
  /duckduckbot/i, /baiduspider/i, /yandexbot/i, /sogou/i,
  /exabot/i, /ia_archiver/i, /seznambot/i, /360spider/i,
  /facebookexternalhit/i, /facebot/i, /twitterbot/i, /linkedinbot/i,
  /whatsapp/i, /applebot/i, /pinterest/i, /discordbot/i, /telegrambot/i,
  /vkshare/i, /slackbot/i, /redditbot/i,
  /semrushbot/i, /ahrefsbot/i, /mj12bot/i, /dotbot/i, /rogerbot/i,
  /petalbot/i, /screaming.frog/i, /sitechecker/i, /adbeat/i,
  /brandverity/i, /proximic/i, /checkmarknetwork/i,
  /\bbot\b/i, /\bcrawler\b/i, /\bspider\b/i, /\bscraper\b/i,
  /\bfetcher\b/i, /\bparser\b/i, /\bmonitor\b/i, /\bchecker\b/i,
  /curl\//i, /wget\//i, /python-requests/i, /python-urllib/i,
  /axios\//i, /go-http-client/i, /java\//i, /ruby\//i, /php\//i,
  /libwww-perl/i, /okhttp/i, /node-fetch/i, /node\.js/i, /undici/i,
  /headlesschrome/i, /phantomjs/i, /selenium/i, /puppeteer/i,
  /playwright/i, /cypress/i, /webdriver/i,
  /adsbot-google/i, /mediapartners-google/i,
];

const REVIEWER_REFERERS = [
  /facebook\.com\/ads/i, /business\.facebook\.com/i,
  /ads\.google\.com/i, /adwords\.google\.com/i,
  /tiktok\.com\/business/i, /ads\.tiktok\.com/i,
];

module.exports = async function handler(req, res) {

  // ── Temporary debug — visit /debug to check file paths ──────────────────────
  if (req.url === '/debug') {
    return res.json({
      cwd:        process.cwd(),
      siteExists: fs.existsSync(path.join(process.cwd(), 'site.html')),
      offerExists: fs.existsSync(path.join(process.cwd(), 'offer/offer.html')),
    });
  }
  // ────────────────────────────────────────────────────────────────────────────

  const ua      = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || req.headers['referrer'] || '';
  const ip      = getRealIP(req);

  const showOffer = await shouldShowOffer({ ua, referer, ip });
  return servePage(res, showOffer ? CONFIG.offerPage : CONFIG.whitePage);
};


async function shouldShowOffer({ ua, referer, ip }) {
  if (!ua || ua.trim().length < 10)               return false;
  if (BOT_UA.some(p => p.test(ua)))               return false;
  if (REVIEWER_REFERERS.some(p => p.test(referer))) return false;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,proxy,hosting,countryCode`,
      { signal: controller.signal }
    );
    clearTimeout(t);
    const data = await r.json();

    if (data.status === 'success') {
      if (CONFIG.blockProxies && (data.proxy || data.hosting)) return false;
      if (CONFIG.allowedCountries.length > 0 &&
          !CONFIG.allowedCountries.includes(data.countryCode)) return false;
    }
  } catch {}

  return true;
}


function getRealIP(req) {
  const headers = ['cf-connecting-ip','true-client-ip','x-real-ip','x-forwarded-for'];
  for (const h of headers) {
    const val = req.headers[h];
    if (val) {
      for (let ip of val.split(',')) {
        ip = ip.trim().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
        if (isPublicIP(ip)) return ip;
      }
    }
  }
  return req.socket?.remoteAddress || '0.0.0.0';
}

function isPublicIP(ip) {
  const priv = [/^10\./,/^172\.(1[6-9]|2\d|3[01])\./,/^192\.168\./,/^127\./,/^::1$/,/^fc00:/i,/^fe80:/i];
  return !!ip && !priv.some(r => r.test(ip));
}

function servePage(res, filePath) {
  try {
    const html = fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(html);
  } catch (e) {
    return res.status(404).send('Page not found: ' + filePath);
  }
}
