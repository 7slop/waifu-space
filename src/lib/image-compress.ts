/**
 * Compresses an image File using HTML5 Canvas to a lightweight WebP or JPEG Blob / DataURL.
 * Max dimensions: 512x512, default quality 0.82.
 * Typically reduces a 2MB-10MB phone photo or high-res art down to ~25KB-70KB.
 */
export async function compressImage(
  file: File | Blob,
  maxWidth = 512,
  maxHeight = 512,
  quality = 0.82
): Promise<{ blob: Blob; dataUrl: string }> {
  if (typeof window === 'undefined') {
    throw new Error('Image compression requires a browser environment');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;

    img.onload = () => {
      let { width, height } = img;

      // Scale proportionally if larger than constraints
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas 2d context'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Prefer image/webp for optimal compression, fallback to image/jpeg
      const mimeType = 'image/webp';
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            // Fallback to jpeg if webp unsupported
            canvas.toBlob(
              (fallbackBlob) => {
                if (!fallbackBlob) {
                  reject(new Error('Canvas blob generation failed'));
                  return;
                }
                const fallbackDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve({ blob: fallbackBlob, dataUrl: fallbackDataUrl });
              },
              'image/jpeg',
              quality
            );
            return;
          }
          const dataUrl = canvas.toDataURL(mimeType, quality);
          resolve({ blob, dataUrl });
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image for compression'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an image intended as a full-screen wallpaper.
 * Keeps a large enough dimension for crisp backgrounds while still
 * capping the resulting data URL so it fits comfortably in localStorage.
 * Max dimensions: 1920x1920, quality 0.75 -> typically 150KB-450KB.
 */
export async function compressWallpaper(
  file: File | Blob,
  maxWidth = 1920,
  maxHeight = 1920,
  quality = 0.75
): Promise<{ blob: Blob; dataUrl: string }> {
  const result = await compressImage(file, maxWidth, maxHeight, quality);

  // Safety net: if the encoded wallpaper still exceeds ~4.5MB (extremely
  // unlikely after downscale), re-encode at a smaller size to stay under
  // typical localStorage quotas.
  if (result.dataUrl.length > 4_500_000) {
    return compressImage(file, 1280, 1280, 0.65);
  }

  return result;
}
