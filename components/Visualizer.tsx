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

  // Get color based on tone
  const activeColor = TONES.find(t => t.id === tone)?.color || '#00D8FF';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount; // For frequency
    const dataArray = new Uint8Array(bufferLength);
    const timeArray = new Uint8Array(bufferLength); // For waveform

    const draw = () => {
      // Handle High DPI scaling
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      // Only resize if dimensions change to avoid clearing constantly
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;
          ctx.scale(dpr, dpr);
      }

      const WIDTH = rect.width;
      const HEIGHT = rect.height;

      // Fade out effect for smoother trails
      ctx.fillStyle = 'rgba(11, 12, 21, 0.25)'; 
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      if (mode === VisualizationMode.Frequency) {
        analyser.getByteFrequencyData(dataArray);
        
        const barWidth = (WIDTH / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = dataArray[i];
          
          // Create gradient based on tone color
          const gradient = ctx.createLinearGradient(0, HEIGHT, 0, HEIGHT - (barHeight / 255) * HEIGHT);
          gradient.addColorStop(0, activeColor);
          gradient.addColorStop(1, '#ffffff'); // White tip

          ctx.fillStyle = gradient;
          
          // Smooth scaling
          const scaledHeight = (barHeight / 255) * HEIGHT * 0.9;
          
          // Draw rect
          ctx.fillRect(x, HEIGHT - scaledHeight, barWidth, scaledHeight);

          x += barWidth + 1;
        }
      } else {
        // Waveform Logic
        analyser.getByteTimeDomainData(timeArray);
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = activeColor;
        ctx.shadowBlur = 8;
        ctx.shadowColor = activeColor;
        
        ctx.beginPath();
        
        const sliceWidth = WIDTH * 1.0 / bufferLength;
        let x = 0;

        for(let i = 0; i < bufferLength; i++) {
            const v = timeArray[i] / 128.0;
            const y = v * HEIGHT / 2;

            if(i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        ctx.lineTo(WIDTH, HEIGHT / 2);
        ctx.stroke();
        
        // Reset shadow
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
    <div className="w-full h-48 rounded-xl overflow-hidden bg-qubit-800 border border-qubit-700 relative group">
        {!analyser && (
             <div className="absolute inset-0 flex items-center justify-center text-qubit-accent opacity-30 font-mono text-sm">
                AWAITING_AUDIO_SIGNAL...
             </div>
        )}
      <canvas ref={canvasRef} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
      
      {/* Overlay Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      </div>
      
      {/* Dynamic Color Glow Effect */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-10 transition-colors duration-500 mix-blend-screen"
        style={{ background: `radial-gradient(circle at center, ${activeColor}, transparent 70%)` }}
      />
    </div>
  );
};

export default Visualizer;