import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
  * Save or Share an image (Base64 dataUrl)
  * On Android Native: Writes base64 to Cache/Documents and calls system share (WeChat, Album, QQ, etc.)
  * On Web: Falls back to a.download trigger
  * 
  * @param {Object} options
  * @param {string} options.dataUrl - e.g. "data:image/png;base64,..."
  * @param {string} options.filename - e.g. "曾练专属私教_学习报表.png"
  * @param {string} [options.title] - Share title
  * @param {string} [options.text] - Share text
  * @returns {Promise<{ success: boolean, method: string, uri?: string, error?: any }>}
  */
export async function saveOrShareImage({ dataUrl, filename, title, text }) {
  if (!dataUrl) return { success: false, error: 'Empty dataUrl' };

  const isNative = Capacitor.isNativePlatform();
  const safeFilename = filename || `AI_Tutor_${Date.now()}.png`;

  if (isNative) {
    try {
      // 1. Strip mime prefix if present
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

      // 2. Write file to Cache
      const fileResult = await Filesystem.writeFile({
        path: safeFilename,
        data: base64Data,
        directory: Directory.Cache
      });

      // 3. Share or save via system share sheet
      const canShareResult = await Share.canShare();
      if (canShareResult && canShareResult.value) {
        await Share.share({
          title: title || '曾练专属私教',
          text: text || '曾练专属私教 · 学习档案',
          url: fileResult.uri,
          dialogTitle: '分享或保存到相册'
        });
        return { success: true, method: 'native-share', uri: fileResult.uri };
      }
      return { success: true, method: 'native-file-saved', uri: fileResult.uri };
    } catch (nativeErr) {
      console.warn('[nativeShare] Native operation failed, attempting web fallback:', nativeErr);
    }
  }

  // Web fallback
  try {
    const link = document.createElement('a');
    link.download = safeFilename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { success: true, method: 'web-download' };
  } catch (webErr) {
    console.error('[nativeShare] Fallback download failed:', webErr);
    return { success: false, error: webErr };
  }
}
