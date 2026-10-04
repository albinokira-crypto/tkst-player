const fetch = globalThis.fetch;
const crypto = require('crypto');
function getBase64URLEncoding(str) { return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function getAssetHashAndKey(buf) {
  const hash = getBase64URLEncoding(crypto.createHash('sha256').update(buf).digest('base64'));
  const key = crypto.createHash('md5').update(buf).digest('hex');
  return { hash, key };
}

async function verifyHash() {
  console.log('Fetching live manifest from Vercel...');
  const manifestRes = await fetch('https://tkst-player.vercel.app/api/manifest', {
    headers: { 'expo-platform': 'android', 'expo-runtime-version': '1.1.0', 'expo-protocol-version': '1', 'accept': 'multipart/mixed' }
  });
  const text = await manifestRes.text();
  const matchId = text.match(/"id":"([^"]+)"/);
  const matchHash = text.match(/"launchAsset":\{[\s\S]*?"hash":"([^"]+)"/);
  const manifestId = matchId ? matchId[1] : null;
  const manifestHash = matchHash ? matchHash[1] : null;
  console.log('Manifest Update ID:', manifestId);
  console.log('Manifest launchAsset hash:', manifestHash);

  console.log('Fetching live bundle from Vercel...');
  const bundleRes = await fetch('https://tkst-player.vercel.app/api/bundle?v=' + manifestId);
  const bundleBuf = Buffer.from(await bundleRes.arrayBuffer());
  const actual = getAssetHashAndKey(bundleBuf);
  console.log('Actual downloaded bundle hash:', actual.hash);
  console.log('Match?', manifestHash === actual.hash);
  console.log('Contains v1.7.0?', bundleBuf.toString('utf8').includes('1.7.0'));
}
verifyHash();
