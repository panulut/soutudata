const seen = new Set();
const queue = ['https://www.suursoudut.fi/'];
const matches = [];
const maxPages = 80;

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) return '';
  return res.text();
}

async function crawl() {
  while (queue.length && seen.size < maxPages) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const html = await fetchText(url);
      if (!html) continue;
      const lower = html.toLowerCase();
      if (lower.includes('musakka') || lower.includes('panu')) {
        matches.push(url);
      }
      const links = [...new Set((html.match(/href=["']([^"']+)["']/gi) || []).map((m) => m.slice(6, -1)).filter((href) => href.startsWith('/') || href.startsWith('https://www.suursoudut.fi')))].map((href) => href.startsWith('/') ? 'https://www.suursoudut.fi' + href : href).filter((href) => !href.includes('#') && !href.includes('mailto:'));
      for (const href of links) {
        if (!seen.has(href) && queue.length < 150) queue.push(href);
      }
    } catch (error) {
      // ignore
    }
  }
  console.log('matches', matches.length);
  console.log(matches.slice(0, 40).join('\n'));
}

crawl();
