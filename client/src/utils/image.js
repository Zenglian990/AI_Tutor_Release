import heic2any from 'heic2any';

/**
 * Compress image file, with optional HEIC to JPEG conversion support.
 * 
 * @param {File} file 
 * @param {number} maxWidth 
 * @param {number} maxHeight 
 * @param {number} quality 
 * @returns {Promise<File>}
 */
export const compressImage = async (file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) => {
  let imageFile = file;
  if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
    try {
      const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality });
      const convertedFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      imageFile = new File([convertedFile], file.name.replace(/\.heic$|\.heif$/i, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() });
    } catch (e) {
      console.error('HEIC conversion failed', e);
      alert('HEIC 照片过大，解码失败，请使用系统自带相册裁剪或转为 JPG 后再上传。');
      throw e;
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(imageFile);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio; height *= ratio;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }) : file);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
};
