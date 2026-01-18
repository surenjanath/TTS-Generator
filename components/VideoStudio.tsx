import React, { useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { Film, Clapperboard, MonitorPlay, Smartphone, Loader2, Sparkles } from 'lucide-react';
import { VideoAspectRatio } from '../types';
import { generateBackgroundVideo } from '../services/geminiService';

interface VideoStudioProps {
  onVideoReady: (url: string) => void;
  isPlaying: boolean;
}

export interface VideoStudioRef {
  play: () => void;
  pause: () => void;
  reset: () => void;
}

const VideoStudio = forwardRef<VideoStudioRef, VideoStudioProps>(({ onVideoReady, isPlaying }, ref) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(VideoAspectRatio.Landscape);
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useImperativeHandle(ref, () => ({
    play: () => {
      if (videoRef.current) videoRef.current.play();
    },
    pause: () => {
      if (videoRef.current) videoRef.current.pause();
    },
    reset: () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }));

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    setVideoUrl(null);

    try {
      const url = await generateBackgroundVideo(prompt, aspectRatio);
      setVideoUrl(url);
      onVideoReady(url);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Video generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
      <div className="flex items-center space-x-2 text-qubit-accent mb-2">
        <Clapperboard size={18} />
        <h3 className="font-mono text-sm font-semibold tracking-wider uppercase">VEO_VIDEO_STUDIO</h3>
      </div>

      {/* Video Preview / Output Area */}
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/10 group">
        {isGenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-qubit-900/80 backdrop-blur-sm">
             <Loader2 size={32} className="text-qubit-accent animate-spin" />
             <div className="text-center">
               <p className="text-xs font-mono text-qubit-accent animate-pulse">RENDERING_FRAMES</p>
               <p className="text-[10px] text-gray-500 mt-1">Estimating physics & lighting...</p>
             </div>
          </div>
        ) : videoUrl ? (
          <video 
            ref={videoRef}
            src={videoUrl}
            loop 
            muted 
            playsInline
            className={`w-full h-full object-cover ${aspectRatio === VideoAspectRatio.Portrait ? 'object-contain bg-black' : ''}`}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-qubit-900/30">
             <Film size={32} className="opacity-20 mb-2" />
             <span className="text-xs font-mono">NO_SIGNAL</span>
          </div>
        )}
        
        {/* Overlay Grid */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-grid-pattern bg-[size:20px_20px]"></div>
      </div>

      {/* Inputs */}
      <div className="space-y-3 pt-2">
        <div className="bg-qubit-950/50 p-3 rounded-lg border border-white/5 focus-within:border-qubit-accent/50 transition-colors">
            <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the scene (e.g., A cyberpunk robot speaking in neon rain)..."
                className="w-full bg-transparent text-sm text-gray-200 placeholder:text-gray-600 outline-none resize-none h-16 font-light"
            />
        </div>

        <div className="flex items-center justify-between gap-3">
             <div className="flex bg-qubit-900 rounded-lg p-1 border border-white/10">
                <button
                    onClick={() => setAspectRatio(VideoAspectRatio.Landscape)}
                    className={`p-2 rounded flex items-center gap-2 text-[10px] font-mono transition-all ${aspectRatio === VideoAspectRatio.Landscape ? 'bg-qubit-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    <MonitorPlay size={14} /> 16:9
                </button>
                <button
                    onClick={() => setAspectRatio(VideoAspectRatio.Portrait)}
                    className={`p-2 rounded flex items-center gap-2 text-[10px] font-mono transition-all ${aspectRatio === VideoAspectRatio.Portrait ? 'bg-qubit-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    <Smartphone size={14} /> 9:16
                </button>
             </div>

             <button 
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className={`flex-1 py-2 px-4 rounded-lg font-mono text-xs font-bold tracking-wide flex items-center justify-center gap-2 transition-all ${
                    isGenerating 
                    ? 'bg-qubit-800 text-gray-500 cursor-not-allowed'
                    : 'bg-white/10 hover:bg-qubit-accent hover:text-black text-white border border-white/10 hover:border-transparent'
                }`}
             >
                {isGenerating ? 'PROCESSING...' : <><Sparkles size={14} /> GENERATE VIDEO</>}
             </button>
        </div>
        
        {error && (
            <div className="text-[10px] text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20 font-mono">
                ERR: {error}
            </div>
        )}
      </div>
    </div>
  );
});

export default VideoStudio;
