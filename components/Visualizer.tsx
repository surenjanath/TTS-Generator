import React, { useEffect, useRef } from 'react';
import { VisualizationMode, Tone } from '../types';
import { TONES } from '../constants';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  mode: VisualizationMode;
  tone: Tone;
}

const Visualizer: React.FC<VisualizerProps> = ({ analyser, isPlaying, mode, tone }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const previousDataRef = useRef<Float32Array | null>(null);
  const smoothedVolumeRef = useRef<number>(0);

  // Get color based on tone
  const activeColor = TONES.find(t => t.id === tone)?.color || '#00D8FF';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeArray = new Uint8Array(bufferLength);
    
    // Initialize smoothing buffer if size changed
    if (!previousDataRef.current || previousDataRef.current.length !== bufferLength) {
        previousDataRef.current = new Float32Array(bufferLength).fill(0);
    }

    const drawWaveformLine = (
      ctx: CanvasRenderingContext2D, 
      width: number, 
      height: number, 
      data: Uint8Array, 
      color: string, 
      alpha: number,
      lineWidth: number
    ) => {
      ctx.beginPath();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      
      const sliceWidth = width * 1.0 / data.length;
      let x = 0;

      // Auto-scaling waveform calculation
      let maxAmp = 0;
      for(let i=0; i<data.length; i++) {
          const v = Math.abs(data[i] - 128);
          if (v > maxAmp) maxAmp = v;
      }
      
      const zoom = maxAmp < 5 ? 1 : Math.max(1, Math.min(5, 64 / (maxAmp + 1)));

      for(let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) * zoom;
          const y = (height / 2) + (v / 128) * (height / 2);

          if(i === 0) {
              ctx.moveTo(x, y);
          } else {
              ctx.lineTo(x, y);
          }
          x += sliceWidth;
      }

      ctx.stroke();
      ctx.globalAlpha = 1.0; // Reset alpha
    };

    const draw = () => {
      // Handle High DPI scaling
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          ctx.scale(dpr, dpr);
      }

      const WIDTH = rect.width;
      const HEIGHT = rect.height;

      // Clear with fade effect
      ctx.fillStyle = 'rgba(11, 12, 21, 0.2)'; 
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Always fetch time domain data for the ghost effect or main view
      analyser.getByteTimeDomainData(timeArray);

      if (mode === VisualizationMode.Frequency) {
        // 1. Draw Ghost Waveform (Background)
        drawWaveformLine(ctx, WIDTH, HEIGHT, timeArray, activeColor, 0.15, 1);

        // 2. Draw Frequency Bars (Foreground)
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate Audio Energy (Volume) for Auto-Gain
        let sum = 0;
        for(let i=0; i<bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;
        smoothedVolumeRef.current += (average - smoothedVolumeRef.current) * 0.1;
        
        let dynamicBoost = 1.0;
        if (smoothedVolumeRef.current > 0.1) {
             dynamicBoost = Math.max(1.0, Math.min(5.0, 40 / (smoothedVolumeRef.current + 1)));
        }

        const barWidth = (WIDTH / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const rawValue = dataArray[i];
          const boostedValue = Math.min(255, rawValue * dynamicBoost);
          
          const prev = previousDataRef.current![i];
          const smoothingFactor = boostedValue > prev ? 0.5 : 0.15; 
          const smoothValue = prev + (boostedValue - prev) * smoothingFactor;
          
          previousDataRef.current![i] = smoothValue;

          const barHeight = (smoothValue / 255) * HEIGHT;
          
          const gradient = ctx.createLinearGradient(0, HEIGHT, 0, HEIGHT - barHeight);
          gradient.addColorStop(0, `${activeColor}40`);
          gradient.addColorStop(0.5, activeColor);
          gradient.addColorStop(1, '#ffffff');

          ctx.fillStyle = gradient;
          
          if (barHeight > 1) {
              ctx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);
          }

          x += barWidth + 1;
        }
      } else {
        // Waveform Mode - Draw High Contrast Waveform
        ctx.shadowBlur = 4;
        ctx.shadowColor = activeColor;
        drawWaveformLine(ctx, WIDTH, HEIGHT, timeArray, activeColor, 1.0, 2);
        ctx.shadowBlur = 0;
      }

      if (isPlaying || analyser.context.state === 'running') {
        animationRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isPlaying, mode, activeColor]);

  return (
    <div className="w-full h-48 rounded-xl overflow-hidden bg-qubit-800 border border-qubit-700 relative group shadow-inner">
        {!analyser && (
             <div className="absolute inset-0 flex items-center justify-center text-qubit-accent opacity-30 font-mono text-sm">
                AWAITING_AUDIO_SIGNAL...
             </div>
        )}
      <canvas ref={canvasRef} className="w-full h-full block" />
      
      {/* Overlay Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      </div>
      
      {/* Dynamic Color Glow Effect */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-5 transition-colors duration-500 mix-blend-screen"
        style={{ background: `radial-gradient(circle at center, ${activeColor}, transparent 80%)` }}
      />
    </div>
  );
};

export default Visualizer;