const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getBase64URLEncoding(base64EncodedString) {
  return base64EncodedString.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getAssetHashAndKey(buffer) {
  const hash = getBase64URLEncoding(crypto.createHash('sha256').update(buffer).digest('base64'));
  const key = crypto.createHash('md5').update(buffer).digest('hex');
  return { hash, key };
}

function toUUID(str) {
  const clean = (str || '').replace(/[^0-9a-fA-F]/g, '').padEnd(32, '0').slice(0, 32);
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`.toLowerCase();
}

// Cache em memória para os metadados e hashes dos assets
let cachedManifestData = null;

function loadManifestData(platform) {
  if (cachedManifestData) return cachedManifestData;

  let metadataPath = path.join(process.cwd(), 'updates', 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    metadataPath = path.join(process.cwd(), 'public', 'metadata.json');
  }
  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const platformData = metadata.fileMetadata && metadata.fileMetadata[platform];
  if (!platformData) return null;

  const bundleRelative = platformData.bundle.replace(/\\/g, '/');
  let bundleFullPath = path.join(process.cwd(), 'updates', bundleRelative);
  if (!fs.existsSync(bundleFullPath)) {
    bundleFullPath = path.join(process.cwd(), 'public', bundleRelative);
  }
  if (!fs.existsSync(bundleFullPath)) {
    bundleFullPath = path.join(process.cwd(), 'api', 'bundle.hbc');
  }

  let bundleBuf = Buffer.alloc(0);
  if (fs.existsSync(bundleFullPath)) {
    bundleBuf = fs.readFileSync(bundleFullPath);
  }
  const bundleMeta = getAssetHashAndKey(bundleBuf);
  const rawUpdateId = bundleRelative.replace(/.*index-/, '').replace(/\.hbc/, '');
  const updateId = toUUID(rawUpdateId);

  const assets = (platformData.assets || []).map((asset) => {
    const cleanPath = asset.path.replace(/\\/g, '/');
    const assetName = path.basename(cleanPath);
    let assetFullPath = path.join(process.cwd(), 'updates', 'assets', assetName);
    if (!fs.existsSync(assetFullPath)) {
      assetFullPath = path.join(process.cwd(), 'public', 'assets', assetName);
    }

    let assetBuf = Buffer.alloc(0);
    if (fs.existsSync(assetFullPath)) {
      assetBuf = fs.readFileSync(assetFullPath);
    }
    const { hash, key } = getAssetHashAndKey(assetBuf);
    return {
      name: assetName,
      hash,
      key,
      fileExtension: `.${asset.ext}`,
      contentType: asset.ext === 'png' ? 'image/png' : asset.ext === 'jpg' ? 'image/jpeg' : 'font/ttf',
    };
  });

  cachedManifestData = {
    updateId,
    rawUpdateId,
    bundleRelative,
    bundleMeta,
    assets,
  };

  return cachedManifestData;
}

module.exports = (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const platform = req.headers['expo-platform'] || req.query.platform || 'android';
  const runtimeVersion = req.headers['expo-runtime-version'] || req.query['runtime-version'] || '1.1.0';
  const clientProtocolVersion = req.headers['expo-protocol-version'] || '1';
  const acceptHeader = req.headers['accept'] || '';
  const currentUpdateId = req.headers['expo-current-update-id'];

  const manifestData = loadManifestData(platform);
  if (!manifestData) {
    res.setHeader('expo-protocol-version', clientProtocolVersion);
    res.setHeader('expo-sfv-version', 0);
    return res.status(204).end();
  }

  const { updateId, rawUpdateId, bundleRelative, bundleMeta, assets } = manifestData;

  // Verifica se o dispositivo já está executando exatamente este update
  const isAlreadyUpToDate =
    currentUpdateId &&
    (currentUpdateId.replace(/-/g, '').toLowerCase() === rawUpdateId.toLowerCase() ||
     currentUpdateId.toLowerCase() === updateId.toLowerCase());

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'tkst-player.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;

  // Se o cliente já está 100% atualizado
  if (isAlreadyUpToDate) {
    res.setHeader('expo-protocol-version', clientProtocolVersion);
    res.setHeader('expo-sfv-version', 0);
    res.setHeader('cache-control', 'private, max-age=0');

    // Se o cliente aceita multipart/mixed (expo-updates protocolo 1)
    if (acceptHeader.includes('multipart/mixed') || clientProtocolVersion === '1') {
      const boundary = `---------------------------${Date.now()}`;
      const directiveBody = JSON.stringify({ type: 'noUpdateAvailable' });
      const multipartResponse =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="directive"\r\n` +
        `Content-Type: application/json; charset=utf-8\r\n\r\n` +
        directiveBody +
        `\r\n--${boundary}--\r\n`;

      res.setHeader('content-type', `multipart/mixed; boundary=${boundary}`);
      return res.status(200).send(Buffer.from(multipartResponse, 'utf-8'));
    }

    // Caso contrário, HTTP 204 No Content
    return res.status(204).end();
  }

  // Constrói o Manifest completo e 100% aderente ao protocolo Expo Updates v1
  const manifest = {
    id: updateId,
    createdAt: new Date().toISOString(),
    runtimeVersion: runtimeVersion,
    launchAsset: {
      hash: bundleMeta.hash,
      key: bundleMeta.key,
      fileExtension: '.bundle',
      contentType: 'application/javascript',
      url: `${baseUrl}/api/assets?asset=${encodeURIComponent(bundleRelative)}`,
    },
    assets: assets.map((a) => ({
      hash: a.hash,
      key: a.key,
      fileExtension: a.fileExtension,
      contentType: a.contentType,
      url: `${baseUrl}/assets/${a.name}`,
    })),
    metadata: {},
    extra: {
      expoClient: {
        name: 'TKST Player',
        slug: 'tkst-player',
        version: '1.3.0',
      },
    },
  };

  res.setHeader('expo-protocol-version', clientProtocolVersion);
  res.setHeader('expo-sfv-version', 0);
  res.setHeader('cache-control', 'private, max-age=0');

  // Se o cliente aceita multipart/mixed (padrão nativo do expo-updates no Android)
  if (acceptHeader.includes('multipart/mixed') || clientProtocolVersion === '1') {
    const boundary = `---------------------------${Date.now()}`;
    const manifestJson = JSON.stringify(manifest);
    const extensionsJson = JSON.stringify({ assetRequestHeaders: {} });

    const multipartResponse =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="manifest"\r\n` +
      `Content-Type: application/json; charset=utf-8\r\n\r\n` +
      manifestJson +
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="extensions"\r\n` +
      `Content-Type: application/json; charset=utf-8\r\n\r\n` +
      extensionsJson +
      `\r\n--${boundary}--\r\n`;

    res.setHeader('content-type', `multipart/mixed; boundary=${boundary}`);
    return res.status(200).send(Buffer.from(multipartResponse, 'utf-8'));
  }

  // Fallback para ferramentas HTTP / inspeção JSON direta
  res.setHeader('content-type', 'application/expo+json; charset=utf-8');
  return res.status(200).json(manifest);
};
