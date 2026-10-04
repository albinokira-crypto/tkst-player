const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const platform = req.headers['expo-platform'] || 'android';
  const runtimeVersion = req.headers['expo-runtime-version'] || '1.1.0';

  // Procura pelo metadata.json do bundle exportado
  const metadataPath = path.join(process.cwd(), 'updates', 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    return res.status(200).json({ type: 'noUpdateAvailable', message: 'Nenhuma atualização disponível no momento.' });
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const platformData = metadata.fileMetadata && metadata.fileMetadata[platform];
    if (!platformData) {
      return res.status(200).json({ type: 'noUpdateAvailable' });
    }

    const currentUpdateId = req.headers['expo-current-update-id'];
    const updateId = platformData.bundle.replace(/.*index-/, '').replace(/\.hbc/, '');

    if (currentUpdateId === updateId) {
      res.setHeader('expo-protocol-version', 1);
      res.setHeader('expo-sfv-version', 0);
      return res.status(200).json({ type: 'noUpdateAvailable' });
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'tkst-player-valeiroguerrente.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${proto}://${host}`;

    const manifest = {
      id: updateId,
      createdAt: new Date().toISOString(),
      runtimeVersion: runtimeVersion,
      launchAsset: {
        key: 'bundle',
        contentType: 'application/javascript',
        url: `${baseUrl}/${platformData.bundle.replace(/\\/g, '/')}`,
      },
      assets: (platformData.assets || []).map((asset) => ({
        key: path.basename(asset.path),
        fileExtension: `.${asset.ext}`,
        contentType: asset.ext === 'png' ? 'image/png' : asset.ext === 'jpg' ? 'image/jpeg' : 'font/ttf',
        url: `${baseUrl}/${asset.path.replace(/\\/g, '/')}.${asset.ext}`,
      })),
      metadata: {},
      extra: {
        expoClient: {
          name: 'TKST Player',
          slug: 'tkst-player',
          version: '1.1.0'
        }
      }
    };

    res.setHeader('expo-protocol-version', 0);
    res.setHeader('expo-sfv-version', 0);
    res.setHeader('cache-control', 'private, max-age=0');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).json(manifest);
  } catch (error) {
    console.error('Erro ao gerar manifest:', error);
    return res.status(500).json({ error: error.message });
  }
};
