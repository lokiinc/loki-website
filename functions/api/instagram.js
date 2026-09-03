// /functions/api/instagram.js
// Cloudflare Pages Functions。アクセストークンはここ(サーバー側)でだけ使う。
// ブラウザ側のJavaScriptには一切トークンを渡さない。
//
// 必要な環境変数(Cloudflare Pagesのプロジェクト設定 > Settings > Environment variables で設定):
//   INSTAGRAM_ACCESS_TOKEN … 長期アクセストークン(60日ごとに自動更新する仕組みは別途)
//   INSTAGRAM_USER_ID      … 今回発行された Instagram ユーザーID(17841437061425557)

export async function onRequestGet(context) {
  const { env } = context;
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = env.INSTAGRAM_USER_ID;

  if (!token || !igUserId) {
    return new Response(JSON.stringify({ error: '環境変数が設定されていません' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
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
      return new Response(JSON.stringify({ error: data.error.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 投稿を「単一(画像/動画)」か「複数枚(コレクション)」かに整理する
    const posts = (data.data || []).map((item) => {
      const isCarousel = item.media_type === 'CAROUSEL_ALBUM';
      const children = isCarousel && item.children ? item.children.data : [];

      return {
        id: item.id,
        type: isCarousel ? 'collection' : item.media_type === 'VIDEO' ? 'video' : 'image',
        caption: (item.caption || '').slice(0, 60),
        permalink: item.permalink,
        timestamp: item.timestamp,
        // 動画はサムネイル、画像は本体URLをカバー画像として使う
        cover: item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url,
        count: isCarousel ? children.length : 1,
        children: children.map((c) => ({
          type: c.media_type === 'VIDEO' ? 'video' : 'image',
          cover: c.media_type === 'VIDEO' ? c.thumbnail_url : c.media_url,
        })),
      };
    });

    return new Response(JSON.stringify({ posts }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // 1時間キャッシュ(レート制限対策・表示速度対策)
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
