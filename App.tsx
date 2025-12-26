
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { ImageState, SliceResult, ProcessingOptions, ExportFormat } from './types';
import { processImage, loadImage } from './services/imageService';
import { analyzeImageSlicing } from './services/aiService';
import NumberInput from './components/NumberInput';

const App: React.FC = () => {
  const [images, setImages] = useState<ImageState[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [previewData, setPreviewData] = useState<{ imageId: string; sliceIndex: number } | null>(null);
  
  const [options, setOptions] = useState<ProcessingOptions>({
    targetWidth: 0,
    targetHeight: 0,
    sliceHeight: 1200,
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
        
        if (images.length === 0) {
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

  const processBatch = async () => {
    if (images.length === 0) return;
    setIsBatchProcessing(true);

    const processSingle = async (imgState: ImageState) => {
      setImages(prev => prev.map(img => img.id === imgState.id ? { ...img, status: 'processing' } : img));
      try {
        const imgElement = await loadImage(imgState.originalUrl);
        const currentOptions = { ...options };
        if (options.keepAspectRatio) {
          currentOptions.targetHeight = Math.round(options.targetWidth / imgState.aspectRatio);
        }

        const results = await processImage(imgElement, currentOptions);
        setImages(prev => prev.map(img => img.id === imgState.id ? { 
          ...img, 
          status: 'completed', 
          slices: results 
        } : img));
      } catch (err) {
        console.error(err);
        setImages(prev => prev.map(img => img.id === imgState.id ? { ...img, status: 'error' } : img));
      }
    };

    await Promise.all(images.map(img => processSingle(img)));
    setIsBatchProcessing(false);
  };

  const handleAiAnalyze = async () => {
    if (images.length === 0) return;
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
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadAll = () => {
    images.forEach(img => {
      img.slices.forEach((slice, idx) => {
        const link = document.createElement('a');
        link.href = slice.url;
        link.download = `${img.fileName}_slice_${idx + 1}.${slice.format}`;
        link.click();
      });
    });
  };

  const totalSlices = useMemo(() => {
    return images.reduce((acc, img) => acc + Math.ceil((options.keepAspectRatio ? (options.targetWidth / img.aspectRatio) : options.targetHeight) / options.sliceHeight), 0);
  }, [images, options]);

  // Preview Navigation Logic
  const currentPreviewSlice = useMemo(() => {
    if (!previewData) return null;
    const img = images.find(i => i.id === previewData.imageId);
    if (!img) return null;
    return {
      slice: img.slices[previewData.sliceIndex],
      fileName: img.fileName,
      total: img.slices.length,
      index: previewData.sliceIndex
    };
  }, [previewData, images]);

  const navigatePreview = (direction: number) => {
    if (!previewData) return;
    const img = images.find(i => i.id === previewData.imageId);
    if (!img) return;
    const nextIndex = (previewData.sliceIndex + direction + img.slices.length) % img.slices.length;
    setPreviewData({ ...previewData, sliceIndex: nextIndex });
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-7xl mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <span className="bg-blue-600 text-white p-2 rounded-lg leading-none">J</span>
            JJBoo PixelSlice
          </h1>
          <p className="text-slate-500 mt-1">批量、并行、智能图像切片工具</p>
        </div>
        <div className="flex gap-3">
          {images.length > 0 && (
            <button 
              onClick={clearAll}
              className="text-slate-500 hover:text-red-500 font-medium px-4 transition-colors"
            >
              清空全部
            </button>
          )}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            上传多图
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" multiple />
        </div>
      </header>

      <main className="w-full max-w-7xl flex flex-col lg:flex-row gap-8">
        {/* Sidebar Controls */}
        <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 sticky top-8">
            <h2 className="text-lg font-bold text-slate-800 mb-4">全局批处理参数</h2>
            
            <div className="space-y-6">
              <div className="space-y-4">
                <NumberInput label="目标宽度" value={options.targetWidth} onChange={updateWidth} disabled={images.length === 0} />
                <div className={options.keepAspectRatio ? 'opacity-50 pointer-events-none' : ''}>
                  <NumberInput label="目标高度" value={options.targetHeight} onChange={updateHeight} disabled={images.length === 0 || options.keepAspectRatio} />
                </div>
                
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="ratio" 
                    checked={options.keepAspectRatio}
                    onChange={(e) => setOptions(prev => ({ ...prev, keepAspectRatio: e.target.checked }))}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <label htmlFor="ratio" className="text-sm text-slate-600 select-none cursor-pointer">锁定各自比例</label>
                </div>
              </div>

              <div className="border-t border-slate-50 pt-4 space-y-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">批量格式</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['jpeg', 'png'] as ExportFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setOptions(prev => ({ ...prev, exportFormat: fmt }))}
                        className={`py-2 px-1 rounded-lg text-xs font-bold border transition-all ${options.exportFormat === fmt ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-slate-200 text-slate-600'}`}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center mb-1">
                     <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">单张切片高度</label>
                     <button onClick={handleAiAnalyze} disabled={isAnalyzing || images.length === 0} className="text-[10px] text-blue-600 font-bold hover:underline disabled:text-slate-300">
                        {isAnalyzing ? '分析中...' : 'AI 建议'}
                     </button>
                  </div>
                  <NumberInput label="" value={options.sliceHeight} onChange={(val) => setOptions(prev => ({ ...prev, sliceHeight: val }))} disabled={images.length === 0} />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-50">
                <div className="flex justify-between text-xs text-slate-500 mb-4">
                  <span>待处理: {images.length} 张图片</span>
                  <span>预计总切片: {totalSlices}</span>
                </div>
                <button 
                  onClick={processBatch}
                  disabled={images.length === 0 || isBatchProcessing}
                  className="w-full bg-slate-900 hover:bg-black text-white py-3.5 rounded-xl font-bold transition-all disabled:bg-slate-200 shadow-xl flex items-center justify-center gap-2"
                >
                  {isBatchProcessing ? (
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : '开始并行处理'}
                </button>
                {images.some(img => img.status === 'completed') && (
                   <button 
                    onClick={downloadAll}
                    className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                   >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    一键下载全部
                   </button>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {images.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[500px] border-4 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
            >
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-10 h-10 text-slate-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-700">开始上传您的图片</h3>
              <p className="text-slate-400 mt-2">支持多选，并行处理每一张图片</p>
            </div>
          ) : (
            <div className="space-y-8 animate-fade-in">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {images.map((img) => (
                  <div key={img.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm flex flex-col group">
                    <div className="relative aspect-video bg-slate-50 flex items-center justify-center overflow-hidden">
                      <img src={img.originalUrl} alt={img.fileName} className="w-full h-full object-contain" />
                      <div className="absolute top-2 right-2 flex gap-2">
                        {img.status === 'completed' && (
                          <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-sm">完成</span>
                        )}
                        {img.status === 'processing' && (
                          <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-sm animate-pulse">处理中</span>
                        )}
                        <button 
                          onClick={() => removeImage(img.id)}
                          className="bg-white/90 hover:bg-white text-slate-400 hover:text-red-500 p-1.5 rounded-lg shadow-sm transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-800 truncate text-sm" title={img.fileName}>{img.fileName}</h4>
                          <p className="text-[10px] text-slate-400">{img.width}x{img.height} • {(img.width/img.height).toFixed(2)} ratio</p>
                        </div>
                        {img.slices.length > 0 && (
                          <div className="text-right">
                             <p className="text-[10px] font-bold text-blue-600">{img.slices.length} 切片</p>
                          </div>
                        )}
                      </div>

                      {img.slices.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
                          {img.slices.map((slice, i) => (
                            <div 
                              key={slice.id} 
                              className="w-16 h-16 shrink-0 rounded-lg border border-slate-100 overflow-hidden relative group/slice cursor-pointer"
                              onClick={() => setPreviewData({ imageId: img.id, sliceIndex: i })}
                            >
                              <img src={slice.url} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/slice:opacity-100 flex items-center justify-center transition-opacity gap-1">
                                <button className="text-white p-1 hover:scale-110 transition-transform">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Preview Modal */}
      {currentPreviewSlice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setPreviewData(null)}>
          <div className="relative w-full max-w-5xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-[85vh]" onClick={e => e.stopPropagation()}>
            {/* Image View */}
            <div className="flex-1 bg-slate-100 relative overflow-hidden flex items-center justify-center p-4">
              <img src={currentPreviewSlice.slice.url} alt="Preview" className="max-w-full max-h-full object-contain shadow-lg rounded-lg" />
              
              {/* Nav Overlay */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 pointer-events-none">
                <button 
                  onClick={() => navigatePreview(-1)} 
                  className="w-12 h-12 rounded-full bg-white/80 hover:bg-white shadow-lg flex items-center justify-center pointer-events-auto transition-transform hover:scale-110 active:scale-95"
                >
                  <svg className="w-6 h-6 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button 
                  onClick={() => navigatePreview(1)} 
                  className="w-12 h-12 rounded-full bg-white/80 hover:bg-white shadow-lg flex items-center justify-center pointer-events-auto transition-transform hover:scale-110 active:scale-95"
                >
                  <svg className="w-6 h-6 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>

            {/* Info Sidebar */}
            <div className="w-full md:w-80 p-8 flex flex-col bg-white border-l border-slate-100">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 truncate" title={currentPreviewSlice.fileName}>{currentPreviewSlice.fileName}</h3>
                  <p className="text-sm text-slate-400 mt-1">切片 {currentPreviewSlice.index + 1} / {currentPreviewSlice.total}</p>
                </div>
                <button onClick={() => setPreviewData(null)} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="space-y-6 flex-1">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">详情</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">文件大小</span>
                      <span className="text-sm font-bold text-blue-600">{currentPreviewSlice.slice.sizeLabel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-500">导出格式</span>
                      <span className="text-sm font-bold text-slate-700 uppercase">{currentPreviewSlice.slice.format}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <a 
                    href={currentPreviewSlice.slice.url} 
                    download={`${currentPreviewSlice.fileName}_slice_${currentPreviewSlice.index + 1}.${currentPreviewSlice.slice.format}`}
                    className="w-full bg-slate-900 hover:bg-black text-white py-3.5 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    下载此切片
                  </a>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-50">
                <p className="text-[10px] text-center text-slate-300 font-bold uppercase tracking-widest">Design by JJBoo</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full max-w-7xl mt-12 py-8 border-t border-slate-100 text-center text-slate-400 text-sm">
        <p>&copy; 2024 JJBoo PixelSlice. Design by JJBoo</p>
      </footer>
    </div>
  );
};

export default App;
