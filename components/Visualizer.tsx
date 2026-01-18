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

      if (mode === VisualizationMode.Frequency) {
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate Audio Energy (Volume) for Auto-Gain
        let sum = 0;
        for(let i=0; i<bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;
        
        // Smooth the volume reading
        smoothedVolumeRef.current += (average - smoothedVolumeRef.current) * 0.1;
        
        // Calculate Dynamic Boost
        // If volume is low (< 30), boost significantly. If high (> 100), boost less.
        // Base boost is 1.2x. Max boost is 3x.
        const dynamicBoost = smoothedVolumeRef.current < 5 ? 0 : Math.max(1.0, Math.min(3.0, 60 / (smoothedVolumeRef.current + 1)));

        const barWidth = (WIDTH / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          // Get value and apply dynamic boost
          const rawValue = dataArray[i];
          const boostedValue = Math.min(255, rawValue * dynamicBoost);
          
          // Temporal Smoothing
          const prev = previousDataRef.current![i];
          // Attack is fast (0.5), decay is slow (0.1)
          const smoothingFactor = boostedValue > prev ? 0.5 : 0.15; 
          const smoothValue = prev + (boostedValue - prev) * smoothingFactor;
          
          previousDataRef.current![i] = smoothValue;

          // Draw
          const barHeight = (smoothValue / 255) * HEIGHT;
          
          // Create gradient based on tone color
          const gradient = ctx.createLinearGradient(0, HEIGHT, 0, HEIGHT - barHeight);
          gradient.addColorStop(0, `${activeColor}40`); // Transparent at bottom
          gradient.addColorStop(0.5, activeColor);
          gradient.addColorStop(1, '#ffffff'); // White tip

          ctx.fillStyle = gradient;
          
          // Draw rounded rect top
          if (barHeight > 1) {
              ctx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);
          }

          x += barWidth + 1;
        }
      } else {
        // Waveform Logic
        analyser.getByteTimeDomainData(timeArray);
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = activeColor;
        ctx.shadowBlur = 4;
        ctx.shadowColor = activeColor;
        
        ctx.beginPath();
        
        const sliceWidth = WIDTH * 1.0 / bufferLength;
        let x = 0;

        // Auto-scaling waveform
        // Calculate peak amplitude
        let maxAmp = 0;
        for(let i=0; i<bufferLength; i++) {
            const v = Math.abs(timeArray[i] - 128);
            if (v > maxAmp) maxAmp = v;
        }
        
        // If signal is weak, zoom in (limit zoom to 5x)
        const zoom = maxAmp < 5 ? 1 : Math.max(1, Math.min(5, 64 / (maxAmp + 1)));

        for(let i = 0; i < bufferLength; i++) {
            const v = (timeArray[i] - 128) * zoom; // Center at 0 and zoom
            const y = (HEIGHT / 2) + (v / 128) * (HEIGHT / 2); // Map to screen

            if(i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        ctx.stroke();
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