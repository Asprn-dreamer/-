
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
export type ProcessingMode = 'individual' | 'mosaic';

export interface ProcessingOptions {
  mode: ProcessingMode;
  targetWidth: number;
  targetHeight: number;
  sliceHeight: number;
  enableSlicing: boolean;
  keepAspectRatio: boolean;
  exportFormat: ExportFormat;
}
