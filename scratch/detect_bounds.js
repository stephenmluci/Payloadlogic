const sharp = require('sharp');
const imgPath = 'C:/Users/steph/.gemini/antigravity/brain/b4614428-c21c-4ae8-84de-e13652e1d2dc/.user_uploaded/media_1794160387625_75cac4f8.jpg';

sharp(imgPath).raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => {
  const getPixel = (x, y) => {
    const idx = (y * info.width + x) * info.channels;
    return [data[idx], data[idx+1], data[idx+2]];
  };
  const bg = [12, 20, 31];
  const isFg = (x, y, thresh = 20) => {
    const p = getPixel(x, y);
    const dist = Math.abs(p[0]-bg[0]) + Math.abs(p[1]-bg[1]) + Math.abs(p[2]-bg[2]);
    return dist > thresh;
  };

  let colFg = [];
  for (let x = 30; x < 250; x++) {
    let count = 0;
    for (let y = 260; y <= 420; y++) {
      if (isFg(x, y, 15)) count++;
    }
    colFg.push({ x, count });
  }
  let gapCols = colFg.filter(c => c.count === 0);
  console.log('Gap columns between icon and text:', gapCols.map(c => c.x));

  let iconMinX = 1000, iconMaxX = 0, iconMinY = 1000, iconMaxY = 0;
  for (let y = 260; y <= 420; y++) {
    for (let x = 30; x <= 180; x++) {
      if (isFg(x, y, 10)) {
        if (x < iconMinX) iconMinX = x;
        if (x > iconMaxX) iconMaxX = x;
        if (y < iconMinY) iconMinY = y;
        if (y > iconMaxY) iconMaxY = y;
      }
    }
  }
  console.log('App icon exact box:', { iconMinX, iconMaxX, iconMinY, iconMaxY, width: iconMaxX - iconMinX + 1, height: iconMaxY - iconMinY + 1 });
});
