

export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr'
}

export enum Tone {
  Neutral = 'Neutral',
  Cheerful = 'Cheerful',
  Professional = 'Professional',
  Empathetic = 'Empathetic',
  Dramatic = 'Dramatic',
  Whisper = 'Whisper',
  Robotic = 'Robotic'
}

export enum VideoAspectRatio {
  Landscape = 'Landscape',
  Portrait = 'Portrait'
}

export interface EmotionVector {
  valence: number; // -1 (Negative) to 1 (Positive)
  arousal: number; // -1 (Calm) to 1 (Intense)
}

export interface CustomVoice {
  id: string;
  name: string;
  baseVoice: VoiceName;
  settings: {
    pitch: number;
    speed: number;
    emotion: EmotionVector;
  };
  createdAt: number;
}

export enum VisualizationMode {
  Frequency = 'Frequency',
  Waveform = 'Waveform'
}

export interface GenerationSettings {
  voice: VoiceName;
  emotion: EmotionVector;
  text: string;
}

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  analyser: AnalyserNode | null;
}

export interface PitchPoint {
  id: string;
  x: number; // 0 to 1 (Time normalized)
  y: number; // -12 to 12 (Semitones)
}

export interface AudioEffects {
  reverb: number;     // 0.0 to 1.0 (Mix)
  delay: number;      // 0.0 to 1.0 (Feedback/Mix)
  distortion: number; // 0.0 to 1.0 (Drive)
}