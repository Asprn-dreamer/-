
export interface ImageState {
  originalUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  fileName: string;
}

export interface SliceResult {
  id: string;
  url: string;
  index: number;
  format: string;
  sizeLabel: string;
}

export type ExportFormat = 'jpeg' | 'png' | 'gif';

export interface ProcessingOptions {
  targetWidth: number;
  targetHeight: number;
  sliceHeight: number;
  keepAspectRatio: boolean;
  exportFormat: ExportFormat;
}
