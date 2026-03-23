
import { SliceResult, ProcessingOptions, ExportQuality } from '../types';

const getQualityValue = (quality: ExportQuality): number => {
  switch (quality) {
    case 'high': return 0.92;
    case 'medium': return 0.8;
    case 'low': return 0.6;
    default: return 0.92;
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getBase64Size = (base64String: string): number => {
  const stringWithoutPrefix = base64String.split(',')[1];
  if (!stringWithoutPrefix) return 0;
  return Math.floor((stringWithoutPrefix.length * 3) / 4);
};

export const loadAllImages = async (urls: string[]): Promise<HTMLImageElement[]> => {
  return Promise.all(urls.map(url => loadImage(url)));
};

export const processImage = async (
  imageElement: HTMLImageElement | HTMLCanvasElement,
  options: ProcessingOptions
): Promise<SliceResult[]> => {
  const { targetWidth, targetHeight, sliceHeight, enableSlicing, exportFormat, maxSliceSize, quality } = options;
  const qualityValue = getQualityValue(quality);
  
  const resizeCanvas = document.createElement('canvas');
  resizeCanvas.width = targetWidth;
  resizeCanvas.height = targetHeight;
  const ctx = resizeCanvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  if (exportFormat === 'jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }
  ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);
  
  const mimeType = `image/${exportFormat}`;
  const slices: SliceResult[] = [];

  if (!enableSlicing) {
    const dataUrl = resizeCanvas.toDataURL(mimeType, exportFormat === 'jpeg' ? qualityValue : undefined);
    const sizeInBytes = getBase64Size(dataUrl);
    
    slices.push({
      id: `full-${Date.now()}`,
      url: dataUrl,
      index: 0,
      format: exportFormat,
      sizeLabel: formatBytes(sizeInBytes)
    });
    return slices;
  }

  let currentY = 0;
  let index = 0;
  const maxSizeBytes = maxSliceSize * 1024;

  while (currentY < targetHeight) {
    // 如果 sliceHeight 为 0，则初始高度为剩余高度
    let initialSliceHeight = sliceHeight > 0 ? Math.min(sliceHeight, targetHeight - currentY) : (targetHeight - currentY);
    let actualSliceHeight = initialSliceHeight;
    let dataUrl = '';
    let sizeInBytes = 0;
    let attempts = 0;

    // 如果设置了最大内存限制，尝试调整高度
    while (attempts < 5) {
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = targetWidth;
      sliceCanvas.height = actualSliceHeight;
      const sliceCtx = sliceCanvas.getContext('2d');
      
      if (sliceCtx) {
        sliceCtx.imageSmoothingEnabled = true;
        sliceCtx.imageSmoothingQuality = 'high';
        
        if (exportFormat === 'jpeg') {
          sliceCtx.fillStyle = '#FFFFFF';
          sliceCtx.fillRect(0, 0, targetWidth, actualSliceHeight);
        }

        sliceCtx.drawImage(
          resizeCanvas,
          0, currentY, targetWidth, actualSliceHeight,
          0, 0, targetWidth, actualSliceHeight
        );
        
        dataUrl = sliceCanvas.toDataURL(mimeType, exportFormat === 'jpeg' ? qualityValue : undefined);
        sizeInBytes = getBase64Size(dataUrl);

        // 如果没有限制，或者大小在限制内，或者高度已经很小了，就退出循环
        if (maxSizeBytes <= 0 || sizeInBytes <= maxSizeBytes || actualSliceHeight <= 100) {
          break;
        }

        // 估算新高度：按比例缩小，但至少保留一半高度或 100 像素
        const ratio = maxSizeBytes / sizeInBytes;
        actualSliceHeight = Math.max(100, Math.floor(actualSliceHeight * ratio * 0.95)); // 0.95 是安全系数
      } else {
        break;
      }
      attempts++;
    }

    slices.push({
      id: `slice-${Date.now()}-${index}`,
      url: dataUrl,
      index,
      format: exportFormat,
      sizeLabel: formatBytes(sizeInBytes)
    });
    
    currentY += actualSliceHeight;
    index++;
  }

  return slices;
};

export const stitchImages = async (
  images: HTMLImageElement[],
  targetWidth: number,
  exportFormat: string
): Promise<HTMLCanvasElement> => {
  let totalHeight = 0;
  const scaledImages = images.map(img => {
    const scale = targetWidth / img.width;
    const height = Math.round(img.height * scale); // 避免非整数高度导致模糊
    totalHeight += height;
    return { img, height };
  });

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Could not get canvas context');

  // 核心优化：设置高质量缩放算法
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (exportFormat === 'jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, totalHeight);
  }

  let currentY = 0;
  scaledImages.forEach(({ img, height }) => {
    ctx.drawImage(img, 0, currentY, targetWidth, height);
    currentY += height;
  });

  return canvas;
};

export const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
};
