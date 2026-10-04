module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.writeHead(302, {
    Location: 'https://github.com/albinokira-crypto/tkst-player/releases/latest/download/tkst-player.apk',
  });
  res.end();
};
