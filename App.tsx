import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Wand2, Volume2, Loader2, Activity, Waves, BarChart2, Download } from 'lucide-react';
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
      a.download = `qubitspeak_${voice.toLowerCase()}_${Date.now()}.wav`;
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
    <div className="min-h-screen w-full bg-qubit-900 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] text-white selection:bg-qubit-accent selection:text-black font-sans">
      <div className="fixed inset-0 bg-grid-pattern bg-[size:50px_50px] opacity-5 pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        <header className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-gradient-to-br from-qubit-accent to-qubit-purple rounded flex items-center justify-center shadow-lg shadow-qubit-accent/20">
                <Volume2 className="text-white" size={24} />
             </div>
             <div>
                <h1 className="text-2xl font-bold tracking-tight">Qubit<span className="text-qubit-accent">Speak</span></h1>
                <p className="text-xs text-gray-500 font-mono tracking-widest">GEMINI.2.5.FLASH.TTS // BUILD.9821</p>
             </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
             <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
             <span className="text-xs font-mono text-gray-300">SYSTEM_ONLINE</span>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column */}
            <div className="lg:col-span-7 space-y-6">
               {/* Input */}
               <div className="glass-panel p-1 rounded-2xl">
                 <div className="bg-qubit-900/80 rounded-xl p-4 border border-white/5 min-h-[250px] flex flex-col relative group">
                    <div className="absolute top-4 right-4 text-xs font-mono text-gray-600 group-hover:text-qubit-accent transition-colors">TXT_INPUT</div>
                    <textarea 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Enter text to synthesize..."
                        className="w-full h-full bg-transparent resize-none border-none focus:ring-0 text-gray-200 text-lg leading-relaxed placeholder:text-gray-700 font-light outline-none flex-grow min-h-[200px]"
                    />
                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/5">
                        <span className="text-xs font-mono text-gray-500">{text.length} CHARS</span>
                        <button onClick={() => setText('')} className="text-xs text-gray-500 hover:text-white transition-colors uppercase font-mono">Clear</button>
                    </div>
                 </div>
               </div>

               {/* Visualizer & Automation */}
               <div className="glass-panel p-6 rounded-2xl border border-white/5 relative overflow-hidden space-y-4">
                  <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Activity size={16} className="text-qubit-accent" />
                            <span className="text-sm font-mono font-semibold tracking-wider text-gray-300">VISUALIZATION</span>
                        </div>
                        <div className="flex bg-qubit-900 rounded-lg p-1 border border-white/10">
                            <button onClick={() => setVisMode(VisualizationMode.Waveform)} className={`p-1.5 rounded ${visMode === VisualizationMode.Waveform ? 'bg-qubit-700 text-qubit-accent' : 'text-gray-500 hover:text-gray-300'}`}><Waves size={14} /></button>
                            <button onClick={() => setVisMode(VisualizationMode.Frequency)} className={`p-1.5 rounded ${visMode === VisualizationMode.Frequency ? 'bg-qubit-700 text-qubit-accent' : 'text-gray-500 hover:text-gray-300'}`}><BarChart2 size={14} /></button>
                        </div>
                      </div>
                      {isPlaying && <span className="text-xs font-mono text-qubit-accent animate-pulse">PLAYING...</span>}
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
                <div className="glass-panel p-6 rounded-2xl border-t border-white/10 bg-gradient-to-b from-white/5 to-transparent">
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !text.trim()}
                        className={`w-full py-4 rounded-xl font-bold tracking-wide flex items-center justify-center gap-3 transition-all duration-300 relative overflow-hidden group ${
                            isLoading 
                            ? 'bg-qubit-800 text-gray-500 cursor-not-allowed border border-white/5' 
                            : 'bg-white text-black hover:bg-qubit-accent hover:shadow-[0_0_30px_rgba(0,216,255,0.4)] hover:border-qubit-accent'
                        }`}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                <span className="font-mono">SYNTHESIZING...</span>
                            </>
                        ) : (
                            <>
                                <Wand2 size={20} className={text.trim() ? "text-qubit-purple group-hover:text-black" : "text-gray-400"} />
                                <span>GENERATE SPEECH</span>
                            </>
                        )}
                    </button>
                    
                    {isLoading && (
                        <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                             <div className="flex justify-between text-[10px] font-mono text-qubit-accent">
                                 <span className="animate-pulse">PROCESSING_NEURAL_DATA...</span>
                                 <span>{Math.round(generationProgress)}%</span>
                             </div>
                             <div className="h-1 bg-qubit-900 rounded-full overflow-hidden border border-white/5">
                                 <div className="h-full bg-qubit-accent shadow-[0_0_10px_rgba(0,216,255,0.5)] transition-all duration-300 ease-out relative" style={{ width: `${generationProgress}%` }}>
                                    <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-white shadow-[0_0_5px_white]"></div>
                                 </div>
                             </div>
                        </div>
                    )}
                    {error && <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-mono rounded">ERROR: {error}</div>}
                </div>

                <Controls 
                    voice={voice} setVoice={setVoice} 
                    emotion={emotion} setEmotion={setEmotion}
                    speed={speed} setSpeed={setSpeed}
                    disabled={isLoading}
                />
                
                {/* Playback Controls */}
                <div className="glass-panel p-4 rounded-xl flex items-center gap-4 border border-white/5">
                    <button
                        onClick={togglePlayback}
                        disabled={!audioBufferRef.current || isLoading}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                            !audioBufferRef.current ? 'bg-white/5 text-gray-600' : isPlaying ? 'bg-qubit-accent text-black shadow-lg shadow-qubit-accent/30' : 'bg-qubit-700 text-white hover:bg-qubit-600'
                        }`}
                    >
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                    </button>
                    <div className="flex-1">
                        <div className="text-xs font-mono text-gray-500 mb-1 flex justify-between">
                            <span>TIMELINE</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div 
                            className={`h-2 bg-gray-800 rounded-full overflow-hidden relative group ${audioBufferRef.current ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                            onClick={handleScrub}
                        >
                             <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                             <div className="h-full bg-qubit-accent relative transition-all duration-100 ease-out" style={{ width: `${progress}%` }}>
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"></div>
                             </div>
                        </div>
                    </div>
                    <button 
                        onClick={handleDownload}
                        disabled={!audioBufferRef.current || isLoading || isProcessingDownload}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${!audioBufferRef.current ? 'border-white/5 text-gray-700 cursor-not-allowed' : 'border-white/10 text-gray-400 hover:text-qubit-accent hover:border-qubit-accent/50 hover:bg-qubit-accent/10'}`}
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