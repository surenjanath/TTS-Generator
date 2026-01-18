import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Wand2, Loader2, Activity, Waves, BarChart2, Download, Zap } from 'lucide-react';
import { generateSpeech, bufferToWav, renderProcessedAudio } from './services/geminiService';
import { VoiceName, VisualizationMode, EmotionVector, PitchPoint } from './types';
import { SAMPLE_TEXT } from './constants';
import Controls from './components/Controls';
import Visualizer from './components/Visualizer';
import PitchEditor from './components/PitchEditor';

function App() {
  const [text, setText] = useState<string>(SAMPLE_TEXT);
  const [voice, setVoice] = useState<VoiceName>(VoiceName.Kore);
  const [emotion, setEmotion] = useState<EmotionVector>({ valence: 0, arousal: 0 });
  const [visMode, setVisMode] = useState<VisualizationMode>(VisualizationMode.Waveform);
  
  // Modulation State
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitchPoints, setPitchPoints] = useState<PitchPoint[]>([
      { id: 'start', x: 0, y: 0 }, 
      { id: 'end', x: 1, y: 0 }
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0); 
  const [isProcessingDownload, setIsProcessingDownload] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100
  const [error, setError] = useState<string | null>(null);

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  
  // Tracking Refs for Animation Loop
  const progressRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  
  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 2048; 
      analyserRef.current = analyser;
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setError(null);
    setIsLoading(true);
    setGenerationProgress(0);
    stopAudio(true); 
    
    const progressInterval = setInterval(() => {
        setGenerationProgress(prev => {
            if (prev >= 95) return prev;
            const increment = prev < 50 ? 4 : prev < 80 ? 1.5 : 0.5;
            return Math.min(95, prev + Math.random() * increment);
        });
    }, 150);

    try {
      initAudio();
      if (!audioContextRef.current) {
          clearInterval(progressInterval);
          return;
      }

      const buffer = await generateSpeech(text, voice, emotion, audioContextRef.current);
      
      clearInterval(progressInterval);
      setGenerationProgress(100);

      audioBufferRef.current = buffer;
      
      setTimeout(() => {
          setIsLoading(false);
          playAudio(buffer, 0);
      }, 500);

    } catch (err: any) {
      clearInterval(progressInterval);
      setGenerationProgress(0);
      setError(err.message || "Failed to generate audio.");
      setIsLoading(false);
    }
  };

  // Handle Speed Changes Live
  useEffect(() => {
    if (isPlaying && audioBufferRef.current && audioContextRef.current) {
       playAudio(audioBufferRef.current, progressRef.current);
    }
  }, [speed]);
  
  // Handle Pitch Points Live Update
  useEffect(() => {
    if (isPlaying && sourceRef.current && audioBufferRef.current && audioContextRef.current) {
       playAudio(audioBufferRef.current, progressRef.current);
    }
  }, [pitchPoints]); 

  const handleDownload = async () => {
    if (!audioBufferRef.current) return;
    try {
      setIsProcessingDownload(true);
      const processedBuffer = await renderProcessedAudio(audioBufferRef.current, speed, pitchPoints);
      
      const wavBlob = bufferToWav(processedBuffer);
      const url = URL.createObjectURL(wavBlob);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `auralis_${voice.toLowerCase()}_${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      
      window.setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      console.error("Download processing failed", e);
      setError("Failed to process audio for download");
    } finally {
      setIsProcessingDownload(false);
    }
  };

  // Helper to interpolate pitch at specific time t (0-1)
  const getPitchAt = (t: number) => {
      const sorted = [...pitchPoints].sort((a, b) => a.x - b.x);
      if (sorted.length === 0) return 0;
      if (t <= sorted[0].x) return sorted[0].y;
      if (t >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;

      for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i+1];
        if (t >= p1.x && t <= p2.x) {
            const ratio = (t - p1.x) / (p2.x - p1.x);
            return p1.y + ratio * (p2.y - p1.y);
        }
      }
      return 0;
  };

  const playAudio = (buffer: AudioBuffer, startPercentage: number) => {
    if (!audioContextRef.current || !analyserRef.current) return;
    
    // Stop previous
    if (sourceRef.current) {
        try { 
            sourceRef.current.onended = null; // Remove listener to avoid triggering stop logic
            sourceRef.current.stop(); 
        } catch (e) {}
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = speed;
    
    const now = audioContextRef.current.currentTime;
    
    // Calculate start offset in seconds based on percentage
    const offset = (startPercentage / 100) * buffer.duration;
    
    // Map points to automation
    // We assume the automation timeline maps to the BASE duration (original / speed).
    const nominalDuration = buffer.duration / speed;
    
    // Automation Logic
    const sorted = [...pitchPoints].sort((a, b) => a.x - b.x);
    
    // 1. Set Initial Pitch at Playhead
    // We need to know where we are in normalized time [0-1] to get current pitch
    // offset is in buffer seconds.
    const normalizedPos = startPercentage / 100;
    const initialPitch = getPitchAt(normalizedPos);
    source.detune.setValueAtTime(initialPitch * 100, now);
    
    // 2. Schedule Future Ramps
    // We only schedule ramps that occur AFTER the current playback position.
    // The "time" for automation is relative to when the track started playing (0).
    // But we are starting at `offset` (buffer time) -> `offset/speed` (real time relative to start).
    // So we need to shift the automation curve so it lines up.
    // The automation time T is usually `p.x * nominalDuration`.
    // We are starting playback at `startRealTime = (normalizedPos * nominalDuration)`.
    // So for a point at `T_point`, we schedule it at `now + (T_point - startRealTime)`.
    
    const startRealTime = normalizedPos * nominalDuration;
    
    sorted.forEach(p => {
        const pointTime = p.x * nominalDuration;
        if (pointTime > startRealTime) {
             const timeUntilPoint = pointTime - startRealTime;
             source.detune.linearRampToValueAtTime(p.y * 100, now + timeUntilPoint);
        }
    });

    source.connect(analyserRef.current);
    analyserRef.current.connect(audioContextRef.current.destination);
    
    // Setup cleanup
    source.onended = () => {
        setIsPlaying(false);
        setProgress(100);
        progressRef.current = 100; 
        cancelAnimationFrame(animationFrameRef.current);
    };

    source.start(0, offset);
    sourceRef.current = source;
    
    setIsPlaying(true);
    
    // Animation Loop
    progressRef.current = startPercentage;
    lastTimeRef.current = audioContextRef.current.currentTime;
    
    cancelAnimationFrame(animationFrameRef.current);
    
    const animate = () => {
      if (!audioContextRef.current) return;
      
      const currentTime = audioContextRef.current.currentTime;
      const dt = currentTime - lastTimeRef.current;
      lastTimeRef.current = currentTime;
      
      // Calculate instantaneous speed
      // Base speed * pitch factor
      const currentPitch = getPitchAt(progressRef.current / 100);
      const pitchFactor = Math.pow(2, currentPitch / 12);
      const instantaneousSpeed = speed * pitchFactor;
      
      // Calculate how much buffer % we consumed
      // % = (seconds consumed / total seconds) * 100
      // seconds consumed = dt * instantaneousSpeed
      const percentConsumed = (dt * instantaneousSpeed / buffer.duration) * 100;
      
      progressRef.current = Math.min(100, progressRef.current + percentConsumed);
      setProgress(progressRef.current);
      
      if (progressRef.current < 100) {
          animationFrameRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
  };

  const stopAudio = (reset = false) => {
    if (sourceRef.current) {
      try { 
          sourceRef.current.onended = null;
          sourceRef.current.stop(); 
      } catch (e) {}
      sourceRef.current = null;
    }
    
    cancelAnimationFrame(animationFrameRef.current);
    setIsPlaying(false);
    
    if (reset) {
      setProgress(0);
      progressRef.current = 0;
    } 
  };

  const togglePlayback = () => {
    if (isPlaying) {
      stopAudio(false); 
    } else if (audioBufferRef.current) {
      let resumePct = progressRef.current;
      if (resumePct >= 100) {
          resumePct = 0;
      }
      playAudio(audioBufferRef.current, resumePct);
    }
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioBufferRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width)) * 100;
    
    setProgress(percentage);
    progressRef.current = percentage;
    
    if (isPlaying) {
      playAudio(audioBufferRef.current, percentage);
    }
  };

  const getVisualizerTone = () => "Neutral" as any; 

  return (
    <div className="min-h-screen w-full bg-qubit-950 text-white selection:bg-qubit-accent selection:text-black font-sans relative overflow-hidden">
      {/* Ambient Background Elements */}
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] bg-qubit-purple/10 rounded-full blur-[120px] pointer-events-none animate-pulse-slow" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-qubit-accent/10 rounded-full blur-[120px] pointer-events-none" />
      
      {/* Noise Texture */}
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
      
      {/* Grid Pattern */}
      <div className="fixed inset-0 bg-grid-pattern bg-[size:50px_50px] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        <header className="flex justify-between items-center mb-12 border-b border-white/5 pb-6">
          <div className="flex items-center gap-4">
             {/* Logo */}
             <div className="w-10 h-10 relative flex items-center justify-center">
                <svg viewBox="0 0 40 40" className="w-full h-full text-qubit-accent">
                   <path d="M20 4L4 32H36L20 4Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" className="drop-shadow-[0_0_10px_rgba(0,216,255,0.5)]"/>
                   <path d="M20 12V24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-qubit-purple drop-shadow-[0_0_10px_rgba(124,58,237,0.5)]"/>
                   <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1" className="opacity-30" strokeDasharray="4 4" />
                </svg>
             </div>
             <div>
                <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">Auralis</h1>
                <p className="text-[10px] text-qubit-accent font-mono tracking-[0.2em] uppercase opacity-80">Generative Synthesis Architecture</p>
             </div>
          </div>
          <div className="hidden md:flex items-center gap-3 px-4 py-1.5 bg-qubit-800/50 rounded-full border border-white/10 backdrop-blur-md">
             <Zap size={12} className="text-qubit-accent fill-qubit-accent" />
             <span className="text-xs font-mono text-gray-300">GEMINI.PRO.2.5 // READY</span>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column */}
            <div className="lg:col-span-7 space-y-6">
               {/* Input */}
               <div className="glass-panel p-1 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.3)]">
                 <div className="bg-qubit-950/50 rounded-xl p-6 border border-white/5 min-h-[280px] flex flex-col relative group transition-colors hover:bg-qubit-950/70">
                    <div className="absolute top-4 right-4 text-[10px] font-mono text-gray-700 group-hover:text-qubit-accent transition-colors flex items-center gap-1">
                        <span className="w-1 h-1 bg-current rounded-full"></span>
                        TEXT_INPUT_STREAM
                    </div>
                    <textarea 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Enter text to synthesize..."
                        className="w-full h-full bg-transparent resize-none border-none focus:ring-0 text-gray-200 text-lg leading-relaxed placeholder:text-gray-700 font-light outline-none flex-grow min-h-[200px]"
                    />
                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/5">
                        <span className="text-xs font-mono text-gray-600 group-hover:text-gray-400 transition-colors">{text.length} CHARACTERS</span>
                        <button onClick={() => setText('')} className="text-xs text-gray-600 hover:text-white transition-colors uppercase font-mono tracking-wider">Clear Buffer</button>
                    </div>
                 </div>
               </div>

               {/* Visualizer & Automation */}
               <div className="glass-panel p-6 rounded-2xl border border-white/5 relative overflow-hidden space-y-4">
                  <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Activity size={16} className="text-qubit-accent" />
                            <span className="text-xs font-mono font-bold tracking-widest text-gray-400 uppercase">Signal Visualizer</span>
                        </div>
                        <div className="flex bg-qubit-900 rounded-lg p-1 border border-white/10">
                            <button 
                                onClick={() => setVisMode(VisualizationMode.Waveform)} 
                                title="Waveform Mode"
                                className={`p-1.5 rounded transition-all ${visMode === VisualizationMode.Waveform ? 'bg-qubit-800 text-qubit-accent shadow-sm' : 'text-gray-600 hover:text-gray-300'}`}
                            >
                                <Waves size={14} />
                            </button>
                            <button 
                                onClick={() => setVisMode(VisualizationMode.Frequency)} 
                                title="Frequency Mode"
                                className={`p-1.5 rounded transition-all ${visMode === VisualizationMode.Frequency ? 'bg-qubit-800 text-qubit-accent shadow-sm' : 'text-gray-600 hover:text-gray-300'}`}
                            >
                                <BarChart2 size={14} />
                            </button>
                        </div>
                      </div>
                      {isPlaying && (
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-qubit-accent opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-qubit-accent"></span>
                            </span>
                            <span className="text-[10px] font-mono text-qubit-accent">LIVE_FEED</span>
                          </div>
                      )}
                  </div>
                  
                  <Visualizer analyser={analyserRef.current} isPlaying={isPlaying} mode={visMode} tone={getVisualizerTone()} />
                  
                  {/* Pitch Editor */}
                  <div className="pt-4 border-t border-white/5">
                      <PitchEditor 
                         points={pitchPoints} 
                         setPoints={setPitchPoints} 
                         currentTime={progress / 100}
                         isPlaying={isPlaying}
                         disabled={isLoading}
                      />
                  </div>
               </div>
            </div>

            {/* Right Column */}
            <div className="lg:col-span-5 space-y-6">
                <div className="glass-panel p-1 rounded-2xl bg-gradient-to-b from-white/10 to-transparent">
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !text.trim()}
                        className={`w-full py-5 rounded-xl font-bold tracking-wide flex items-center justify-center gap-3 transition-all duration-300 relative overflow-hidden group ${
                            isLoading 
                            ? 'bg-qubit-900 text-gray-500 cursor-not-allowed border border-white/5' 
                            : 'bg-white text-black hover:bg-qubit-accent hover:shadow-[0_0_40px_rgba(0,216,255,0.3)] border border-transparent'
                        }`}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                <span className="font-mono text-sm">PROCESSING...</span>
                            </>
                        ) : (
                            <>
                                <Wand2 size={20} className={text.trim() ? "text-qubit-purple group-hover:text-black transition-colors" : "text-gray-400"} />
                                <span>INITIALIZE SYNTHESIS</span>
                            </>
                        )}
                    </button>
                </div>
                    
                {isLoading && (
                    <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300 px-1">
                            <div className="flex justify-between text-[10px] font-mono text-qubit-accent uppercase tracking-wider">
                                <span className="animate-pulse">Neural Rendering</span>
                                <span>{Math.round(generationProgress)}%</span>
                            </div>
                            <div className="h-1 bg-qubit-900 rounded-full overflow-hidden border border-white/5">
                                <div className="h-full bg-qubit-accent shadow-[0_0_10px_rgba(0,216,255,0.5)] transition-all duration-300 ease-out relative" style={{ width: `${generationProgress}%` }}>
                                <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-white shadow-[0_0_5px_white]"></div>
                                </div>
                            </div>
                    </div>
                )}
                {error && <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono rounded">ERR_CODE_500: {error}</div>}

                <Controls 
                    voice={voice} setVoice={setVoice} 
                    emotion={emotion} setEmotion={setEmotion}
                    speed={speed} setSpeed={setSpeed}
                    disabled={isLoading}
                />
                
                {/* Playback Controls */}
                <div className="glass-panel p-5 rounded-2xl flex items-center gap-5 border border-white/5">
                    <button
                        onClick={togglePlayback}
                        disabled={!audioBufferRef.current || isLoading}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
                            !audioBufferRef.current ? 'bg-white/5 text-gray-600' : isPlaying ? 'bg-qubit-accent text-black shadow-[0_0_20px_rgba(0,216,255,0.4)] scale-105' : 'bg-white text-black hover:bg-qubit-accent hover:scale-105'
                        }`}
                    >
                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-1" />}
                    </button>
                    <div className="flex-1 space-y-2">
                        <div className="text-[10px] font-mono text-gray-500 flex justify-between tracking-widest uppercase">
                            <span>Sequence Timeline</span>
                            <span className="text-qubit-accent">{Math.round(progress)}%</span>
                        </div>
                        <div 
                            className={`h-2 bg-qubit-900 rounded-full overflow-hidden relative group border border-white/5 ${audioBufferRef.current ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                            onClick={handleScrub}
                        >
                             <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                             <div className="h-full bg-gradient-to-r from-qubit-purple to-qubit-accent relative transition-all duration-100 ease-out shadow-[0_0_10px_rgba(0,216,255,0.3)]" style={{ width: `${progress}%` }}>
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"></div>
                             </div>
                        </div>
                    </div>
                    <button 
                        onClick={handleDownload}
                        disabled={!audioBufferRef.current || isLoading || isProcessingDownload}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${!audioBufferRef.current ? 'border-white/5 text-gray-700 cursor-not-allowed' : 'border-white/10 text-gray-400 hover:text-qubit-accent hover:border-qubit-accent/50 hover:bg-qubit-accent/10 hover:shadow-[0_0_15px_rgba(0,216,255,0.2)]'}`}
                    >
                         {isProcessingDownload ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    </button>
                </div>
            </div>
        </main>
      </div>
    </div>
  );
}

export default App;