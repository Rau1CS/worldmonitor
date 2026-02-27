/**
 * CF Pages middleware — runs before every request.
 *
 * 1. Populates globalThis.process.env from CF bindings so that all server
 *    code using `process.env.X` works transparently (handlers declare
 *    `const process` ambient — this satisfies that).
 * 2. Bot protection for /api/* paths (port of Vercel middleware.ts).
 */

interface CFPagesContext {
  request: Request;
  env: Record<string, string>;
  next: () => Promise<Response>;
}

const BOT_UA =
  /bot|crawl|spider|slurp|archiver|wget|curl\/|python-requests|scrapy|httpclient|go-http|java\/|libwww|perl|ruby|php\/|ahrefsbot|semrushbot|mj12bot|dotbot|baiduspider|yandexbot|sogou|bytespider|petalbot|gptbot|claudebot|ccbot/i;

const SOCIAL_PREVIEW_UA =
  /twitterbot|facebookexternalhit|linkedinbot|slackbot|telegrambot|whatsapp|discordbot|redditbot/i;

const SOCIAL_PREVIEW_PATHS = new Set(['/api/story', '/api/og-story']);
const PUBLIC_API_PATHS = new Set(['/api/version']);

export async function onRequest(context: CFPagesContext): Promise<Response> {
  // --- Populate process.env from CF bindings ---
  const g = globalThis as Record<string, unknown>;
  if (!g.process) g.process = { env: {} };
  Object.assign((g.process as { env: Record<string, string> }).env, context.env);

  const url = new URL(context.request.url);

  // Only apply bot protection to /api/* paths
  if (url.pathname.startsWith('/api/')) {
    const ua = context.request.headers.get('user-agent') ?? '';

    // Public endpoints bypass all bot filtering
    if (PUBLIC_API_PATHS.has(url.pathname)) {
      return context.next();
    }

    // Allow social preview bots on OG routes
    if (SOCIAL_PREVIEW_UA.test(ua) && SOCIAL_PREVIEW_PATHS.has(url.pathname)) {
      return context.next();
    }

    // Block bots from all API routes
    if (BOT_UA.test(ua)) {
      return new Response('{"error":"Forbidden"}', {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Block empty/short UA (likely a script)
    if (!ua || ua.length < 10) {
      return new Response('{"error":"Forbidden"}', {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return context.next();
}
