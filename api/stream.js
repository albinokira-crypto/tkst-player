const CryptoJS = require('crypto-js');

const SAAVN_KEY = CryptoJS.enc.Utf8.parse('38346591');
let cachedScClientId = 'dkevB9EsY4jIoSm8RfddPNUKyn6hurXF';
let scClientTimestamp = 0;

function decryptSaavn(enc) {
  try {
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(enc) },
      SAAVN_KEY,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    const url = decrypted.toString(CryptoJS.enc.Utf8);
    if (!url) return null;
    return url.replace('_96.mp4', '_160.mp4');
  } catch {
    return null;
  }
}

async function getSoundCloudClientId() {
  const now = Date.now();
  if (cachedScClientId && now - scClientTimestamp < 1000 * 60 * 60 * 6) {
    return cachedScClientId;
  }
  try {
    const homeRes = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    const html = await homeRes.text();
    const scriptUrls = [...html.matchAll(/<script[^>]+src="(https:\/\/[^"]+\.js)"/g)].map((m) => m[1]);
    for (const sUrl of scriptUrls.slice(-6)) {
      const sRes = await fetch(sUrl);
      const sText = await sRes.text();
      const match = sText.match(/client_id[:=]"([a-zA-Z0-9]{32})"/);
      if (match) {
        cachedScClientId = match[1];
        scClientTimestamp = now;
        return cachedScClientId;
      }
    }
  } catch {}
  return cachedScClientId || 'dkevB9EsY4jIoSm8RfddPNUKyn6hurXF';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id, query, url } = req.query;

  // 1. Resolução direta por URL
  if (url) {
    try {
      const headRes = await fetch(url, { method: 'HEAD' });
      return res.status(200).json({
        streamUrl: url,
        status: headRes.status,
        contentType: headRes.headers.get('content-type') || 'audio/mpeg',
        contentLength: headRes.headers.get('content-length'),
      });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao verificar URL do stream' });
    }
  }

  // 2. Resolução por Termo / Busca de Áudio Completo
  if (query) {
    try {
      const cleanQ = query.trim();

      // Prioridade 1: JioSaavn (Áudio completo em alta fidelidade 160kbps AAC)
      try {
        const saavnUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&n=5&p=1&q=${encodeURIComponent(cleanQ)}&_marker=0&ctx=web6dot0`;
        const sRes = await fetch(saavnUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.results && sData.results.length) {
            for (const item of sData.results) {
              const dur = parseInt(item.duration, 10);
              if (dur > 60 && item.encrypted_media_url) {
                const streamUrl = decryptSaavn(item.encrypted_media_url);
                if (streamUrl) {
                  return res.status(200).json({
                    id: `saavn_${item.id}`,
                    title: item.song || item.title,
                    artist: item.singers || item.primary_artists,
                    streamUrl,
                    duration: dur,
                    provider: 'saavn',
                    isFullTrack: true,
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Saavn resolve error on vercel:', e);
      }

      // Prioridade 2: SoundCloud (Progressive MP3 de músicas completas)
      try {
        const scClientId = await getSoundCloudClientId();
        const scUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(cleanQ)}&client_id=${scClientId}&limit=10`;
        const scRes = await fetch(scUrl);
        if (scRes.ok) {
          const scData = await scRes.json();
          const fullTracks = (scData.collection || []).filter((t) => t.duration > 75000);
          for (const track of fullTracks) {
            const progressive = track.media?.transcodings?.find((tr) => tr.format?.protocol === 'progressive');
            if (progressive) {
              const sInfoRes = await fetch(`${progressive.url}?client_id=${scClientId}`);
              if (sInfoRes.ok) {
                const sInfo = await sInfoRes.json();
                if (sInfo.url) {
                  return res.status(200).json({
                    id: `sc_${track.id}`,
                    title: track.title,
                    artist: track.user?.username || 'Artista',
                    streamUrl: sInfo.url,
                    duration: Math.round(track.duration / 1000),
                    provider: 'soundcloud',
                    isFullTrack: true,
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('SoundCloud resolve error on vercel:', e);
      }

      // Prioridade 3: Fallback Deezer
      const dzRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(cleanQ)}&limit=1`);
      const dzData = await dzRes.json();
      if (dzData.data?.[0]?.preview) {
        const item = dzData.data[0];
        return res.status(200).json({
          id: `dz_${item.id}`,
          title: item.title,
          artist: item.artist?.name,
          streamUrl: item.preview,
          duration: item.duration,
          provider: 'deezer',
          isFullTrack: false,
        });
      }

      return res.status(404).json({ error: 'Nenhum fluxo encontrado para a consulta' });
    } catch (e) {
      return res.status(500).json({ error: 'Erro no servidor de streaming' });
    }
  }

  return res.status(400).json({ error: 'Parâmetro query ou url é obrigatório' });
};
