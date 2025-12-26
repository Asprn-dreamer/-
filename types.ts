
export interface ImageState {
  id: string;
  originalUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  slices: SliceResult[];
}

export interface SliceResult {
  id: string;
  url: string;
  index: number;
  format: string;
  sizeLabel: string;
}

export type ExportFormat = 'jpeg' | 'png';

export interface ProcessingOptions {
  targetWidth: number;
  targetHeight: number;
  sliceHeight: number;
  keepAspectRatio: boolean;
  exportFormat: ExportFormat;
}
