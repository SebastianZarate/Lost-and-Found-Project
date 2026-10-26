module.exports = {
  globDirectory: '.',
  globPatterns: [
    'index.html',
    'manifest.json',
    'css/*.css',
    'js/*.js',
    'vendor/leaflet/*.js',
    'vendor/leaflet/*.css',
    'vendor/leaflet/images/*',
    'icons/*.png'
  ],
  globIgnores: [
    'node_modules/**/*',
    'workbox-config.cjs',
    'workbox-config.js',
    'package*.json',
    'sw-propio.js',
    'sw.js.map',
    'lib/**/*',
    'servidor-datos.json',
    'claves-vapid.json'
  ],
  swSrc: 'sw-propio.js',
  swDest: 'sw.js'
};
