const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const masterPath = 'C:/Users/steph/.gemini/antigravity/brain/b4614428-c21c-4ae8-84de-e13652e1d2dc/payloadlogic_brand_master.jpg';
const publicDir = path.resolve(__dirname, '../public');
const brandDir = path.join(publicDir, 'brand');
const iconsDir = path.join(publicDir, 'icons');

if (!fs.existsSync(brandDir)) fs.mkdirSync(brandDir, { recursive: true });
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

async function run() {
  console.log('Reading master image...');
  const metadata = await sharp(masterPath).metadata();
  console.log('Master dimensions:', metadata.width, metadata.height);

  // 1. Crop App Icon (the rounded tile with truck and yellow route trace)
  // Box: x: 34, y: 268, width: 140, height: 140 (make it square)
  const iconCrop = { left: 34, top: 268, width: 140, height: 140 };
  
  // Save master app-icon.png
  await sharp(masterPath)
    .extract(iconCrop)
    .resize(512, 512, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(path.join(brandDir, 'app-icon.png'));
  console.log('Saved brand/app-icon.png');

  // Generate web/pwa/mobile icons
  const iconSizes = [
    { dir: publicDir, name: 'favicon-16x16.png', size: 16 },
    { dir: publicDir, name: 'favicon-32x32.png', size: 32 },
    { dir: publicDir, name: 'apple-touch-icon.png', size: 180 },
    { dir: publicDir, name: 'apple-touch-icon-152x152.png', size: 152 },
    { dir: publicDir, name: 'apple-touch-icon-120x120.png', size: 120 },
    { dir: iconsDir, name: 'icon-72x72.png', size: 72 },
    { dir: iconsDir, name: 'icon-96x96.png', size: 96 },
    { dir: iconsDir, name: 'icon-128x128.png', size: 128 },
    { dir: iconsDir, name: 'icon-144x144.png', size: 144 },
    { dir: iconsDir, name: 'icon-192x192.png', size: 192 },
    { dir: iconsDir, name: 'icon-384x384.png', size: 384 },
    { dir: iconsDir, name: 'icon-512x512.png', size: 512 },
  ];

  for (const item of iconSizes) {
    await sharp(masterPath)
      .extract(iconCrop)
      .resize(item.size, item.size, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toFile(path.join(item.dir, item.name));
  }
  console.log('Generated all PWA/iOS/Android icons.');

  // Maskable icon (needs safe zone margin on navy background #0c141f)
  const innerSize = Math.round(512 * 0.75); // 384px inside 512px
  const innerIconBuffer = await sharp(masterPath)
    .extract(iconCrop)
    .resize(innerSize, innerSize, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 12, g: 20, b: 31, alpha: 1 } // #0c141f
    }
  })
  .composite([{ input: innerIconBuffer, gravity: 'center' }])
  .png()
  .toFile(path.join(iconsDir, 'icon-maskable-512x512.png'));
  console.log('Saved icon-maskable-512x512.png');

  // Copy 32x32 as favicon.ico (modern browsers accept 32x32 PNG for favicon.ico or we generate ICO format)
  fs.copyFileSync(path.join(publicDir, 'favicon-32x32.png'), path.join(publicDir, 'favicon.ico'));

  // 2. Crop Horizontal Logo (Icon + "PayloadLogic")
  // left: 34, top: 265, width: 930, height: 145
  await sharp(masterPath)
    .extract({ left: 34, top: 265, width: 930, height: 145 })
    .png()
    .toFile(path.join(brandDir, 'logo-horizontal.png'));
  console.log('Saved brand/logo-horizontal.png');

  // 3. Crop Full Logo with Tagline (Icon + "PayloadLogic" + "DISPATCH SOFTWARE FOR HOTSHOT TRUCKING")
  // left: 34, top: 265, width: 930, height: 230
  await sharp(masterPath)
    .extract({ left: 34, top: 265, width: 930, height: 230 })
    .png()
    .toFile(path.join(brandDir, 'logo-full.png'));
  console.log('Saved brand/logo-full.png');

  // 4. Create Splash Screen (1080x1920 portrait and 1920x1080 landscape)
  const fullLogoBuffer = await sharp(masterPath)
    .extract({ left: 34, top: 265, width: 930, height: 230 })
    .resize(750, null, { kernel: sharp.kernel.lanczos3 }) // 750px wide
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 4,
      background: { r: 12, g: 20, b: 31, alpha: 1 } // #0c141f
    }
  })
  .composite([{ input: fullLogoBuffer, gravity: 'center' }])
  .png()
  .toFile(path.join(brandDir, 'splash-portrait.png'));

  await sharp({
    create: {
      width: 1920,
      height: 1080,
      channels: 4,
      background: { r: 12, g: 20, b: 31, alpha: 1 } // #0c141f
    }
  })
  .composite([{ input: fullLogoBuffer, gravity: 'center' }])
  .png()
  .toFile(path.join(brandDir, 'splash-landscape.png'));
  console.log('Saved splash screens.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
