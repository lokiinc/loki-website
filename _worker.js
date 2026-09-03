// /_worker.js
// このファイルが「入口」になり、リクエストごとに次のどちらかを行う:
//   1. /api/instagram へのリクエストなら、Instagramの投稿データを取得して返す
//   2. それ以外のリクエストなら、静的ファイル(index.htmlなど)をそのまま返す
//
// 必要な環境変数(Cloudflareダッシュボード > loki-website > 設定 > 変数とシークレット で設定済み):
//   INSTAGRAM_ACCESS_TOKEN
//   INSTAGRAM_USER_ID

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/instagram') {
      return handleInstagram(env);
    }

    // それ以外は、いつも通り静的ファイル(index.htmlなど)を配信する
    return env.ASSETS.fetch(request);
  },
};

async function handleInstagram(env) {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = env.INSTAGRAM_USER_ID;

  if (!token || !igUserId) {
    return jsonResponse({ error: '環境変数が設定されていません' }, 500);
  }

  try {
    const fields = [
      'id',
      'caption',
      'media_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
      'children{media_type,media_url,thumbnail_url}',
    ].join(',');

    const url = `https://graph.instagram.com/${igUserId}/media?fields=${fields}&limit=12&access_token=${token}`;
    const igRes = await fetch(url);
    const data = await igRes.json();

    if (data.error) {
      return jsonResponse({ error: data.error.message }, 502);
    }

    const posts = (data.data || []).map((item) => {
      const isCarousel = item.media_type === 'CAROUSEL_ALBUM';
      const children = isCarousel && item.children ? item.children.data : [];

      return {
        id: item.id,
        type: isCarousel ? 'collection' : item.media_type === 'VIDEO' ? 'video' : 'image',
        caption: (item.caption || '').slice(0, 60),
        permalink: item.permalink,
        timestamp: item.timestamp,
        cover: item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url,
        count: isCarousel ? children.length : 1,
        children: children.map((c) => ({
          type: c.media_type === 'VIDEO' ? 'video' : 'image',
          cover: c.media_type === 'VIDEO' ? c.thumbnail_url : c.media_url,
        })),
      };
    });

    return jsonResponse({ posts }, 200, {
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
  });
}
