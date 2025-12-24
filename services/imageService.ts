
import { SliceResult, ProcessingOptions } from '../types';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getBase64Size = (base64String: string): number => {
  // data:image/jpeg;base64,....
  const stringWithoutPrefix = base64String.split(',')[1];
  if (!stringWithoutPrefix) return 0;
  // Size in bytes is approximately string length * 3/4
  return Math.floor((stringWithoutPrefix.length * 3) / 4);
};

export const processImage = async (
  imageElement: HTMLImageElement,
  options: ProcessingOptions
): Promise<SliceResult[]> => {
  const { targetWidth, targetHeight, sliceHeight, exportFormat } = options;
  
  // 1. Resize the image to the target dimensions
  const resizeCanvas = document.createElement('canvas');
  resizeCanvas.width = targetWidth;
  resizeCanvas.height = targetHeight;
  const ctx = resizeCanvas.getContext('2d');
  
  if (!ctx) throw new Error('Could not get canvas context');
  
  // For JPEG, we want a white background instead of transparent
  if (exportFormat === 'jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }
  
  ctx.drawImage(imageElement, 0, 0, targetWidth, targetHeight);
  
  // 2. Slice the resized image
  const slices: SliceResult[] = [];
  let currentY = 0;
  let index = 0;

  const mimeType = `image/${exportFormat}`;

  while (currentY < targetHeight) {
    const actualSliceHeight = Math.min(sliceHeight, targetHeight - currentY);
    
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = targetWidth;
    sliceCanvas.height = actualSliceHeight;
    const sliceCtx = sliceCanvas.getContext('2d');
    
    if (sliceCtx) {
      // Background for slices if JPEG
      if (exportFormat === 'jpeg') {
        sliceCtx.fillStyle = '#FFFFFF';
        sliceCtx.fillRect(0, 0, targetWidth, actualSliceHeight);
      }

      sliceCtx.drawImage(
        resizeCanvas,
        0, currentY, targetWidth, actualSliceHeight, // Source
        0, 0, targetWidth, actualSliceHeight        // Destination
      );
      
      const dataUrl = sliceCanvas.toDataURL(mimeType, exportFormat === 'jpeg' ? 0.92 : undefined);
      const sizeInBytes = getBase64Size(dataUrl);

      slices.push({
        id: `slice-${Date.now()}-${index}`,
        url: dataUrl,
        index,
        format: exportFormat,
        sizeLabel: formatBytes(sizeInBytes)
      });
    }
    
    currentY += actualSliceHeight;
    index++;
  }

  return slices;
};

export const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
};
