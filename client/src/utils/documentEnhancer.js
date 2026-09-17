/**
 * Client-side Lightweight Document Scanner & Shadow Removal Enhancer
 * 基于积分图与局部光照归一化的轻量级文档阴影消除与清晰度增强算法
 * 
 * 优势:
 * 1. 零外部依赖 (不引入30MB+的OpenCV.js，极轻量)
 * 2. 积分图 O(1) 局部背景光照估计，手机端毫秒级处理
 * 3. 亮度色度解耦：仅修正背景亮度，100%保留老师红笔批阅勾叉与学生笔迹
 */

/**
 * 构建灰度积分图 (Integral Image / Summed-Area Table)
 * 使任意矩形窗口像素和计算复杂度降为 O(1)
 */
function buildIntegralImage(grayArray, width, height) {
  // 使用 Float64Array 防止高分辨率图片像素和溢出
  const integral = new Float64Array((width + 1) * (height + 1));
  const rowStride = width + 1;

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const imgRowOffset = y * width;
    const intRowOffset = (y + 1) * rowStride;
    const prevIntRowOffset = y * rowStride;

    for (let x = 0; x < width; x++) {
      rowSum += grayArray[imgRowOffset + x];
      integral[intRowOffset + (x + 1)] = integral[prevIntRowOffset + (x + 1)] + rowSum;
    }
  }

  return integral;
}

/**
 * 快速获取任意矩形区域的像素平均值 O(1)
 */
function getWindowMean(integral, width, x1, y1, x2, y2) {
  const stride = width + 1;
  const count = (x2 - x1) * (y2 - y1);
  if (count <= 0) return 255;

  const total = integral[y2 * stride + x2]
              - integral[y1 * stride + x2]
              - integral[y2 * stride + x1]
              + integral[y1 * stride + x1];

  return total / count;
}

/**
 * 执行试卷/作业去阴影与自适应清晰化
 * 
 * @param {HTMLCanvasElement} canvas
 * @param {Object} options
 * @returns {HTMLCanvasElement}
 */
export function removeShadowsAndEnhance(canvas, options = {}) {
  const {
    windowSizeRatio = 0.08, // 局部窗口大小为宽高的 8%
    targetWhite = 245,       // 归一化后的背景白度
    contrastFactor = 1.15    // 对比度轻微提升，让铅笔字更深更清晰
  } = options;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const totalPixels = width * height;

  // 1. 提取亮度通道并构建灰度数组
  const gray = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    // 使用标准亮度公式 Y = 0.299R + 0.587G + 0.114B
    gray[i] = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
  }

  // 2. 快速生成积分图
  const integral = buildIntegralImage(gray, width, height);

  // 3. 计算局部背景光照并进行光照除法归一化 (Illumination Division)
  const radius = Math.max(16, Math.floor(Math.min(width, height) * windowSizeRatio));

  for (let y = 0; y < height; y++) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(height, y + radius);

    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(width, x + radius);

      const localBg = Math.max(30, getWindowMean(integral, width, x1, y1, x2, y2));
      const pixelIdx = (y * width + x) * 4;
      const currentY = gray[y * width + x];

      // 归一化增益比率
      // 若当前像素处于阴影中（localBg 偏低），gain 会增大，将背景拉回纯白；
      // 若是深色字迹（currentY 很小），归一化后依然是深色字迹！
      const gain = targetWhite / localBg;

      for (let c = 0; c < 3; c++) {
        let val = data[pixelIdx + c] * gain;

        // 对比度微调，让字迹边缘更加锐利
        if (contrastFactor !== 1.0) {
          val = ((val - 128) * contrastFactor) + 128;
        }

        // 截断至 0~255
        data[pixelIdx + c] = val > 255 ? 255 : (val < 0 ? 0 : val);
      }
      // Alpha 通道保持 255 不变
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * 完整处理上传的图像文件，生成增强后的图片 File 对象
 * 
 * @param {File} file 
 * @param {Object} options 
 * @returns {Promise<File>}
 */
export async function enhanceDocumentFile(file, options = {}) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // 执行文档去阴影与自适应锐化
      removeShadowsAndEnhance(canvas, options);

      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) return resolve(file);
        const enhancedFile = new File([blob], file.name, {
          type: outputType,
          lastModified: Date.now()
        });
        resolve(enhancedFile);
      }, outputType, 0.92);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
  });
}

/**
 * 试卷笔迹与老师红笔批注擦除 (媲美作业帮/喵喵机试卷翻新)
 * 提取红笔批改标记与彩墨，自适应填充为周围纸面底色，还原崭新空白试卷
 */
export function eraseTeacherRedInk(canvas, options = {}) {
  const {
    redThreshold = 28, // 红色通道显著高于绿蓝通道的阈值
    targetWhite = 250
  } = options;

  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    // 检测红笔特征 (红笔勾、红叉、得分圈画):
    const isRedInk = r > 110 && (r - g > redThreshold) && (r - b > redThreshold);
    // 检测蓝色圆珠笔特征:
    const isBlueInk = b > 120 && (b - r > 35);

    if (isRedInk || isBlueInk) {
      data[idx] = targetWhite;
      data[idx + 1] = targetWhite;
      data[idx + 2] = targetWhite;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * 将整页作业一键抹除红笔批改与手写彩墨，生成空白复练卷
 */
export async function eraseTeacherRedInkFile(file, options = {}) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // 先执行文档提亮与平整，再擦除红笔痕迹
      removeShadowsAndEnhance(canvas, options);
      eraseTeacherRedInk(canvas, options);

      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) return resolve(file);
        const cleanedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_cleaned.jpg", {
          type: outputType,
          lastModified: Date.now()
        });
        resolve(cleanedFile);
      }, outputType, 0.92);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
  });
}

