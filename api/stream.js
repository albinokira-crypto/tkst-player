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

  // 2. Resolução por ID do Provedor
  if (id) {
    try {
      if (id.startsWith('dz_')) {
        const rawId = id.replace('dz_', '');
        const dzRes = await fetch(`https://api.deezer.com/track/${rawId}`);
        const data = await dzRes.json();
        if (data.preview) {
          return res.status(200).json({
            id,
            title: data.title,
            artist: data.artist?.name,
            streamUrl: data.preview,
            duration: data.duration,
            provider: 'deezer',
          });
        }
      }

      if (id.startsWith('it_')) {
        const rawId = id.replace('it_', '');
        const itRes = await fetch(`https://itunes.apple.com/lookup?id=${rawId}`);
        const data = await itRes.json();
        if (data.results?.[0]?.previewUrl) {
          const item = data.results[0];
          return res.status(200).json({
            id,
            title: item.trackName,
            artist: item.artistName,
            streamUrl: item.previewUrl,
            duration: Math.round((item.trackTimeMillis || 0) / 1000),
            provider: 'itunes',
          });
        }
      }
    } catch (e) {
      return res.status(500).json({ error: 'Falha ao resolver ID da faixa' });
    }
  }

  // 3. Resolução por Termo / Busca de Emergência
  if (query) {
    try {
      const dzRes = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`);
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
        });
      }

      const itRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
      const itData = await itRes.json();
      if (itData.results?.[0]?.previewUrl) {
        const item = itData.results[0];
        return res.status(200).json({
          id: `it_${item.trackId}`,
          title: item.trackName,
          artist: item.artistName,
          streamUrl: item.previewUrl,
          duration: Math.round((item.trackTimeMillis || 0) / 1000),
          provider: 'itunes',
        });
      }

      return res.status(404).json({ error: 'Nenhum fluxo encontrado para a consulta' });
    } catch (e) {
      return res.status(500).json({ error: 'Erro no servidor de streaming' });
    }
  }

  return res.status(400).json({ error: 'Parâmetro id, query ou url é obrigatório' });
};
