import fs from 'fs';
import path from 'path';

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const CONFIG = {
  whitePage:  'site.html',           // shown to bots/reviewers
  offerPage:  'offer/offer.html',    // shown to real users

  // Set to [] to allow all countries, or add codes to restrict, e.g. ['US', 'GB', 'CA']
  allowedCountries: ['US', 'IN'],

  // Block VPN/proxy/datacenter IPs?
  blockProxies: true,
};
// ───────────────────────────────────────────────────────────────────────────────


// Known bots, crawlers, ad reviewers, scrapers
const BOT_UA = [
  // Search engines
  /googlebot/i, /google-inspectiontool/i, /bingbot/i, /slurp/i,
  /duckduckbot/i, /baiduspider/i, /yandexbot/i, /sogou/i,
  /exabot/i, /ia_archiver/i, /seznambot/i, /360spider/i,

  // Social & ad platforms
  /facebookexternalhit/i, /facebot/i, /twitterbot/i, /linkedinbot/i,
  /whatsapp/i, /applebot/i, /pinterest/i, /discordbot/i, /telegrambot/i,
  /vkshare/i, /slackbot/i, /redditbot/i,

  // SEO / audit tools
  /semrushbot/i, /ahrefsbot/i, /mj12bot/i, /dotbot/i, /rogerbot/i,
  /petalbot/i, /screaming.frog/i, /sitechecker/i, /seokicks/i,
  /seobilitybot/i, /serpstatbot/i, /similarweb/i, /adbeat/i,
  /brandverity/i, /proximic/i, /checkmarknetwork/i,

  // Generic signals
  /\bbot\b/i, /\bcrawler\b/i, /\bspider\b/i, /\bscraper\b/i,
  /\bfetcher\b/i, /\bparser\b/i, /\bmonitor\b/i, /\bchecker\b/i,

  // HTTP libraries / CLI tools (non-browser)
  /curl\//i, /wget\//i, /python-requests/i, /python-urllib/i,
  /axios\//i, /go-http-client/i, /java\//i, /ruby\//i, /php\//i,
  /perl\//i, /libwww-perl/i, /okhttp/i, /got\//i, /node-fetch/i,
  /node\.js/i, /undici/i,

  // Headless / automation
  /headlesschrome/i, /phantomjs/i, /selenium/i, /puppeteer/i,
  /playwright/i, /cypress/i, /webdriver/i, /nightwatch/i,
  /slimerjs/i, /casperjs/i, /htmlunit/i, /httpunit/i,

  // Ad network crawlers
  /adsbot-google/i, /mediapartners-google/i, /google-adwords/i,
  /google-ads/i, /tiktok.*bot/i, /snapchat.*crawler/i,
];

// Referers that indicate an ad platform review
const REVIEWER_REFERERS = [
  /facebook\.com\/ads/i,
  /business\.facebook\.com/i,
  /ads\.google\.com/i,
  /adwords\.google\.com/i,
  /analytics\.google\.com/i,
  /tiktok\.com\/business/i,
  /ads\.tiktok\.com/i,
  /snapchat\.com\/business/i,
];


export default async function handler(req, res) {
  const ua      = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || req.headers['referrer'] || '';
  const lang    = req.headers['accept-language'] || '';
  const ip      = getRealIP(req);

  const showOffer = await shouldShowOffer({ ua, referer, lang, ip });

  if (showOffer) {
    return servePage(res, CONFIG.offerPage);
  } else {
    return servePage(res, CONFIG.whitePage);
  }
}


async function shouldShowOffer({ ua, referer, lang, ip }) {

  // 1. Empty user agent → bot
  if (!ua || ua.trim().length < 10) return false;

  // 2. Matches known bot UA → white page
  if (BOT_UA.some(p => p.test(ua))) return false;

  // 3. Reviewer referer → white page
  if (REVIEWER_REFERERS.some(p => p.test(referer))) return false;

  // 4. IP reputation check (free: ip-api.com, 45 req/min, no key)
  try {
    const ipData = await checkIP(ip);

    if (ipData) {
      // Block VPN / proxy / datacenter IPs
      if (CONFIG.blockProxies && (ipData.proxy || ipData.hosting)) return false;

      // Country restriction
      if (CONFIG.allowedCountries.length > 0) {
        if (!CONFIG.allowedCountries.includes(ipData.countryCode)) return false;
      }
    }
  } catch {
    // IP check failed — don't block real users because of an API timeout
  }

  // Passed all checks → real user, show offer
  return true;
}


async function checkIP(ip) {
  // ip-api.com free tier: no API key, 45 req/min
  // Returns: proxy (bool), hosting (bool), countryCode (string)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,proxy,hosting,countryCode`,
      { signal: controller.signal }
    );
    const data = await res.json();
    if (data.status === 'success') return data;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}


function getRealIP(req) {
  const headers = [
    'cf-connecting-ip',   // Cloudflare
    'true-client-ip',     // Akamai / Cloudflare Enterprise
    'x-real-ip',          // Nginx proxy
    'x-forwarded-for'     // General proxy
  ];

  for (const header of headers) {
    const val = req.headers[header];
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
  if (!ip) return false;
  const privateRanges = [
    /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
    /^127\./, /^::1$/, /^fc00:/i, /^fe80:/i
  ];
  return !privateRanges.some(r => r.test(ip));
}


function servePage(res, filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    const html = fs.readFileSync(fullPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(html);
  } catch {
    return res.status(404).send('Page not found.');
  }
}
