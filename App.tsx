import React, { useState, useCallback, useRef, useMemo } from 'react';
import { ImageState, SliceResult, ProcessingOptions, ExportFormat, ProcessingMode } from './types';
import { processImage, loadImage, loadAllImages, stitchImages } from './services/imageService';
import { analyzeImageSlicing } from './services/aiService';
import NumberInput from './components/NumberInput';

// Removed redundant AIStudio interface and window declaration as they are already provided by the environment,
// which was causing "All declarations of 'aistudio' must have identical modifiers" errors.

const App: React.FC = () => {
  const [images, setImages] = useState<ImageState[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [previewData, setPreviewData] = useState<{ imageId: string; sliceIndex: number } | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const [options, setOptions] = useState<ProcessingOptions>({
    mode: 'individual',
    targetWidth: 0,
    targetHeight: 0,
    sliceHeight: 1200,
    enableSlicing: true,
    keepAspectRatio: true,
    exportFormat: 'jpeg',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    if (files.length === 0) return;

    files.forEach(file => {
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
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      } catch (err) {
        console.error(err);
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
    }
    setIsBatchProcessing(false);
  };

  // Implement API key selection logic and error handling for Pro models
  const handleAiAnalyze = async () => {
    if (images.length === 0) return;

    // MANDATORY: Check for API key selection before using Pro models
    try {
      if ((window as any).aistudio && !(await (window as any).aistudio.hasSelectedApiKey())) {
        await (window as any).aistudio.openSelectKey();
        // Assuming success as per guidelines race condition note
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
      }
    } catch (err: any) {
      console.error('AI Analysis failed:', err);
      // Reset key selection state and prompt user again if entity not found (usually billing/key issue)
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

  const canReorder = options.mode === 'mosaic' && !isBatchProcessing && !images.some(img => img.status === 'completed');

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-7xl mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <span className="bg-blue-600 text-white p-2 rounded-lg leading-none">J</span>
            JJBoo PixelSlice
          </h1>
          <p className="text-slate-500 mt-1">高质量、高清晰度并行处理工具</p>
        </div>
        <div className="flex gap-3">
          {images.length > 0 && (
            <button onClick={clearAll} className="text-slate-500 hover:text-red-500 font-medium px-4 transition-colors">清空全部</button>
          )}
          <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-200 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            上传图片
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" multiple />
        </div>
      </header>

      <main className="w-full max-w-7xl flex flex-col lg:flex-row gap-8">
        <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 sticky top-8">
            <h2 className="text-lg font-bold text-slate-800 mb-4">全局任务设置</h2>
            
            <div className="space-y-6">
              <div className="bg-slate-50 p-1 rounded-xl flex">
                {(['individual', 'mosaic'] as ProcessingMode[]).map(m => (
                  <button key={m} onClick={() => setOptions(prev => ({ ...prev, mode: m }))} className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${options.mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {m === 'individual' ? '独立处理' : '一键拼长图'}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">目标宽度</label>
                    <button onClick={useMaxOriginalWidth} disabled={images.length === 0} className="text-[10px] text-blue-600 font-bold hover:underline disabled:text-slate-300">匹配原图最大宽</button>
                  </div>
                  <NumberInput label="" value={options.targetWidth} onChange={updateWidth} disabled={images.length === 0} />
                </div>
                
                <div className={(options.keepAspectRatio || options.mode === 'mosaic') ? 'opacity-50 pointer-events-none' : ''}>
                  <NumberInput label="目标高度" value={options.targetHeight} onChange={updateHeight} disabled={images.length === 0 || options.keepAspectRatio || options.mode === 'mosaic'} />
                </div>
                
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="ratio" checked={options.keepAspectRatio || options.mode === 'mosaic'} disabled={options.mode === 'mosaic'} onChange={(e) => setOptions(prev => ({ ...prev, keepAspectRatio: e.target.checked }))} className="w-4 h-4 rounded text-blue-600" />
                  <label htmlFor="ratio" className="text-sm text-slate-600 select-none cursor-pointer">锁定比例</label>
                </div>
              </div>

              <div className="border-t border-slate-50 pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">切片功能</label>
                  <button onClick={() => setOptions(prev => ({ ...prev, enableSlicing: !prev.enableSlicing }))} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${options.enableSlicing ? 'bg-blue-600' : 'bg-slate-200'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${options.enableSlicing ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(['jpeg', 'png'] as ExportFormat[]).map((fmt) => (
                    <button key={fmt} onClick={() => setOptions(prev => ({ ...prev, exportFormat: fmt }))} className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all ${options.exportFormat === fmt ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-slate-200 text-slate-600'}`}>{fmt.toUpperCase()}</button>
                  ))}
                </div>

                {options.enableSlicing && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center mb-1">
                       <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">单张切片高度</label>
                       <button onClick={handleAiAnalyze} disabled={isAnalyzing || images.length === 0} className="text-[10px] text-blue-600 font-bold hover:underline disabled:text-slate-300">{isAnalyzing ? '分析中...' : 'AI 建议'}</button>
                    </div>
                    <NumberInput label="" value={options.sliceHeight} onChange={(val) => setOptions(prev => ({ ...prev, sliceHeight: val }))} disabled={images.length === 0} />
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-50">
                <div className="space-y-2 text-xs text-slate-500 mb-4">
                  <div className="flex justify-between">
                    <span>待处理: {images.length} 张</span>
                    <span>预计输出: {combinedMetrics.slices} 份</span>
                  </div>
                  {options.mode === 'mosaic' && (
                    <div className="flex justify-between text-blue-600 font-medium">
                      <span>拼图总高: {combinedMetrics.height} px</span>
                    </div>
                  )}
                </div>
                <button onClick={handleStartProcessing} disabled={images.length === 0 || isBatchProcessing} className="w-full bg-slate-900 hover:bg-black text-white py-3.5 rounded-xl font-bold transition-all disabled:bg-slate-200 shadow-xl flex items-center justify-center gap-2">
                  {isBatchProcessing ? <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> : options.mode === 'mosaic' ? '高清拼图导出' : '高清并行处理'}
                </button>
                {images.some(img => img.status === 'completed') && (
                   <button onClick={downloadAll} className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2">
                    下载结果
                   </button>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="flex-1 min-w-0">
          {images.length === 0 ? (
            <div onClick={() => fileInputRef.current?.click()} className="w-full min-h-[500px] border-4 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-10 h-10 text-slate-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-700">高清图像实验室</h3>
              <p className="text-slate-400 mt-2">支持无损拼接与精密切片，简单高效</p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className={`grid gap-6 ${options.mode === 'mosaic' && !images.some(i => i.status === 'completed') ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
                {images.map((img, idx) => (
                  <div key={img.id} draggable={canReorder} onDragStart={() => setDraggedIndex(idx)} onDragOver={(e) => { e.preventDefault(); if (draggedIndex !== null && draggedIndex !== idx) { const next = [...images]; const item = next.splice(draggedIndex, 1)[0]; next.splice(idx, 0, item); setImages(next); setDraggedIndex(idx); } }} onDragEnd={() => setDraggedIndex(null)} className={`bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm flex flex-col group relative transition-all duration-200 ${canReorder ? 'cursor-grab active:cursor-grabbing hover:border-blue-300' : ''}`}>
                    <div className="relative aspect-video bg-slate-50 flex items-center justify-center overflow-hidden">
                      <img src={img.originalUrl} alt={img.fileName} className="w-full h-full object-contain" />
                      <div className="absolute top-2 right-2 flex gap-2">
                        <button onClick={() => removeImage(img.id)} className="bg-white/90 hover:bg-white text-slate-400 hover:text-red-500 p-1.5 rounded-lg shadow-sm">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      <h4 className="font-bold text-slate-800 truncate text-sm mb-1">{img.fileName}</h4>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {img.slices.map((slice, i) => (
                          <div key={slice.id} className="w-16 h-16 shrink-0 rounded-lg border border-slate-100 overflow-hidden relative cursor-pointer" onClick={() => setPreviewData({ imageId: img.id, sliceIndex: i })}>
                            <img src={slice.url} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {currentPreviewSlice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4" onClick={() => setPreviewData(null)}>
          <div className="relative w-full max-w-5xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex-1 bg-slate-100 relative overflow-hidden flex items-center justify-center p-4">
              <img src={currentPreviewSlice.slice.url} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg rounded-lg" />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 pointer-events-none">
                <button onClick={() => navigatePreview(-1)} className="w-12 h-12 rounded-full bg-white/80 hover:bg-white shadow-lg flex items-center justify-center pointer-events-auto transition-transform hover:scale-110 active:scale-95 disabled:opacity-30" disabled={currentPreviewSlice.total <= 1}><svg className="w-6 h-6 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg></button>
                <button onClick={() => navigatePreview(1)} className="w-12 h-12 rounded-full bg-white/80 hover:bg-white shadow-lg flex items-center justify-center pointer-events-auto transition-transform hover:scale-110 active:scale-95 disabled:opacity-30" disabled={currentPreviewSlice.total <= 1}><svg className="w-6 h-6 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
              </div>
            </div>
            <div className="w-full md:w-80 p-8 flex flex-col bg-white border-l border-slate-100">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 truncate">{currentPreviewSlice.fileName}</h3>
                  <p className="text-sm text-slate-400 mt-1">{options.enableSlicing ? `切片 ${currentPreviewSlice.index + 1} / ${currentPreviewSlice.total}` : '高清预览'}</p>
                </div>
                <button onClick={() => setPreviewData(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="space-y-6 flex-1">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex justify-between items-center text-sm"><span className="text-slate-500">体积</span><span className="font-bold text-blue-600">{currentPreviewSlice.slice.sizeLabel}</span></div>
                  <div className="flex justify-between items-center text-sm"><span className="text-slate-500">格式</span><span className="font-bold text-slate-700 uppercase">{currentPreviewSlice.slice.format}</span></div>
                </div>
                <div className="flex flex-col gap-3">
                  <a href={currentPreviewSlice.slice.url} download={`${currentPreviewSlice.fileName}${options.enableSlicing ? `_slice_${currentPreviewSlice.index + 1}` : ''}.${currentPreviewSlice.slice.format}`} className="w-full bg-slate-900 hover:bg-black text-white py-3.5 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2">下载原图</a>
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-slate-50 text-center"><p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Powered by JJBoo PixelSlice • Design by JJBoo</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;