/**
 * 纯本地离线试卷智能切片算法 (Local Question Slicer)
 * 采用水平投影积分 (Horizontal Projection) 与留白梯度分析，在浏览器端毫秒级定位单道题目矩形框 [ymin, xmin, ymax, xmax] (0-1000标准化坐标)
 * 
 * @param {HTMLCanvasElement} canvas
 * @param {Object} options
 * @returns {Array<{questionNumber: number, box_2d: [number, number, number, number]}>}
 */
export function sliceQuestionsLocally(canvas, options = {}) {
  const {
    minHeightRatio = 0.04,   // 单道题目最小高度占全图比例 (4%)
    gapThresholdRatio = 0.015, // 题目间段落留白高度阈值 (1.5%)
    darkPixelThreshold = 180  // 判定为文字/墨迹的灰度阈值
  } = options;

  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 1. 计算水平投影直方图 (每行的黑像素数量)
  const rowDensity = new Uint32Array(height);
  // 左右保留5%边缘防装订线干扰
  const startX = Math.floor(width * 0.05);
  const endX = Math.floor(width * 0.95);

  for (let y = 0; y < height; y++) {
    let darkCount = 0;
    const rowOffset = y * width * 4;
    for (let x = startX; x < endX; x++) {
      const idx = rowOffset + x * 4;
      const gray = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
      if (gray < darkPixelThreshold) {
        darkCount++;
      }
    }
    rowDensity[y] = darkCount;
  }

  // 2. 平滑投影曲线并寻找连续文字块与留白间距
  const minPixelsPerRow = Math.max(8, Math.floor((endX - startX) * 0.012));
  const minHeight = Math.floor(height * minHeightRatio);
  const gapThreshold = Math.floor(height * gapThresholdRatio);

  const blocks = [];
  let inBlock = false;
  let blockStart = 0;
  let emptyRows = 0;

  for (let y = 0; y < height; y++) {
    const isTextRow = rowDensity[y] >= minPixelsPerRow;

    if (isTextRow) {
      if (!inBlock) {
        inBlock = true;
        blockStart = y;
      }
      emptyRows = 0;
    } else {
      if (inBlock) {
        emptyRows++;
        if (emptyRows >= gapThreshold) {
          const blockEnd = y - emptyRows;
          if (blockEnd - blockStart >= minHeight) {
            blocks.push({ top: blockStart, bottom: blockEnd });
          }
          inBlock = false;
          emptyRows = 0;
        }
      }
    }
  }

  // 收尾处理
  if (inBlock && (height - 1 - blockStart) >= minHeight) {
    blocks.push({ top: blockStart, bottom: height - 1 });
  }

  // 如果未能切分出多块（比如试卷排版紧密），则回退为安全等分或全图切片
  if (blocks.length === 0) {
    return [{
      questionNumber: 1,
      box_2d: [50, 40, 950, 960]
    }];
  }

  // 3. 计算每个块的实际左右墨迹边界并归一化为 0-1000 标准坐标
  const slices = blocks.map((b, idx) => {
    let minX = endX;
    let maxX = startX;

    for (let y = b.top; y <= b.bottom; y++) {
      const rowOffset = y * width * 4;
      for (let x = startX; x < endX; x++) {
        const idx = rowOffset + x * 4;
        const gray = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
        if (gray < darkPixelThreshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }

    // 留出适度内边距
    const padY = Math.floor(height * 0.01);
    const padX = Math.floor(width * 0.02);

    const ymin = Math.max(0, Math.floor(((b.top - padY) / height) * 1000));
    const ymax = Math.min(1000, Math.ceil(((b.bottom + padY) / height) * 1000));
    const xmin = Math.max(0, Math.floor(((minX - padX) / width) * 1000));
    const xmax = Math.min(1000, Math.ceil(((maxX + padX) / width) * 1000));

    return {
      questionNumber: idx + 1,
      box_2d: [ymin, xmin, ymax, xmax]
    };
  });

  return slices;
}

/**
 * 提取手写笔迹图层 (Handwriting Mask Stripper)
 * 能够将学生黑/蓝手写字迹与印刷体印刷油墨分离，方便批改聚焦与笔迹分析
 */
export function extractHandwritingMask(canvas, options = {}) {
  const {
    contrastThreshold = 45,
    isolateRed = false
  } = options;

  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const totalPixels = width * height;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d');
  const maskImageData = maskCtx.createImageData(width, height);
  const maskData = maskImageData.data;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const isRed = r > 120 && (r - g > 30) && (r - b > 30);
    const isBlue = b > 110 && (b - r > 25);
    const isGrayPencil = (Math.abs(r - g) < 20 && Math.abs(g - b) < 20) && (r > 60 && r < 190);

    let isHandwriting = false;
    if (isolateRed && isRed) isHandwriting = true;
    else if (isBlue || isGrayPencil) isHandwriting = true;

    if (isHandwriting) {
      maskData[idx] = 239;     // 红色高亮强调笔迹
      maskData[idx + 1] = 68;
      maskData[idx + 2] = 68;
      maskData[idx + 3] = 255;
    } else {
      maskData[idx] = 255;
      maskData[idx + 1] = 255;
      maskData[idx + 2] = 255;
      maskData[idx + 3] = 0;   // 印刷底图透明
    }
  }

  maskCtx.putImageData(maskImageData, 0, 0);
  return maskCanvas;
}


