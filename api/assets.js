const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const assetName = req.query.asset;
  if (!assetName || typeof assetName !== 'string') {
    return res.status(400).json({ error: 'Parâmetro asset é obrigatório.' });
  }

  // Previne Directory Traversal
  const safeAsset = assetName.replace(/^(\.\.[\/\\])+/, '').replace(/\\/g, '/');
  
  // Se for o bundle de código JavaScript / Hermes, serve diretamente de __dirname
  const isBundle = safeAsset.includes('.hbc') || safeAsset.includes('bundle') || safeAsset.includes('index-');
  if (isBundle) {
    const bundlePaths = [
      path.join(__dirname, 'bundle_data.hbc'),
      path.join(process.cwd(), 'api', 'bundle_data.hbc'),
      path.join(process.cwd(), 'public', 'bundle.hbc'),
    ];
    for (const bp of bundlePaths) {
      if (fs.existsSync(bp) && fs.statSync(bp).isFile()) {
        const fileBuffer = fs.readFileSync(bp);
        res.setHeader('content-type', 'application/javascript');
        res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        res.setHeader('content-length', fileBuffer.length);
        return res.status(200).send(fileBuffer);
      }
    }
  }

  const possiblePaths = [
    path.join(process.cwd(), 'updates', safeAsset),
    path.join(process.cwd(), 'updates', 'assets', path.basename(safeAsset)),
    path.join(process.cwd(), 'updates', path.basename(safeAsset)),
    path.join(process.cwd(), 'api', path.basename(safeAsset)),
    path.join(process.cwd(), 'updates', safeAsset.replace(/^_expo\//, 'bundles/')),
    path.join(process.cwd(), 'public', safeAsset),
    path.join(process.cwd(), safeAsset),
  ];

  let filePath = possiblePaths.find((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    let updatesDir = [];
    try {
      updatesDir = fs.readdirSync(path.join(process.cwd(), 'updates'));
    } catch (e) {
      updatesDir = [e.message];
    }
    return res.status(404).json({
      error: `Asset ${safeAsset} não encontrado.`,
      cwd: process.cwd(),
      dir: fs.readdirSync(process.cwd()),
      updatesDir,
      attempted: filePath
    });
  }

  try {
    const isBundle = safeAsset.includes('.hbc') || safeAsset.includes('bundle') || safeAsset.includes('.js');
    let contentType = 'application/octet-stream';
    if (isBundle) {
      contentType = 'application/javascript';
    } else if (safeAsset.endsWith('.png')) {
      contentType = 'image/png';
    } else if (safeAsset.endsWith('.jpg') || safeAsset.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (safeAsset.endsWith('.ttf')) {
      contentType = 'font/ttf';
    }

    const fileBuffer = fs.readFileSync(filePath);
    res.setHeader('content-type', contentType);
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    return res.status(200).send(fileBuffer);
  } catch (error) {
    console.error('Erro ao servir asset:', error);
    return res.status(500).json({ error: error.message });
  }
};
