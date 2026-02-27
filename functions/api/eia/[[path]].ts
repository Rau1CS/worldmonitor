/**
 * CF Pages Function: EIA (Energy Information Administration) API proxy.
 * Keeps API key server-side. Port of api/eia/[[...path]].js.
 */

declare const process: { env: Record<string, string | undefined> };

interface CFPagesContext {
  request: Request;
  params: { path?: string[] };
}

export async function onRequest(context: CFPagesContext): Promise<Response> {
  const req = context.request;
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': new URL(req.url).origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/api/eia', '');
  const apiKey = process.env.EIA_API_KEY;

  if (!apiKey) {
    return Response.json(
      { configured: false, skipped: true, reason: 'EIA_API_KEY not configured' },
      { status: 200, headers: cors },
    );
  }

  if (path === '/health' || path === '') {
    return Response.json({ configured: true }, { headers: cors });
  }

  if (path === '/petroleum') {
    try {
      const series: Record<string, string> = {
        wti: 'PET.RWTC.W',
        brent: 'PET.RBRTE.W',
        production: 'PET.WCRFPUS2.W',
        inventory: 'PET.WCESTUS1.W',
      };

      const results: Record<string, unknown> = {};
      const fetchResults = await Promise.all(
        Object.entries(series).map(async ([key, seriesId]) => {
          try {
            const response = await fetch(
              `https://api.eia.gov/v2/seriesid/${seriesId}?api_key=${apiKey}&num=2`,
              { headers: { Accept: 'application/json' } },
            );
            if (!response.ok) return null;
            const data = (await response.json()) as { response?: { data?: Array<{ value?: number; period?: string; unit?: string }> } };
            const values = data?.response?.data || [];
            if (values.length >= 1) {
              return {
                key,
                data: {
                  current: values[0]?.value,
                  previous: values[1]?.value || values[0]?.value,
                  date: values[0]?.period,
                  unit: values[0]?.unit,
                },
              };
            }
          } catch (e) {
            console.error(`[EIA] Failed to fetch ${key}:`, (e as Error).message);
          }
          return null;
        }),
      );

      for (const result of fetchResults) {
        if (result) results[result.key] = result.data;
      }

      return Response.json(results, {
        headers: {
          ...cors,
          'Cache-Control': 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=300',
        },
      });
    } catch (error) {
      console.error('[EIA] Fetch error:', error);
      return Response.json({ error: 'Failed to fetch EIA data' }, { status: 500, headers: cors });
    }
  }

  return Response.json({ error: 'Not found' }, { status: 404, headers: cors });
}
