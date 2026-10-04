const fs = require('fs');
const path = require('path');

function toUUID(str) {
  const clean = (str || '').replace(/[^0-9a-fA-F]/g, '').padEnd(32, '0').slice(0, 32);
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`.toLowerCase();
}

module.exports = (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const platform = req.headers['expo-platform'] || req.query.platform || 'android';
  const runtimeVersion = req.headers['expo-runtime-version'] || req.query['runtime-version'] || '1.1.0';
  const clientProtocolVersion = req.headers['expo-protocol-version'] || '1';

  // Procura pelo metadata.json do bundle exportado
  let metadataPath = path.join(process.cwd(), 'updates', 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    metadataPath = path.join(process.cwd(), 'public', 'metadata.json');
  }
  if (!fs.existsSync(metadataPath)) {
    res.setHeader('expo-protocol-version', clientProtocolVersion);
    res.setHeader('expo-sfv-version', 0);
    return res.status(200).json({ type: 'noUpdateAvailable', message: 'Nenhuma atualização disponível no momento.' });
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const platformData = metadata.fileMetadata && metadata.fileMetadata[platform];
    if (!platformData) {
      res.setHeader('expo-protocol-version', clientProtocolVersion);
      res.setHeader('expo-sfv-version', 0);
      return res.status(200).json({ type: 'noUpdateAvailable' });
    }

    const rawUpdateId = platformData.bundle.replace(/.*index-/, '').replace(/\.hbc/, '');
    const updateId = toUUID(rawUpdateId);

    const currentUpdateId = req.headers['expo-current-update-id'];
    if (currentUpdateId) {
      const normalizedCurrent = currentUpdateId.replace(/-/g, '').toLowerCase();
      const normalizedTarget = rawUpdateId.toLowerCase();

      if (normalizedCurrent === normalizedTarget) {
        res.setHeader('expo-protocol-version', clientProtocolVersion);
        res.setHeader('expo-sfv-version', 0);
        return res.status(200).json({ type: 'noUpdateAvailable' });
      }
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'tkst-player-valeiroguerrente.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${proto}://${host}`;

    const cleanBundlePath = platformData.bundle.replace(/\\/g, '/');

    const manifest = {
      id: updateId,
      createdAt: new Date().toISOString(),
      runtimeVersion: runtimeVersion,
      launchAsset: {
        key: 'bundle',
        contentType: 'application/javascript',
        url: `${baseUrl}/api/assets?asset=${encodeURIComponent(cleanBundlePath)}`,
      },
      assets: (platformData.assets || []).map((asset) => {
        const cleanPath = asset.path.replace(/\\/g, '/');
        const assetName = path.basename(cleanPath);
        return {
          key: assetName,
          fileExtension: `.${asset.ext}`,
          contentType: asset.ext === 'png' ? 'image/png' : asset.ext === 'jpg' ? 'image/jpeg' : 'font/ttf',
          url: `${baseUrl}/assets/${assetName}`,
        };
      }),
      metadata: {},
      extra: {
        expoClient: {
          name: 'TKST Player',
          slug: 'tkst-player',
          version: '1.2.0'
        }
      }
    };

    res.setHeader('expo-protocol-version', clientProtocolVersion);
    res.setHeader('expo-sfv-version', 0);
    res.setHeader('cache-control', 'private, max-age=0');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).json(manifest);
  } catch (error) {
    console.error('Erro ao gerar manifest:', error);
    return res.status(500).json({ error: error.message });
  }
};
