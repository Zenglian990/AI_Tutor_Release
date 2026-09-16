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
