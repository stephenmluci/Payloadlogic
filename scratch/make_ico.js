const fs = require('fs');
const path = require('path');

const pngBuffer = fs.readFileSync(path.resolve(__dirname, '../public/favicon-32x32.png'));
const pngSize = pngBuffer.length;

// Standard ICO header (6 bytes) + 1 Directory Entry (16 bytes) = 22 bytes header
const icoHeader = Buffer.alloc(22);

// ICO Header
icoHeader.writeUInt16LE(0, 0); // Reserved
icoHeader.writeUInt16LE(1, 2); // Image type: 1 = icon
icoHeader.writeUInt16LE(1, 4); // Number of images: 1

// Directory Entry 1
icoHeader.writeUInt8(32, 6);   // Width
icoHeader.writeUInt8(32, 7);   // Height
icoHeader.writeUInt8(0, 8);    // Color palette
icoHeader.writeUInt8(0, 9);    // Reserved
icoHeader.writeUInt16LE(1, 10); // Color planes
icoHeader.writeUInt16LE(32, 12); // Bits per pixel
icoHeader.writeUInt32LE(pngSize, 14); // Image data size
icoHeader.writeUInt32LE(22, 18);     // Offset of image data

const icoBuffer = Buffer.concat([icoHeader, pngBuffer]);

fs.writeFileSync(path.resolve(__dirname, '../public/favicon.ico'), icoBuffer);
fs.writeFileSync(path.resolve(__dirname, '../src/app/favicon.ico'), icoBuffer);
console.log('Proper ICO file generated successfully! Total size:', icoBuffer.length);
