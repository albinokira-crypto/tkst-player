const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const assetName = req.query.asset;
  if (!assetName || typeof assetName !== 'string') {
    return res.status(400).json({ error: 'Parâmetro asset é obrigatório.' });
  }

  // Previne Directory Traversal
  const safeAsset = assetName.replace(/^(\.\.[\/\\])+/, '').replace(/\\/g, '/');
  
  // Procura o arquivo em updates/ ou public/
  let filePath = path.join(process.cwd(), 'updates', safeAsset);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(process.cwd(), 'public', safeAsset);
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(process.cwd(), safeAsset);
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: `Asset ${safeAsset} não encontrado.` });
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
