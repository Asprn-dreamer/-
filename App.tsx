
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ImageState, SliceResult, ProcessingOptions, ExportFormat } from './types';
import { processImage, loadImage } from './services/imageService';
import { analyzeImageSlicing } from './services/aiService';
import NumberInput from './components/NumberInput';

const App: React.FC = () => {
  const [image, setImage] = useState<ImageState | null>(null);
  const [slices, setSlices] = useState<SliceResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ suggestedHeight: number; reason: string } | null>(null);
  
  const [options, setOptions] = useState<ProcessingOptions>({
    targetWidth: 0,
    targetHeight: 0,
    sliceHeight: 1200,
    keepAspectRatio: true,
    exportFormat: 'jpeg',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        setImage({
          originalUrl: url,
          width: img.width,
          height: img.height,
          aspectRatio: img.width / img.height,
          fileName: file.name.split('.').slice(0, -1).join('.')
        });
        setOptions(prev => ({
          ...prev,
          targetWidth: img.width,
          targetHeight: img.height
        }));
        setSlices([]);
        setAiSuggestion(null);
      };
      img.src = url;
    }
  };

  const updateWidth = (newWidth: number) => {
    if (options.keepAspectRatio && image) {
      const newHeight = Math.round(newWidth / image.aspectRatio);
      setOptions(prev => ({ ...prev, targetWidth: newWidth, targetHeight: newHeight }));
    } else {
      setOptions(prev => ({ ...prev, targetWidth: newWidth }));
    }
  };

  const updateHeight = (newHeight: number) => {
    if (options.keepAspectRatio && image) {
      const newWidth = Math.round(newHeight * image.aspectRatio);
      setOptions(prev => ({ ...prev, targetHeight: newHeight, targetWidth: newWidth }));
    } else {
      setOptions(prev => ({ ...prev, targetHeight: newHeight }));
    }
  };

  const handleSlice = async () => {
    if (!image) return;
    setIsProcessing(true);
    try {
      const imgElement = await loadImage(image.originalUrl);
      const results = await processImage(imgElement, options);
      setSlices(results);
    } catch (err) {
      console.error(err);
      alert('处理图片失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAiAnalyze = async () => {
    if (!image) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeImageSlicing(image.originalUrl);
      if (result) {
        setAiSuggestion(result);
        setOptions(prev => ({ ...prev, sliceHeight: result.suggestedHeight }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadAll = () => {
    slices.forEach((slice, idx) => {
      const link = document.createElement('a');
      link.href = slice.url;
      link.download = `slice_${idx + 1}_${image?.fileName || 'image'}.${slice.format}`;
      link.click();
    });
  };

  // Heuristic estimation of file size based on dimensions and format
  const estimatedSliceSize = useMemo(() => {
    if (!image || options.targetWidth <= 0 || options.sliceHeight <= 0) return null;
    
    const pixels = options.targetWidth * Math.min(options.sliceHeight, options.targetHeight);
    let bytesPerPixel = 0.15; // Default for JPEG 90%
    
    if (options.exportFormat === 'png') bytesPerPixel = 0.45; // PNG is usually larger (lossless)
    if (options.exportFormat === 'gif') bytesPerPixel = 0.25; // GIF limited palette
    
    const estimatedBytes = pixels * bytesPerPixel;
    
    if (estimatedBytes < 1024 * 1024) {
      return `${(estimatedBytes / 1024).toFixed(1)} KB`;
    }
    return `${(estimatedBytes / (1024 * 1024)).toFixed(2)} MB`;
  }, [options.targetWidth, options.sliceHeight, options.targetHeight, options.exportFormat, image]);

  const isSizeHigh = useMemo(() => {
    if (!estimatedSliceSize) return false;
    const num = parseFloat(estimatedSliceSize);
    const unit = estimatedSliceSize.split(' ')[1];
    if (unit === 'MB' && num > 2) return true; // Mark as high if over 2MB
    return false;
  }, [estimatedSliceSize]);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-6xl mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <span className="bg-blue-600 text-white p-2 rounded-lg leading-none">J</span>
            JJBoo PixelSlice
          </h1>
          <p className="text-slate-500 mt-1">智能图像尺寸调整与切片工具</p>
        </div>
        {!image && (
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-200"
          >
            开始上传
          </button>
        )}
      </header>

      <main className="w-full max-w-6xl flex flex-col lg:flex-row gap-8">
        {/* Sidebar Controls */}
        <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 mb-4">基本参数</h2>
            <div className="space-y-4">
              <NumberInput 
                label="宽度" 
                value={options.targetWidth} 
                onChange={updateWidth} 
                disabled={!image}
              />
              <NumberInput 
                label="高度" 
                value={options.targetHeight} 
                onChange={updateHeight} 
                disabled={!image}
              />
              
              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  id="ratio" 
                  checked={options.keepAspectRatio}
                  onChange={(e) => setOptions(prev => ({ ...prev, keepAspectRatio: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <label htmlFor="ratio" className="text-sm text-slate-600 select-none cursor-pointer">锁定比例</label>
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-800">导出设置</h2>
              {image && !aiSuggestion && (
                <button 
                  onClick={handleAiAnalyze}
                  disabled={isAnalyzing}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-400"
                >
                  {isAnalyzing ? '分析中...' : 'AI 建议'}
                </button>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">导出格式</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['jpeg', 'png', 'gif'] as ExportFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setOptions(prev => ({ ...prev, exportFormat: fmt }))}
                      disabled={!image}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                        options.exportFormat === fmt 
                          ? 'bg-blue-50 border-blue-500 text-blue-600' 
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      } disabled:opacity-50`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <NumberInput 
                  label="切片高度" 
                  value={options.sliceHeight} 
                  onChange={(val) => setOptions(prev => ({ ...prev, sliceHeight: val }))}
                  disabled={!image}
                />
                {image && (
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">单张预估大小:</span>
                    <span className={`text-xs font-bold ${isSizeHigh ? 'text-amber-500' : 'text-slate-600'}`}>
                      {estimatedSliceSize || '--'}
                    </span>
                  </div>
                )}
              </div>

              {aiSuggestion && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 animate-fade-in">
                  <p className="font-bold mb-1 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1a1 1 0 112 0v1a1 1 0 11-2 0zM13.536 14.95a1 1 0 011.414-1.414l.707.707a1 1 0 01-1.414 1.414l-.707-.707zM6.464 14.95l.707-.707a1 1 0 111.414 1.414l-.707.707a1 1 0 01-1.414-1.414z"></path></svg>
                    AI 建议: {aiSuggestion.suggestedHeight}px
                  </p>
                  <p className="opacity-80">{aiSuggestion.reason}</p>
                </div>
              )}

              <div className="pt-2">
                <p className="text-xs text-slate-400 mb-4">
                  {image ? `预计生成 ${Math.ceil(options.targetHeight / options.sliceHeight)} 张切片` : '请先上传图片'}
                </p>
                <button 
                  onClick={handleSlice}
                  disabled={!image || isProcessing}
                  className="w-full bg-slate-900 hover:bg-black text-white py-3 rounded-xl font-bold transition-all disabled:bg-slate-200 shadow-md flex items-center justify-center gap-2"
                >
                  {isProcessing && (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {isProcessing ? '处理中...' : '开始切图'}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          {!image ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 min-h-[400px] border-4 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all group"
            >
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-slate-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-slate-600 font-medium">点击或拖拽上传图片</p>
              <p className="text-slate-400 text-sm mt-1">支持 JPG, PNG, WEBP, GIF</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="image/*" 
              />
            </div>
          ) : (
            <div className="flex flex-col gap-6 animate-fade-in">
              {/* Preview Original */}
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800">原图预览</h3>
                  <button onClick={() => { setImage(null); setSlices([]); }} className="text-slate-400 hover:text-red-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="max-h-[500px] overflow-auto rounded-lg bg-slate-50 border border-slate-100 scrollbar-thin scrollbar-thumb-slate-200">
                  <img src={image.originalUrl} alt="Preview" className="max-w-full mx-auto" />
                </div>
              </div>

              {/* Slice Results */}
              {slices.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-slate-800 text-xl">切图结果 ({slices.length})</h3>
                    <button 
                      onClick={downloadAll}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-md"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      一键下载全部
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {slices.map((slice) => (
                      <div key={slice.id} className="group relative border border-slate-100 rounded-xl overflow-hidden hover:shadow-md transition-all">
                        <img src={slice.url} alt={`Slice ${slice.index}`} className="w-full aspect-[4/3] object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                           <a 
                            href={slice.url} 
                            download={`slice_${slice.index + 1}.${slice.format}`}
                            className="bg-white text-slate-900 p-2 rounded-full hover:scale-110 transition-transform shadow-lg"
                           >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                           </a>
                        </div>
                        <div className="p-3 bg-white border-t border-slate-50 flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Slice {slice.index + 1}</span>
                            <span className="text-[10px] text-blue-500 font-medium">{slice.sizeLabel}</span>
                          </div>
                          <span className="text-[10px] text-slate-300 font-bold uppercase">{slice.format}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mt-12 py-8 border-t border-slate-100 text-center text-slate-400 text-sm">
        <p>&copy; 2024 JJBoo PixelSlice. Design by JJBoo</p>
      </footer>
    </div>
  );
};

export default App;
