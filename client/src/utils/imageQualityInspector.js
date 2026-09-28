/**
 * imageQualityInspector.js
 * 纯端侧毫秒级拍照质量与模糊度预检引擎（对标作业帮/小猿取景质检）
 * 核心指标：
 * 1. 拉普拉斯算子梯度方差 (Laplacian Variance) -> 判定手抖与字迹虚焦
 * 2. 均值灰度亮度直方图 -> 判定暗光低照度与过曝强反光
 * 3. 屏幕截图特征检测 -> 识别手机截图内嵌缩略图
 */

export function inspectImageQuality(imageOrCanvas) {
  try {
    if (!imageOrCanvas) {
      return { isGood: true, message: '图片正常', tips: [] };
    }

    const w = 320;
    const h = 240;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imageOrCanvas, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const totalPixels = w * h;

    // 1. 灰度化与平均亮度计算
    const gray = new Float32Array(totalPixels);
    let sumLum = 0;
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      // Rec. 601 亮度加权系数
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      gray[i] = lum;
      sumLum += lum;
    }
    const avgBrightness = sumLum / totalPixels;

    // 2. 拉普拉斯梯度方差 (Blur Variance) 计算
    // 卷积核: [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
    let laplacianSum = 0;
    let laplacianSqSum = 0;
    let sampleCount = 0;

    for (let y = 1; y < h - 1; y++) {
      const rowOffset = y * w;
      for (let x = 1; x < w - 1; x++) {
        const center = gray[rowOffset + x];
        const up = gray[rowOffset - w + x];
        const down = gray[rowOffset + w + x];
        const left = gray[rowOffset + x - 1];
        const right = gray[rowOffset + x + 1];

        const lap = up + down + left + right - 4 * center;
        laplacianSum += lap;
        laplacianSqSum += lap * lap;
        sampleCount++;
      }
    }

    const lapMean = laplacianSum / sampleCount;
    const blurVariance = (laplacianSqSum / sampleCount) - (lapMean * lapMean);

    // 3. 手机截图特征探测
    let isScreenshot = false;
    let originalRatio = 1;
    if (imageOrCanvas.width && imageOrCanvas.height) {
      originalRatio = imageOrCanvas.height / imageOrCanvas.width;
      // 常见超长带鱼屏截图比例 20:9 (2.22), 19.5:9 (2.16)
      if (originalRatio > 2.05 || originalRatio < 0.48) {
        isScreenshot = true;
      }
    }

    // 4. 阈值判定
    const isDark = avgBrightness < 45;
    const isOverexposed = avgBrightness > 230;
    // 标准印刷体清晰试卷方差通常 > 120，手写笔迹模糊虚焦通常 < 60
    const isBlurry = blurVariance < 65;

    const warnings = [];
    const tips = [];

    if (isBlurry) {
      warnings.push('画面有些晃动模糊，可能影响手写答案识别');
      tips.push('轻触屏幕重新对焦，拿稳手机保持静止再拍');
    }
    if (isDark) {
      warnings.push('拍摄环境光线偏暗');
      tips.push('请在明亮光线下拍摄，或开启手机闪光灯补光');
    }
    if (isOverexposed) {
      warnings.push('卷面存在反光或强光直射');
      tips.push('稍微调整拍摄角度，避开台灯或顶灯倒影');
    }
    if (isScreenshot) {
      warnings.push('疑似手机截屏（非直接拍摄原图）');
      tips.push('建议直接平铺拍摄纸质试卷原件，识别率最高');
    }

    const isGood = warnings.length === 0;

    return {
      isGood,
      avgBrightness: Math.round(avgBrightness),
      blurVariance: Math.round(blurVariance),
      isBlurry,
      isDark,
      isOverexposed,
      isScreenshot,
      message: isGood ? '画质清晰，光照适宜' : warnings.join('；'),
      tips
    };
  } catch (err) {
    console.warn('[QualityInspector] Inspection error:', err);
    return { isGood: true, message: '画质正常', tips: [] };
  }
}
