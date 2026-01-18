
import React from 'react';
import { Sliders, Zap, Layers, Mountain, AudioWaveform } from 'lucide-react';
import { AudioEffects } from '../types';

interface EffectsRackProps {
  effects: AudioEffects;
  setEffects: React.Dispatch<React.SetStateAction<AudioEffects>>;
  disabled: boolean;
}

const EffectsRack: React.FC<EffectsRackProps> = ({ effects, setEffects, disabled }) => {
  const updateEffect = (key: keyof AudioEffects, value: number) => {
    setEffects(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
       <div className="flex items-center space-x-2 text-qubit-accent mb-2">
         <Sliders size={18} />
         <h3 className="font-mono text-sm font-semibold tracking-wider uppercase">FX_PROCESSOR_UNIT</h3>
       </div>

       <div className="grid grid-cols-3 gap-4">
          {/* Distortion */}
          <div className="bg-qubit-900/50 p-3 rounded-xl border border-white/5 flex flex-col items-center space-y-2 group">
             <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1">
               <Zap size={12} className={effects.distortion > 0 ? "text-yellow-400 fill-yellow-400" : "text-gray-600"} />
               Bitcrush
             </div>
             <div className="relative w-full h-24 flex items-center justify-center">
                 {/* Visual Indicator */}
                 <div className="absolute inset-0 flex items-end justify-center opacity-20 pointer-events-none">
                    <div className="w-full bg-yellow-400/20 transition-all duration-100" style={{ height: `${effects.distortion * 100}%` }}></div>
                 </div>
                 
                 <input 
                    type="range" 
                    min="0" max="1" step="0.01"
                    value={effects.distortion}
                    onChange={(e) => updateEffect('distortion', parseFloat(e.target.value))}
                    disabled={disabled}
                    className="h-full w-8 appearance-none bg-qubit-800 rounded-full border border-white/10 outline-none overflow-hidden cursor-pointer hover:border-qubit-accent/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-full [&::-webkit-slider-thumb]:h-[2px] [&::-webkit-slider-thumb]:bg-yellow-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(250,204,21,0.8)]"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' } as any}
                 />
             </div>
             <span className="text-[10px] font-mono text-gray-500">{(effects.distortion * 100).toFixed(0)}%</span>
          </div>

          {/* Delay */}
          <div className="bg-qubit-900/50 p-3 rounded-xl border border-white/5 flex flex-col items-center space-y-2">
             <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1">
               <Layers size={12} className={effects.delay > 0 ? "text-blue-400" : "text-gray-600"} />
               Echo
             </div>
             <div className="relative w-full h-24 flex items-center justify-center">
                 <div className="absolute inset-0 flex items-end justify-center opacity-20 pointer-events-none">
                    <div className="w-full bg-blue-400/20 transition-all duration-100" style={{ height: `${effects.delay * 100}%` }}></div>
                 </div>
                 <input 
                    type="range" 
                    min="0" max="1" step="0.01"
                    value={effects.delay}
                    onChange={(e) => updateEffect('delay', parseFloat(e.target.value))}
                    disabled={disabled}
                    className="h-full w-8 appearance-none bg-qubit-800 rounded-full border border-white/10 outline-none overflow-hidden cursor-pointer hover:border-qubit-accent/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-full [&::-webkit-slider-thumb]:h-[2px] [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(96,165,250,0.8)]"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' } as any}
                 />
             </div>
             <span className="text-[10px] font-mono text-gray-500">{(effects.delay * 100).toFixed(0)}%</span>
          </div>

          {/* Reverb */}
          <div className="bg-qubit-900/50 p-3 rounded-xl border border-white/5 flex flex-col items-center space-y-2">
             <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1">
               <Mountain size={12} className={effects.reverb > 0 ? "text-purple-400" : "text-gray-600"} />
               Space
             </div>
             <div className="relative w-full h-24 flex items-center justify-center">
                <div className="absolute inset-0 flex items-end justify-center opacity-20 pointer-events-none">
                    <div className="w-full bg-purple-400/20 transition-all duration-100" style={{ height: `${effects.reverb * 100}%` }}></div>
                 </div>
                 <input 
                    type="range" 
                    min="0" max="1" step="0.01"
                    value={effects.reverb}
                    onChange={(e) => updateEffect('reverb', parseFloat(e.target.value))}
                    disabled={disabled}
                    className="h-full w-8 appearance-none bg-qubit-800 rounded-full border border-white/10 outline-none overflow-hidden cursor-pointer hover:border-qubit-accent/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-full [&::-webkit-slider-thumb]:h-[2px] [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(168,85,247,0.8)]"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' } as any}
                 />
             </div>
             <span className="text-[10px] font-mono text-gray-500">{(effects.reverb * 100).toFixed(0)}%</span>
          </div>
       </div>
    </div>
  );
};

export default EffectsRack;
