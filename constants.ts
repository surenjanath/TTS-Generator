import { Tone, VoiceName } from "./types";

export const VOICES = [
  { id: VoiceName.Puck, label: 'Puck (Neutral, Mid-range)', gender: 'Male' },
  { id: VoiceName.Charon, label: 'Charon (Deep, Authoritative)', gender: 'Male' },
  { id: VoiceName.Kore, label: 'Kore (Calm, Soothing)', gender: 'Female' },
  { id: VoiceName.Fenrir, label: 'Fenrir (Deep, Resonant)', gender: 'Male' },
  { id: VoiceName.Zephyr, label: 'Zephyr (Soft, Gentle)', gender: 'Female' },
];

export const TONES = [
  { id: Tone.Neutral, label: 'Neutral', description: 'Standard balanced delivery', color: '#00D8FF', valence: 0, arousal: 0 }, 
  { id: Tone.Cheerful, label: 'Cheerful', description: 'Upbeat and energetic', color: '#FACC15', valence: 0.8, arousal: 0.5 }, 
  { id: Tone.Professional, label: 'Professional', description: 'Clear, concise, business-like', color: '#60A5FA', valence: 0.2, arousal: 0.1 }, 
  { id: Tone.Empathetic, label: 'Empathetic', description: 'Warm and understanding', color: '#F472B6', valence: 0.5, arousal: -0.4 }, 
  { id: Tone.Dramatic, label: 'Dramatic', description: 'Intense and expressive', color: '#EF4444', valence: -0.1, arousal: 0.9 }, 
  { id: Tone.Whisper, label: 'Whisper', description: 'Soft, hushed tone', color: '#E5E7EB', valence: 0, arousal: -0.9 }, 
  { id: Tone.Robotic, label: 'Robotic', description: 'Precise, staccato delivery', color: '#4ADE80', valence: -0.5, arousal: -0.5 }, 
];

export const SAMPLE_TEXT = "Quantum computing harnesses the phenomena of quantum mechanics to deliver a huge leap forward in computation to solve certain problems.";