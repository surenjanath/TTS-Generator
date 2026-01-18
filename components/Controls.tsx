import React, { useRef, useState, useEffect } from 'react';
import { Settings2, Mic2, Activity, Gauge } from 'lucide-react';
import { TONES, VOICES } from '../constants';
import { VoiceName, EmotionVector } from '../types';

interface ControlsProps {
  voice: VoiceName;
  setVoice: (v: VoiceName) => void;
  emotion: EmotionVector;
  setEmotion: (e: EmotionVector) => void;
  speed: number;
  setSpeed: (s: number) => void;
  disabled: boolean;
}

const Controls: React.FC<ControlsProps> = ({ 
  voice, setVoice, 
  emotion, setEmotion, 
  speed, setSpeed,
  disabled,
}) => {
  const padRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert coordinate (-1 to 1) to Percentage (0 to 100)
  const toPct = (val: number) => (val + 1) * 50;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    setIsDragging(true);
    updateEmotionFromEvent(e);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || disabled) return;
    updateEmotionFromEvent(e);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const updateEmotionFromEvent = (e: React.MouseEvent | MouseEvent) => {
    if (!padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    
    // Calculate clamped positions
    let x = (e.clientX - rect.left) / rect.width;
    let y = 1 - (e.clientY - rect.top) / rect.height; // Invert Y so up is positive

    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    // Convert to -1 to 1 range
    const valence = (x * 2) - 1;
    const arousal = (y * 2) - 1;

    setEmotion({ valence, arousal });
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-6">
      <div className="flex items-center space-x-2 text-qubit-accent mb-4 border-b border-white/5 pb-2">
        <Settings2 size={18} />
        <h3 className="font-mono text-sm font-semibold tracking-wider">SYNTHESIS_PARAMETERS</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Voice Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2 text-xs font-mono text-gray-400 uppercase">
              <Mic2 size={14} />
              <span>Voice Model</span>
            </label>
          </div>
          
          <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto pr-1">
            {/* Standard Voices */}
            <div className="text-[10px] font-mono text-gray-500 mb-1 mt-1">STANDARD MODELS</div>
            {VOICES.map((v) => (
              <button
                key={v.id}
                onClick={() => setVoice(v.id)}
                disabled={disabled}
                className={`group relative flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-200 text-left ${
                  voice === v.id
                    ? 'bg-qubit-accent/10 border-qubit-accent text-white shadow-[0_0_15px_rgba(0,216,255,0.15)]'
                    : 'bg-qubit-800/50 border-white/5 text-gray-400 hover:border-white/20 hover:bg-qubit-800'
                }`}
              >
                <div className="flex flex-col">
                    <span className="font-sans font-medium text-sm">{v.label}</span>
                </div>
                {voice === v.id && <div className="w-2 h-2 rounded-full bg-qubit-accent shadow-[0_0_8px_rgba(0,216,255,1)]"></div>}
              </button>
            ))}
          </div>
        </div>

        {/* Emotion Spectrum Editor */}
        <div className="space-y-3">
          <label className="flex items-center justify-between text-xs font-mono text-gray-400 uppercase">
             <div className="flex items-center space-x-2">
                <Activity size={14} />
                <span>Emotional Spectrum</span>
             </div>
             <div className="text-[10px] text-qubit-accent">
               V:{emotion.valence.toFixed(2)} A:{emotion.arousal.toFixed(2)}
             </div>
          </label>

          <div 
             ref={padRef}
             onMouseDown={handleMouseDown}
             className={`w-full aspect-square bg-qubit-900 rounded-xl border border-white/10 relative overflow-hidden group ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'}`}
             style={{
                backgroundImage: `
                   linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
                   linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px),
                   radial-gradient(circle at center, rgba(124, 58, 237, 0.1), transparent 70%)
                `,
                backgroundSize: '25% 25%, 25% 25%, 100% 100%'
             }}
          >
              {/* Axis Labels */}
              <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 font-mono tracking-widest pointer-events-none">INTENSE</span>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 font-mono tracking-widest pointer-events-none">CALM</span>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-gray-500 font-mono tracking-widest pointer-events-none">NEGATIVE</span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-[10px] text-gray-500 font-mono tracking-widest pointer-events-none">POSITIVE</span>

              {/* Center Lines */}
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/10"></div>
              <div className="absolute left-0 right-0 top-1/2 h-px bg-white/10"></div>

              {/* The Puck */}
              <div 
                className="absolute w-4 h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] border-2 border-qubit-accent transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 pointer-events-none z-10"
                style={{ 
                    left: `${toPct(emotion.valence)}%`, 
                    top: `${100 - toPct(emotion.arousal)}%` 
                }}
              >
                  <div className="absolute inset-0 bg-qubit-accent opacity-20 animate-ping rounded-full"></div>
              </div>
          </div>
          
          {/* Preset Buttons */}
          <div className="grid grid-cols-4 gap-1.5 mt-2">
            {TONES.map((t) => (
               <button
                 key={t.id}
                 onClick={() => setEmotion({ valence: t.valence, arousal: t.arousal })}
                 disabled={disabled}
                 title={t.description}
                 className={`text-[10px] py-1.5 px-1 rounded border font-mono transition-all ${
                    Math.abs(emotion.valence - t.valence) < 0.1 && Math.abs(emotion.arousal - t.arousal) < 0.1
                    ? 'bg-white/10 border-qubit-accent text-white' 
                    : 'bg-transparent border-white/5 text-gray-500 hover:text-gray-300 hover:border-white/10'
                 }`}
               >
                 {t.label.toUpperCase().slice(0, 4)}
               </button>
            ))}
          </div>

        </div>
      </div>

      {/* Audio Modulation Section */}
      <div className="pt-4 border-t border-white/5">
         <div className="flex items-center space-x-2 text-gray-300 mb-4">
            <Gauge size={16} />
            <h3 className="font-mono text-xs font-semibold tracking-wider uppercase">Timing Control</h3>
         </div>
         
         <div className="space-y-3">
            <div className="flex justify-between items-center">
                <label className="flex items-center space-x-2 text-xs font-mono text-gray-400 uppercase">
                    <span>Playback Speed</span>
                </label>
                <span className="text-xs font-mono text-qubit-accent">{speed.toFixed(1)}x</span>
            </div>
            <input 
                type="range" 
                min="0.5" 
                max="2.0" 
                step="0.1" 
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                disabled={disabled}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-qubit-accent hover:accent-qubit-accent/80"
            />
            <div className="flex justify-between text-[10px] text-gray-600 font-mono">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Controls;