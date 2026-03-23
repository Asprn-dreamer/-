
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Trash2, 
  Layers, 
  Maximize2, 
  Download, 
  Archive, 
  Zap, 
  Settings2, 
  ChevronLeft, 
  ChevronRight, 
  X,
  Image as ImageIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  GripVertical
} from 'lucide-react';
import { ImageState, SliceResult, ProcessingOptions, ExportFormat, ProcessingMode } from './types';
import { processImage, loadImage, loadAllImages, stitchImages } from './services/imageService';
import { analyzeImageSlicing } from './services/aiService';
import NumberInput from './components/NumberInput';
import JSZip from 'jszip';

const App: React.FC = () => {
  const [images, setImages] = useState<ImageState[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPackaging, setIsPackaging] = useState(false);
  const [previewData, setPreviewData] = useState<{ imageId: string; sliceIndex: number } | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  
  const [options, setOptions] = useState<ProcessingOptions>({
    mode: 'individual',
    targetWidth: 0,
    targetHeight: 0,
    sliceHeight: 1200,
    enableSlicing: true,
    keepAspectRatio: true,
    exportFormat: 'jpeg',
    maxSliceSize: 0,
    quality: 'high',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: File[]) => {
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const newImage: ImageState = {
          id: Math.random().toString(36).substr(2, 9),
          originalUrl: url,
          width: img.width,
          height: img.height,
          aspectRatio: img.width / img.height,
          fileName: file.name.split('.').slice(0, -1).join('.'),
          status: 'pending',
          slices: []
        };
        
        setImages(prev => [...prev, newImage]);
        
        if (images.length === 0 && options.targetWidth === 0) {
          setOptions(prev => ({
            ...prev,
            targetWidth: img.width,
            targetHeight: img.height
          }));
        }
      };
      img.src = url;
    });
  }, [images.length, options.targetWidth]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    if (files.length === 0) return;
    handleFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    if (previewData?.imageId === id) setPreviewData(null);
  };

  const clearAll = () => {
    setImages([]);
    setPreviewData(null);
  };

  const useMaxOriginalWidth = () => {
    if (images.length === 0) return;
    const maxWidth = Math.max(...images.map(img => img.width));
    updateWidth(maxWidth);
  };

  const updateWidth = (newWidth: number) => {
    if (options.keepAspectRatio && images.length > 0) {
      const firstImg = images[0];
      const newHeight = Math.round(newWidth / firstImg.aspectRatio);
      setOptions(prev => ({ ...prev, targetWidth: newWidth, targetHeight: newHeight }));
    } else {
      setOptions(prev => ({ ...prev, targetWidth: newWidth }));
    }
  };

  const updateHeight = (newHeight: number) => {
    if (options.keepAspectRatio && images.length > 0) {
      const firstImg = images[0];
      const newWidth = Math.round(newHeight * firstImg.aspectRatio);
      setOptions(prev => ({ ...prev, targetHeight: newHeight, targetWidth: newWidth }));
    } else {
      setOptions(prev => ({ ...prev, targetHeight: newHeight }));
    }
  };

  const handleStartProcessing = async () => {
    if (images.length === 0) return;
    setIsBatchProcessing(true);
    showToast('开始处理图片...', 'info');

    if (options.mode === 'mosaic') {
      try {
        const loadedImages = await loadAllImages(images.map(img => img.originalUrl));
        const stitchedCanvas = await stitchImages(loadedImages, options.targetWidth, options.exportFormat);
        
        const mosaicOptions = { ...options, targetHeight: stitchedCanvas.height };
        const results = await processImage(stitchedCanvas, mosaicOptions);

        const mosaicResult: ImageState = {
          id: 'mosaic-result-' + Date.now(),
          originalUrl: stitchedCanvas.toDataURL(`image/${options.exportFormat}`, 1.0),
          width: stitchedCanvas.width,
          height: stitchedCanvas.height,
          aspectRatio: stitchedCanvas.width / stitchedCanvas.height,
          fileName: 'stitched_mosaic',
          status: 'completed',
          slices: results
        };

        setImages([mosaicResult]);
        showToast('拼图拼接完成！', 'success');
      } catch (err) {
        console.error(err);
        showToast('处理失败，请重试', 'error');
      }
    } else {
      const processSingle = async (imgState: ImageState) => {
        setImages(prev => prev.map(img => img.id === imgState.id ? { ...img, status: 'processing' } : img));
        try {
          const imgElement = await loadImage(imgState.originalUrl);
          const currentOptions = { ...options };
          if (options.keepAspectRatio) {
            currentOptions.targetHeight = Math.round(options.targetWidth / imgState.aspectRatio);
          }

          const results = await processImage(imgElement, currentOptions);
          setImages(prev => prev.map(img => img.id === imgState.id ? { ...img, status: 'completed', slices: results } : img));
        } catch (err) {
          console.error(err);
          setImages(prev => prev.map(img => img.id === imgState.id ? { ...img, status: 'error' } : img));
        }
      };

      await Promise.all(images.map(img => processSingle(img)));
      showToast('批量处理完成！', 'success');
    }
    setIsBatchProcessing(false);
  };

  const handleAiAnalyze = async () => {
    if (images.length === 0) return;
    try {
      if ((window as any).aistudio && !(await (window as any).aistudio.hasSelectedApiKey())) {
        await (window as any).aistudio.openSelectKey();
      }
    } catch (e) {
      console.warn('AIStudio key selection check failed:', e);
    }

    setIsAnalyzing(true);
    try {
      const blobResponse = await fetch(images[0].originalUrl);
      const blob = await blobResponse.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      
      const result = await analyzeImageSlicing(base64);
      if (result && result.suggestedHeight) {
        setOptions(prev => ({ ...prev, sliceHeight: result.suggestedHeight }));
        showToast(`AI 建议：${result.suggestedHeight}px - ${result.reason}`, 'success');
      }
    } catch (err: any) {
      console.error('AI Analysis failed:', err);
      if (err?.message?.includes("Requested entity was not found")) {
        try {
          if ((window as any).aistudio) await (window as any).aistudio.openSelectKey();
        } catch (e) {
          console.error('Failed to open key selection dialog:', e);
        }
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const totalSlices = useMemo(() => {
    if (options.mode === 'mosaic') {
      if (images.length === 0) return 0;
      let combinedHeight = 0;
      images.forEach(img => {
        const scale = options.targetWidth / img.width;
        combinedHeight += img.height * scale;
      });
      return options.enableSlicing ? Math.ceil(combinedHeight / options.sliceHeight) : 1;
    }
    if (!options.enableSlicing) return images.length;
    return images.reduce((acc, img) => acc + Math.ceil((options.keepAspectRatio ? (options.targetWidth / img.aspectRatio) : options.targetHeight) / options.sliceHeight), 0);
  }, [images, options]);

  const combinedMetrics = useMemo(() => {
    if (images.length === 0) return { height: 0, slices: 0 };
    let totalHeight = 0;
    if (options.mode === 'mosaic') {
      images.forEach(img => {
        const scale = options.targetWidth / img.width;
        totalHeight += img.height * scale;
      });
    } else {
       const firstImg = images[0];
       totalHeight = options.keepAspectRatio ? (options.targetWidth / firstImg.aspectRatio) : options.targetHeight;
    }
    const slicesCount = options.enableSlicing ? Math.ceil(totalHeight / options.sliceHeight) : 1;
    return { height: Math.round(totalHeight), slices: options.mode === 'mosaic' ? slicesCount : totalSlices };
  }, [images, options, totalSlices]);

  const currentPreviewSlice = useMemo(() => {
    if (!previewData) return null;
    const img = images.find(i => i.id === previewData.imageId);
    if (!img) return null;
    return {
      slice: img.slices[previewData.sliceIndex],
      fileName: img.fileName,
      total: img.slices.length,
      index: previewData.sliceIndex,
      imageId: img.id
    };
  }, [previewData, images]);

  const navigatePreview = (direction: number) => {
    if (!previewData) return;
    const img = images.find(i => i.id === previewData.imageId);
    if (!img) return;
    const nextIndex = (previewData.sliceIndex + direction + img.slices.length) % img.slices.length;
    setPreviewData({ ...previewData, sliceIndex: nextIndex });
  };

  const downloadAll = () => {
    images.forEach(img => {
      img.slices.forEach((slice, idx) => {
        const link = document.createElement('a');
        link.href = slice.url;
        link.download = `${img.fileName}${options.enableSlicing ? `_slice_${idx + 1}` : ''}.${slice.format}`;
        link.click();
      });
    });
  };

  const handleDownloadZip = async () => {
    if (images.length === 0) return;
    setIsPackaging(true);
    const zip = new JSZip();

    try {
      for (const img of images) {
        const folder = images.length > 1 ? zip.folder(img.fileName) : zip;
        if (!folder) continue;

        for (const [idx, slice] of img.slices.entries()) {
          const response = await fetch(slice.url);
          const blob = await response.blob();
          const fileName = `${img.fileName}${options.enableSlicing ? `_slice_${idx + 1}` : ''}.${slice.format}`;
          folder.file(fileName, blob);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `JJBoo_PixelSlice_Export_${Date.now()}.zip`;
      link.click();
    } catch (error) {
      console.error('Packaging failed:', error);
      alert('打包失败，请尝试分别下载');
    } finally {
      setIsPackaging(false);
    }
  };

  const canReorder = options.mode === 'mosaic' && !isBatchProcessing && !images.some(img => img.status === 'completed');

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 selection:bg-brand-100 selection:text-brand-900" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-brand-600/20 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="bg-white p-12 rounded-[40px] shadow-2xl flex flex-col items-center gap-6 border-4 border-dashed border-brand-400">
              <div className="w-24 h-24 bg-brand-50 rounded-[32px] flex items-center justify-center text-brand-600">
                <Upload size={48} />
              </div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">松开以上传图片</h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-8 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 glass-panel border-white/40"
          >
            {toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}
            {toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}
            {toast.type === 'info' && <Loader2 size={18} className="text-brand-500 animate-spin" />}
            <span className="text-xs font-black uppercase tracking-widest text-slate-700">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="w-full max-w-7xl mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-4"
        >
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-200 rotate-3 hover:rotate-0 transition-transform duration-300">
            <span className="text-2xl font-black text-white italic">J</span>
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              JJBoo PixelSlice
              <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full uppercase tracking-widest">v2.0</span>
            </h1>
            <p className="text-slate-500 text-sm font-medium">智能切图与高清拼接实验室</p>
          </div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 w-full md:w-auto"
        >
          {images.length > 0 && (
            <button 
              onClick={clearAll} 
              className="px-4 py-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center gap-2"
            >
              <Trash2 size={14} />
              清空
            </button>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" multiple />
        </motion.div>
      </header>

      <main className="w-full max-w-7xl flex flex-col lg:flex-row gap-10 items-start">
        <motion.aside 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full lg:w-80 shrink-0 sticky top-4"
        >
          <div className="glass-panel p-6 rounded-[24px] space-y-6">
            <div className="flex items-center gap-2.5 text-brand-600">
              <Settings2 size={18} />
              <h2 className="text-sm font-black uppercase tracking-[0.15em]">处理配置</h2>
            </div>
            
            <div className="space-y-5">
              {/* Primary Action & Stats - Unified with light theme */}
              <div className="bg-white border border-slate-200 rounded-[24px] p-6 shadow-sm relative overflow-hidden group">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.05),transparent)] pointer-events-none" />
                
                <div className="relative z-10 space-y-5">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em]">待处理队列</span>
                      <div className="text-2xl font-black text-slate-900 tabular-nums">{images.length} <span className="text-xs text-slate-500 font-bold ml-1">张</span></div>
                    </div>
                    <div className="text-right space-y-1.5">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em]">预计输出</span>
                      <div className="text-lg font-black text-brand-600 tabular-nums">{combinedMetrics.slices} <span className="text-xs text-slate-500 font-bold ml-1">份</span></div>
                    </div>
                  </div>

                  <motion.button 
                    whileHover={{ scale: 1.01, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStartProcessing} 
                    disabled={images.length === 0 || isBatchProcessing} 
                    className="w-full relative group overflow-hidden rounded-2xl py-5 px-6 flex items-center justify-center gap-3 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:y-0 shadow-[0_20px_50px_rgba(0,51,102,0.3)] hover:shadow-[0_20px_50px_rgba(0,51,102,0.5)]"
                  >
                    {/* Background with deep blue solid color */}
                    <div className="absolute inset-0 bg-[#003366] group-hover:bg-[#004080] transition-colors duration-500" />
                    
                    {/* Inner highlight for depth */}
                    <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
                    
                    {/* Glow effect on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.15),transparent_70%)]" />

                    {/* Content */}
                    <div className="relative z-10 flex items-center gap-3 text-white">
                      {isBatchProcessing ? (
                        <Loader2 className="animate-spin" size={22} />
                      ) : (
                        <Zap size={22} className="fill-white/20 group-hover:fill-white/40 transition-colors" />
                      )}
                      <span className="text-[15px] font-black tracking-[0.1em] uppercase">
                        {options.mode === 'mosaic' ? '开始拼接导出' : '立即并行处理'}
                      </span>
                    </div>
                  </motion.button>
                </div>
              </div>

              <div className="bento-item p-5">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em]">处理模式</label>
                  <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl">
                    {(['individual', 'mosaic'] as ProcessingMode[]).map(m => (
                      <button 
                        key={m} 
                        onClick={() => setOptions(prev => ({ ...prev, mode: m }))} 
                        className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${options.mode === m ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {m === 'individual' ? '独立' : '拼接'}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200/50">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">导出格式</label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-200/50 p-1 rounded-xl">
                      {(['jpeg', 'png'] as ExportFormat[]).map((fmt) => (
                        <button 
                          key={fmt} 
                          onClick={() => setOptions(prev => ({ ...prev, exportFormat: fmt }))} 
                          className={`py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${options.exportFormat === fmt ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">质量</label>
                    <div className="grid grid-cols-3 gap-1 bg-slate-200/50 p-1 rounded-xl">
                      {(['high', 'medium', 'low'] as const).map((q) => (
                        <button 
                          key={q} 
                          onClick={() => setOptions(prev => ({ ...prev, quality: q }))} 
                          className={`py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${options.quality === q ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          {q === 'high' ? '高' : q === 'medium' ? '中' : '低'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bento-item p-5 space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em]">尺寸设定</label>
                    <button 
                      onClick={useMaxOriginalWidth} 
                      disabled={images.length === 0} 
                      className="text-[10px] text-brand-600 font-black hover:underline disabled:text-slate-300 uppercase tracking-tight"
                    >
                      匹配最大宽
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberInput label="W" value={options.targetWidth} onChange={updateWidth} disabled={images.length === 0} />
                    <div className={(options.keepAspectRatio || options.mode === 'mosaic') ? 'opacity-40 pointer-events-none' : ''}>
                      <NumberInput label="H" value={options.targetHeight} onChange={updateHeight} disabled={images.length === 0 || options.keepAspectRatio || options.mode === 'mosaic'} />
                    </div>
                  </div>
                </div>
                
                <label className="flex items-center gap-3 group cursor-pointer">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      checked={options.keepAspectRatio || options.mode === 'mosaic'} 
                      disabled={options.mode === 'mosaic'} 
                      onChange={(e) => setOptions(prev => ({ ...prev, keepAspectRatio: e.target.checked }))} 
                      className="peer sr-only" 
                    />
                    <div className="w-5 h-5 border-2 border-slate-200 rounded-lg peer-checked:bg-brand-600 peer-checked:border-brand-600 transition-all flex items-center justify-center">
                      <motion.div 
                        initial={false}
                        animate={{ scale: (options.keepAspectRatio || options.mode === 'mosaic') ? 1 : 0 }}
                        className="text-white"
                      >
                        <CheckCircle2 size={12} strokeWidth={4} />
                      </motion.div>
                    </div>
                  </div>
                  <span className="text-[11px] font-black text-slate-600 group-hover:text-slate-900 transition-colors uppercase tracking-wider">锁定宽高比</span>
                </label>
              </div>

              <div className="bento-item p-5 space-y-4">
                <div className="flex items-center justify-between gap-4 py-0.5">
                  <div className="flex items-center gap-2.5 text-slate-800 min-w-0">
                    <Layers size={16} className="text-brand-500 shrink-0" />
                    <span className="text-[11px] font-black uppercase tracking-widest truncate">智能切片</span>
                  </div>
                  <button 
                    onClick={() => setOptions(prev => ({ ...prev, enableSlicing: !prev.enableSlicing }))} 
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none px-1 ${options.enableSlicing ? 'bg-[#003366]' : 'bg-slate-200'}`}
                  >
                    <motion.span
                      layout
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className="inline-block h-5 w-5 rounded-full bg-white shadow-lg"
                      style={{ marginLeft: options.enableSlicing ? 'auto' : '0', marginRight: options.enableSlicing ? '0' : 'auto' }}
                    />
                  </button>
                </div>

                {options.enableSlicing && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4 pt-3 border-t border-slate-100"
                  >
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                         <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">单张高度</label>
                         <button 
                          onClick={handleAiAnalyze} 
                          disabled={isAnalyzing || images.length === 0} 
                          className="flex items-center gap-1.5 px-2 py-1 bg-brand-50 text-[10px] text-brand-600 font-black rounded-lg hover:bg-brand-100 disabled:bg-slate-50 disabled:text-slate-300 transition-colors uppercase tracking-wider border border-brand-100/50"
                        >
                          <Sparkles size={12} />
                          AI 建议
                        </button>
                      </div>
                      <NumberInput label="" value={options.sliceHeight} onChange={(val) => setOptions(prev => ({ ...prev, sliceHeight: val }))} disabled={images.length === 0} suffix="PX" />
                    </div>

                    <div className="space-y-2.5">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">单张最大尺寸</label>
                      <NumberInput label="" value={options.maxSliceSize} onChange={(val) => setOptions(prev => ({ ...prev, maxSliceSize: val }))} disabled={images.length === 0} suffix="KB" />
                    </div>
                  </motion.div>
                )}
              </div>

              <AnimatePresence>
                {images.some(img => img.status === 'completed') && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 pt-5 border-t border-slate-200"
                  >
                    <div className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em] mb-3">导出选项</div>
                    <button 
                      onClick={downloadAll} 
                      className="w-full bg-white border border-slate-200 hover:border-slate-300 text-slate-700 py-3 rounded-xl font-bold text-[11px] uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2.5 active:scale-[0.98]"
                    >
                      <Download size={16} />
                      分别下载
                    </button>
                    <motion.button 
                      whileHover={{ scale: 1.01, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleDownloadZip} 
                      disabled={isPackaging}
                      className="w-full relative group overflow-hidden bg-[#003366] hover:bg-[#004080] text-white py-4 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-[#003366] to-[#004080] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="relative z-10 flex items-center gap-2.5">
                        {isPackaging ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Archive size={16} />
                        )}
                        打包 ZIP 下载
                      </div>
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.aside>

        <div className="flex-1 min-w-0 w-full">
          <AnimatePresence mode="wait">
            {images.length === 0 ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => fileInputRef.current?.click()} 
                className="w-full min-h-[600px] border-2 border-dashed border-slate-300 bg-slate-50/50 rounded-[40px] flex flex-col items-center justify-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/50 transition-all group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(14,165,233,0.08),transparent)] pointer-events-none" />
                <div className="w-28 h-28 bg-white rounded-[36px] shadow-2xl shadow-slate-300/50 flex items-center justify-center mb-10 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 border-2 border-slate-100">
                  <ImageIcon size={48} className="text-brand-600" />
                </div>
                <h3 className="text-3xl font-black text-slate-800 tracking-tight">拖入图片或点击上传</h3>
                <p className="text-slate-600 mt-4 font-medium text-center max-w-sm text-lg">
                  支持多图并行处理，AI 智能切片建议，<br/>无损拼接长图
                </p>
                <div className="mt-12 flex gap-6">
                  <div className="flex items-center gap-2.5 px-6 py-3 bg-white shadow-sm border border-slate-200 rounded-full text-xs font-bold text-slate-700 uppercase tracking-widest">
                    <CheckCircle2 size={14} className="text-green-500" />
                    高清无损
                  </div>
                  <div className="flex items-center gap-2.5 px-6 py-3 bg-white shadow-sm border border-slate-200 rounded-full text-xs font-bold text-slate-700 uppercase tracking-widest">
                    <CheckCircle2 size={14} className="text-green-500" />
                    批量并行
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                <div className={`grid gap-6 ${options.mode === 'mosaic' && !images.some(i => i.status === 'completed') ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
                  {images.map((img, idx) => (
                    <motion.div 
                      layout
                      key={img.id} 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      draggable={canReorder} 
                      onDragStart={() => setDraggedIndex(idx)} 
                      onDragOver={(e) => { 
                        e.preventDefault(); 
                        if (draggedIndex !== null && draggedIndex !== idx) { 
                          const next = [...images]; 
                          const item = next.splice(draggedIndex, 1)[0]; 
                          next.splice(idx, 0, item); 
                          setImages(next); 
                          setDraggedIndex(idx); 
                        } 
                      }} 
                      onDragEnd={() => setDraggedIndex(null)} 
                      className={`bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm flex flex-col group relative transition-all duration-300 hover:shadow-xl hover:shadow-slate-200/50 ${canReorder ? 'cursor-grab active:cursor-grabbing hover:border-brand-300' : ''}`}
                    >
                      <div className="relative aspect-[16/10] bg-slate-50 flex items-center justify-center overflow-hidden">
                        <img src={img.originalUrl} alt={img.fileName} className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" />
                        
                        {/* Status Overlay */}
                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                        
                        <div className="absolute top-4 right-4 flex gap-2">
                          <button 
                            onClick={() => removeImage(img.id)} 
                            className="w-12 h-12 bg-white/95 backdrop-blur-md hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-2xl shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-90"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>

                        {canReorder && (
                          <div className="absolute top-4 left-4 w-12 h-12 bg-white/95 backdrop-blur-md text-slate-500 rounded-2xl shadow-lg flex items-center justify-center">
                            <GripVertical size={18} />
                          </div>
                        )}

                        {img.status === 'processing' && (
                          <div className="absolute inset-0 bg-white/70 backdrop-blur-[4px] flex flex-col items-center justify-center gap-4">
                            <Loader2 className="animate-spin text-brand-600" size={40} />
                            <span className="text-xs font-black uppercase tracking-widest text-slate-700">处理中...</span>
                          </div>
                        )}
                        
                        {img.status === 'error' && (
                          <div className="absolute inset-0 bg-red-50/90 backdrop-blur-[4px] flex flex-col items-center justify-center gap-4">
                            <AlertCircle className="text-red-500" size={40} />
                            <span className="text-xs font-black uppercase tracking-widest text-red-600">处理失败</span>
                          </div>
                        )}
                      </div>

                      <div className="p-8">
                        <div className="flex justify-between items-start mb-5">
                          <div className="flex flex-col gap-1.5">
                            <h4 className="font-black text-slate-900 truncate text-base tracking-tight max-w-[200px]">{img.fileName}</h4>
                            <div className="flex items-center gap-2.5">
                              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded-lg">
                                {img.width} × {img.height}
                              </span>
                              {img.slices.length > 0 && (
                                <span className="text-[11px] font-black text-brand-600 uppercase tracking-widest bg-brand-50 px-2 py-1 rounded-lg flex items-center gap-1.5">
                                  <Layers size={12} />
                                  {img.slices.length} 份
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            {img.status === 'completed' && (
                              <div className="flex items-center gap-1.5 text-green-600">
                                <CheckCircle2 size={14} />
                                <span className="text-[11px] font-black uppercase tracking-widest">已完成</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex gap-4 overflow-x-auto pb-5 custom-scrollbar">
                          {img.slices.length > 0 ? (
                            img.slices.map((slice, i) => (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                key={slice.id} 
                                className="w-24 h-24 shrink-0 rounded-2xl border border-slate-100 overflow-hidden relative cursor-pointer group/slice hover:border-brand-400 transition-all shadow-sm" 
                                onClick={() => setPreviewData({ imageId: img.id, sliceIndex: i })}
                              >
                                <img src={slice.url} className="w-full h-full object-cover transition-transform group-hover/slice:scale-110" />
                                <div className="absolute inset-0 bg-brand-600/20 opacity-0 group-hover/slice:opacity-100 transition-opacity flex items-center justify-center">
                                  <Maximize2 size={18} className="text-white drop-shadow-md" />
                                </div>
                              </motion.div>
                            ))
                          ) : (
                            <div className="w-full h-24 border-2 border-dashed border-slate-100 rounded-2xl flex items-center justify-center">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">等待处理</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {currentPreviewSlice && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-4 md:p-10" 
            onClick={() => setPreviewData(null)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-6xl bg-white rounded-[40px] overflow-hidden shadow-2xl flex flex-col lg:flex-row h-full lg:h-[80vh]" 
              onClick={e => e.stopPropagation()}
            >
              <div className="flex-1 bg-slate-50 relative overflow-hidden flex items-center justify-center p-6 md:p-12">
                <motion.img 
                  key={currentPreviewSlice.slice.url}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  src={currentPreviewSlice.slice.url} 
                  alt="Preview" 
                  className="max-w-full max-h-full object-contain shadow-2xl rounded-2xl" 
                />
                
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-6 pointer-events-none">
                  <button 
                    onClick={() => navigatePreview(-1)} 
                    className="w-14 h-14 rounded-2xl bg-white/90 backdrop-blur-md hover:bg-white shadow-xl flex items-center justify-center pointer-events-auto transition-all hover:scale-110 active:scale-95 disabled:opacity-20" 
                    disabled={currentPreviewSlice.total <= 1}
                  >
                    <ChevronLeft size={24} className="text-slate-800" />
                  </button>
                  <button 
                    onClick={() => navigatePreview(1)} 
                    className="w-14 h-14 rounded-2xl bg-white/90 backdrop-blur-md hover:bg-white shadow-xl flex items-center justify-center pointer-events-auto transition-all hover:scale-110 active:scale-95 disabled:opacity-20" 
                    disabled={currentPreviewSlice.total <= 1}
                  >
                    <ChevronRight size={24} className="text-slate-800" />
                  </button>
                </div>

                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
                  {Array.from({ length: currentPreviewSlice.total }).map((_, i) => (
                    <div 
                      key={i} 
                      className={`h-1.5 rounded-full transition-all duration-300 ${i === currentPreviewSlice.index ? 'w-8 bg-brand-500' : 'w-1.5 bg-slate-300'}`} 
                    />
                  ))}
                </div>
              </div>

              <div className="w-full lg:w-96 p-12 flex flex-col bg-white border-l border-slate-100">
                <div className="flex justify-between items-start mb-12">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight truncate max-w-[200px]">{currentPreviewSlice.fileName}</h3>
                    <p className="text-xs font-black text-brand-600 uppercase tracking-[0.2em] mt-3">
                      {options.enableSlicing ? `切片 ${currentPreviewSlice.index + 1} / ${currentPreviewSlice.total}` : '高清预览'}
                    </p>
                  </div>
                  <button 
                    onClick={() => setPreviewData(null)} 
                    className="w-12 h-12 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-2xl transition-all flex items-center justify-center"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-10 flex-1">
                  <div className="grid grid-cols-2 gap-5">
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                      <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">体积</span>
                      <span className="text-xl font-black text-slate-800">{currentPreviewSlice.slice.sizeLabel}</span>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                      <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">格式</span>
                      <span className="text-xl font-black text-slate-800 uppercase">{currentPreviewSlice.slice.format}</span>
                    </div>
                  </div>

                  <div className="p-8 bg-brand-50/50 rounded-[32px] border border-brand-100 space-y-5">
                    <div className="flex items-center gap-2.5 text-brand-600">
                      <Maximize2 size={18} />
                      <span className="text-xs font-black uppercase tracking-widest">切片信息</span>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                      <div>
                        <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">当前索引</span>
                        <span className="text-base font-black text-slate-800"># {currentPreviewSlice.index + 1}</span>
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">总计切片</span>
                        <span className="text-base font-black text-slate-800">{currentPreviewSlice.total} 份</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <a 
                      href={currentPreviewSlice.slice.url} 
                      download={`${currentPreviewSlice.fileName}${options.enableSlicing ? `_slice_${currentPreviewSlice.index + 1}` : ''}.${currentPreviewSlice.slice.format}`} 
                      className="w-full bg-[#003366] hover:bg-[#004080] text-white py-6 rounded-[28px] font-black uppercase tracking-[0.2em] text-sm transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-[0.98]"
                    >
                      <Download size={20} />
                      下载当前切片
                    </a>
                    
                    <button 
                      onClick={() => {
                        const img = images.find(i => i.id === currentPreviewSlice.imageId);
                        if (!img) return;
                        img.slices.forEach((slice, idx) => {
                          const link = document.createElement('a');
                          link.href = slice.url;
                          link.download = `${img.fileName}_slice_${idx + 1}.${slice.format}`;
                          link.click();
                        });
                      }}
                      className="w-full bg-[#003366] hover:bg-[#004080] text-white py-5 rounded-[28px] font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-[0.98]"
                    >
                      <Archive size={18} />
                      下载该图所有切片
                    </button>
                  </div>
                </div>

                <div className="mt-16 pt-10 border-t border-slate-50 text-center">
                  <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em]">
                    JJBoo PixelSlice Professional
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <footer className="w-full max-w-7xl mt-20 pt-10 border-t border-slate-200 text-center pb-16">
        <p className="text-slate-500 text-sm font-medium">
          &copy; 2024 JJBoo PixelSlice. Design by JJBoo
        </p>
      </footer>
    </div>
  );
};

export default App;
