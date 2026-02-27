/**
 * CF Pages Function: RSS feed proxy.
 * Port of api/rss-proxy.js — proxies RSS feeds through our domain
 * to avoid CORS issues and apply domain allowlisting.
 */

declare const process: { env: Record<string, string | undefined> };

// Copy of ALLOWED_DOMAINS from the original — kept in sync on pull.
// Only a subset is strictly needed for finance but we include all for compat.
const ALLOWED_DOMAINS = [
  'feeds.bbci.co.uk', 'www.theguardian.com', 'feeds.npr.org', 'news.google.com',
  'www.aljazeera.com', 'www.aljazeera.net', 'rss.cnn.com', 'hnrss.org',
  'feeds.arstechnica.com', 'www.theverge.com', 'www.cnbc.com', 'feeds.marketwatch.com',
  'www.defenseone.com', 'breakingdefense.com', 'www.bellingcat.com', 'techcrunch.com',
  'huggingface.co', 'www.technologyreview.com', 'rss.arxiv.org', 'export.arxiv.org',
  'www.federalreserve.gov', 'www.sec.gov', 'www.whitehouse.gov', 'www.state.gov',
  'www.defense.gov', 'home.treasury.gov', 'www.justice.gov', 'tools.cdc.gov',
  'www.fema.gov', 'www.dhs.gov', 'www.thedrive.com', 'krebsonsecurity.com',
  'finance.yahoo.com', 'thediplomat.com', 'venturebeat.com', 'foreignpolicy.com',
  'www.ft.com', 'openai.com', 'www.reutersagency.com', 'feeds.reuters.com',
  'rsshub.app', 'asia.nikkei.com', 'www.cfr.org', 'www.csis.org',
  'www.politico.com', 'www.brookings.edu', 'layoffs.fyi', 'www.defensenews.com',
  'www.militarytimes.com', 'taskandpurpose.com', 'news.usni.org',
  'www.oryxspioenkop.com', 'www.gov.uk', 'www.foreignaffairs.com',
  'www.atlanticcouncil.org', 'www.zdnet.com', 'www.techmeme.com',
  'www.darkreading.com', 'www.schneier.com', 'www.ransomware.live',
  'rss.politico.com', 'www.anandtech.com', 'www.tomshardware.com',
  'www.semianalysis.com', 'feed.infoq.com', 'thenewstack.io', 'devops.com',
  'dev.to', 'lobste.rs', 'changelog.com', 'seekingalpha.com',
  'news.crunchbase.com', 'www.saastr.com', 'feeds.feedburner.com',
  'www.producthunt.com', 'www.axios.com', 'github.blog', 'githubnext.com',
  'mshibanami.github.io', 'www.engadget.com', 'news.mit.edu', 'dev.events',
  'www.ycombinator.com', 'a16z.com', 'review.firstround.com',
  'www.sequoiacap.com', 'www.nfx.com', 'www.aaronsw.com',
  'bothsidesofthetable.com', 'www.lennysnewsletter.com', 'stratechery.com',
  'www.eu-startups.com', 'tech.eu', 'sifted.eu', 'www.techinasia.com',
  'kr-asia.com', 'techcabal.com', 'disrupt-africa.com', 'lavca.org',
  'contxto.com', 'inc42.com', 'yourstory.com', 'pitchbook.com',
  'www.cbinsights.com', 'www.techstars.com', 'english.alarabiya.net',
  'www.arabnews.com', 'www.timesofisrael.com', 'www.haaretz.com', 'www.scmp.com',
  'kyivindependent.com', 'www.themoscowtimes.com', 'feeds.24.com', 'feeds.capi24.com',
  'www.france24.com', 'www.euronews.com', 'www.bbc.com', 'news.un.org',
  'www.iaea.org', 'www.who.int', 'www.cisa.gov', 'www.crisisgroup.org',
  'rusi.org', 'warontherocks.com', 'www.fao.org', 'worldbank.org', 'www.imf.org',
  'seekingalpha.com', 'www.coindesk.com', 'cointelegraph.com',
  'www.goodnewsnetwork.org', 'www.positive.news', 'reasonstobecheerful.world',
  'singularityhub.com', 'humanprogress.org', 'feeds.nature.com', 'www.nature.com',
  'news.ycombinator.com',
];

const ALLOWED_SET = new Set(ALLOWED_DOMAINS);

function isDomainAllowed(hostname: string): boolean {
  if (ALLOWED_SET.has(hostname)) return true;
  const bare = hostname.replace(/^www\./, '');
  if (ALLOWED_SET.has(bare)) return true;
  const withWww = hostname.startsWith('www.') ? hostname : `www.${hostname}`;
  return ALLOWED_SET.has(withWww);
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

interface CFPagesContext {
  request: Request;
}

export async function onRequest(context: CFPagesContext): Promise<Response> {
  const req = context.request;
  const origin = new URL(req.url).origin;
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const requestUrl = new URL(req.url);
  const feedUrl = requestUrl.searchParams.get('url');

  if (!feedUrl) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400, headers: cors });
  }

  try {
    const parsedUrl = new URL(feedUrl);
    if (!isDomainAllowed(parsedUrl.hostname)) {
      return Response.json({ error: 'Domain not allowed' }, { status: 403, headers: cors });
    }

    const isGoogleNews = feedUrl.includes('news.google.com');
    const timeout = isGoogleNews ? 20000 : 12000;

    let response = await fetchWithTimeout(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'manual',
    }, timeout);

    // Handle redirects (validate target domain)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        const redirectUrl = new URL(location, feedUrl);
        if (!isDomainAllowed(redirectUrl.hostname)) {
          return Response.json({ error: 'Redirect to disallowed domain' }, { status: 403, headers: cors });
        }
        response = await fetchWithTimeout(redirectUrl.href, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          },
        }, timeout);
      }
    }

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/xml',
        'Cache-Control': response.headers.get('cache-control') || 'public, max-age=600, stale-while-revalidate=300',
        ...cors,
      },
    });
  } catch (error) {
    const err = error as Error;
    const isTimeout = err.name === 'AbortError';
    console.error('RSS proxy error:', feedUrl, err.message);
    return Response.json(
      { error: isTimeout ? 'Feed timeout' : 'Failed to fetch feed', details: err.message, url: feedUrl },
      { status: isTimeout ? 504 : 502, headers: cors },
    );
  }
}
