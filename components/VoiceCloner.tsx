import React, { useState, useRef } from 'react';
import { Upload, X, Mic, Fingerprint, Loader2, CheckCircle2, Music } from 'lucide-react';
import { VoiceName, CustomVoice } from '../types';
import { VOICES } from '../constants';

interface VoiceClonerProps {
  onClose: () => void;
  onSave: (voice: CustomVoice) => void;
}

const VoiceCloner: React.FC<VoiceClonerProps> = ({ onClose, onSave }) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'naming'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [voiceName, setVoiceName] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      simulateProcessing();
    }
  };

  const simulateProcessing = () => {
    setStep('processing');
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => setStep('naming'), 500);
      }
      setAnalysisProgress(progress);
    }, 100);
  };

  const handleSave = () => {
    if (!voiceName.trim()) return;

    // Simulate extracted parameters from the "Analysis"
    // In a real backend, this would return the model ID or fine-tuned weights
    const randomBaseVoice = VOICES[Math.floor(Math.random() * VOICES.length)].id as VoiceName;
    const randomPitch = Math.floor(Math.random() * 10) - 5; // -5 to 5
    const randomSpeed = 0.9 + Math.random() * 0.2; // 0.9 to 1.1

    const newVoice: CustomVoice = {
      id: `custom_${Date.now()}`,
      name: voiceName,
      baseVoice: randomBaseVoice,
      settings: {
        pitch: randomPitch,
        speed: randomSpeed,
        emotion: { valence: 0, arousal: 0 }
      },
      createdAt: Date.now()
    };

    onSave(newVoice);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-qubit-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-2 text-qubit-accent">
            <Fingerprint size={20} />
            <h3 className="font-mono font-bold tracking-wider">VOICE_CLONING_PROTOCOL</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8">
          {step === 'upload' && (
            <div className="space-y-6 text-center">
              <div 
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-white/20 rounded-xl p-10 hover:border-qubit-accent hover:bg-qubit-accent/5 transition-all cursor-pointer group"
              >
                <div className="w-16 h-16 bg-qubit-800 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="text-gray-400 group-hover:text-qubit-accent" size={32} />
                </div>
                <p className="text-lg font-medium text-gray-200">Upload Audio Sample</p>
                <p className="text-sm text-gray-500 mt-2">WAV, MP3, or FLAC (Max 5MB)</p>
                <p className="text-xs text-gray-600 mt-4 font-mono">Minimum 10s of clear speech required</p>
                <input 
                  type="file" 
                  ref={inputRef} 
                  onChange={handleFileChange} 
                  accept="audio/*" 
                  className="hidden" 
                />
              </div>
              
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 font-mono">
                <Mic size={12} />
                <span>MICROPHONE INPUT COMING SOON</span>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="space-y-6 text-center py-8">
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 border-4 border-qubit-accent/30 rounded-full animate-ping"></div>
                <div className="absolute inset-0 border-4 border-t-qubit-accent border-r-transparent border-b-qubit-accent border-l-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                   <Fingerprint className="text-qubit-accent animate-pulse" size={32} />
                </div>
              </div>
              
              <div>
                <h4 className="text-lg font-bold text-white mb-2">Analyzing Voice Biometrics</h4>
                <p className="text-sm text-gray-400 font-mono">EXTRACTING TIMBRE... {Math.round(analysisProgress)}%</p>
              </div>

              <div className="h-1 bg-gray-800 rounded-full overflow-hidden w-full max-w-[200px] mx-auto">
                <div 
                   className="h-full bg-qubit-accent transition-all duration-100 ease-out"
                   style={{ width: `${analysisProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {step === 'naming' && (
            <div className="space-y-6">
              <div className="text-center">
                 <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/50">
                    <CheckCircle2 className="text-green-500" size={32} />
                 </div>
                 <h4 className="text-xl font-bold text-white">Model Successfully Cloned</h4>
                 <p className="text-sm text-gray-400 mt-2">New voice model trained and ready.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono text-gray-500 uppercase">Voice Model Name</label>
                <input 
                  type="text" 
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="e.g. My Custom Voice"
                  className="w-full bg-qubit-800 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-qubit-accent font-sans"
                  autoFocus
                />
              </div>

              <button 
                onClick={handleSave}
                className="w-full py-3 bg-qubit-accent text-black font-bold rounded-lg hover:bg-white transition-colors flex items-center justify-center gap-2"
              >
                <Music size={18} />
                <span>SAVE PRESET</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceCloner;