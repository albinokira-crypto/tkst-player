const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const possiblePaths = [
    path.join(__dirname, 'bundle_data.hbc'),
    path.join(process.cwd(), 'api', 'bundle_data.hbc'),
    path.join(process.cwd(), 'public', 'bundle.hbc'),
    path.join(process.cwd(), 'updates', 'bundle_data.hbc'),
  ];

  let bundlePath = null;
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        bundlePath = p;
        break;
      }
    } catch {}
  }

  if (!bundlePath) {
    return res.status(404).json({
      error: 'Bundle not found',
      cwd: process.cwd(),
      dir: fs.readdirSync(process.cwd()),
      dirname: __dirname,
    });
  }

  try {
    const fileBuffer = fs.readFileSync(bundlePath);
    res.setHeader('content-type', 'application/javascript');
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.setHeader('content-length', fileBuffer.length);

    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    return res.status(200).send(fileBuffer);
  } catch (error) {
    console.error('Erro ao servir bundle:', error);
    return res.status(500).json({ error: error.message });
  }
};
