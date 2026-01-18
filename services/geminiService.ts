
import { GoogleGenAI } from "@google/genai";
import { Tone, VoiceName, EmotionVector, PitchPoint, AudioEffects, VideoAspectRatio } from "../types";
import { TONES } from "../constants";
import { makeDistortionCurve, createImpulseResponse } from "./audioUtils";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to decode Base64
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to decode audio data to AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function getEmotionDescription(emotion: EmotionVector): string {
  const { valence, arousal } = emotion;
  const preset = TONES.find(t => 
    Math.abs(t.valence - valence) < 0.1 && 
    Math.abs(t.arousal - arousal) < 0.1
  );
  if (preset) return preset.id.toLowerCase();

  let description = "";
  if (arousal > 0.6) description += "intense, excited";
  else if (arousal > 0.2) description += "energetic";
  else if (arousal < -0.6) description += "whispered, very calm";
  else if (arousal < -0.2) description += "relaxed, soft";
  else description += "moderate";
  description += " and ";
  if (valence > 0.6) description += "very happy, joyful";
  else if (valence > 0.2) description += "positive, cheerful";
  else if (valence < -0.6) description += "sad, somber";
  else if (valence < -0.2) description += "serious, concerned";
  else description += "neutral";
  return description;
}

async function generateAudioFromModel(
    model: string,
    promptText: string,
    voice: string,
    audioContext: AudioContext
): Promise<AudioBuffer> {
     // Using array format for contents to be strictly compliant
     const response = await ai.models.generateContent({
      model: model,
      contents: [{ parts: [{ text: promptText }] }],
      config: {
        responseModalities: ['AUDIO' as any], // Use string literal to avoid ESM enum issues
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        // Fallback: check if model returned text refusal/error
        const textPart = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textPart) {
             throw new Error(`Model returned text instead of audio: ${textPart.substring(0, 100)}...`);
        }
        throw new Error("No audio data returned from Gemini");
    }

    const audioBytes = decode(base64Audio);
    if (audioContext.state === 'suspended') await audioContext.resume();

    return await decodeAudioData(audioBytes, audioContext);
}

export const generateSpeech = async (
  text: string, 
  voice: VoiceName, 
  emotion: EmotionVector,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  let promptText = text;
  if (Math.abs(emotion.valence) > 0.05 || Math.abs(emotion.arousal) > 0.05) {
     const mood = getEmotionDescription(emotion);
     promptText = `Say in a ${mood} tone: ${text}`;
  }

  const model = "gemini-2.5-flash-preview-tts";
  let lastError;

  // Retry logic for 500/503 errors
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await generateAudioFromModel(model, promptText, voice, audioContext);
    } catch (error: any) {
      lastError = error;
      console.warn(`Attempt ${attempt} failed for model ${model}:`, error);
      
      // If error is not a server error (5xx), do not retry (e.g. 400 Bad Request)
      // We check for "500" or "503" in the message or status
      const isServerError = error.message && (error.message.includes("500") || error.message.includes("503") || error.status === 500 || error.status === 503);
      
      if (!isServerError) {
         throw error;
      }
      
      // Wait before retry (exponential backoff: 500ms, 1000ms)
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
  }

  // If we exhausted retries
  console.error("Gemini TTS Error after retries:", lastError);
  throw new Error(`Gemini Service unavailable. ${lastError?.message || "Internal Error"}`);
};

// Helper: Trim silence from the end of a buffer
function trimSilence(buffer: AudioBuffer): AudioBuffer {
  const data = buffer.getChannelData(0);
  let lastIndex = data.length - 1;
  // Threshold for silence
  while(lastIndex >= 0 && Math.abs(data[lastIndex]) < 0.001) {
      lastIndex--;
  }
  
  if (lastIndex < 0) return buffer; // Completely silent or empty
  
  // Add a small padding (e.g. 100ms) to prevent abrupt cut
  const padding = Math.min(buffer.length - 1 - lastIndex, Math.floor(buffer.sampleRate * 0.1));
  const newLength = lastIndex + 1 + padding;
  
  // If result is basically the same size, return original to save processing
  if (newLength >= buffer.length - 100) return buffer;
  
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, newLength, buffer.sampleRate);
  const trimmed = ctx.createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);
  
  for(let i=0; i<buffer.numberOfChannels; i++) {
      trimmed.copyToChannel(buffer.getChannelData(i).slice(0, newLength), i);
  }
  return trimmed;
}

// Process audio with effects for download (Offline Rendering)
export async function renderProcessedAudio(
  originalBuffer: AudioBuffer,
  speed: number,
  pitchPoints: PitchPoint[],
  effects: AudioEffects
): Promise<AudioBuffer> {
  // Determine duration based on pitch automation
  
  let minPitch = 0;
  if (pitchPoints.length > 0) {
      minPitch = Math.min(...pitchPoints.map(p => p.y));
  }

  // Effective rate factor at the lowest pitch point
  const minRateFactor = Math.pow(2, minPitch / 12);
  const minEffectiveSpeed = speed * minRateFactor;

  // Calculate worst-case duration
  const estimatedMaxDuration = originalBuffer.duration / minEffectiveSpeed;
  
  // Add large buffer for reverb tails (e.g. 4 seconds)
  const tailDuration = effects.reverb > 0 || effects.delay > 0 ? 4.0 : 1.5;
  const renderLength = Math.ceil(estimatedMaxDuration * originalBuffer.sampleRate) + (originalBuffer.sampleRate * tailDuration);
  
  const offlineCtx = new OfflineAudioContext(
    originalBuffer.numberOfChannels,
    renderLength,
    originalBuffer.sampleRate
  );

  // 1. Create Source with Pitch/Speed Automation
  const source = offlineCtx.createBufferSource();
  source.buffer = originalBuffer;
  source.playbackRate.value = speed;
  
  if (pitchPoints.length > 0) {
      const sorted = [...pitchPoints].sort((a, b) => a.x - b.x);
      const nominalDuration = originalBuffer.duration / speed;
      
      const initialPitch = sorted[0].y * 100;
      source.detune.setValueAtTime(initialPitch, 0);

      sorted.forEach(p => {
          const time = p.x * nominalDuration;
          source.detune.linearRampToValueAtTime(p.y * 100, time);
      });
  } else {
      source.detune.value = 0;
  }

  // 2. Build FX Chain (Manual reconstruction for offline context since nodes aren't transferable)
  // Input
  let lastNode: AudioNode = source;
  
  // A. Distortion
  if (effects.distortion > 0.01) {
      const dist = offlineCtx.createWaveShaper();
      dist.curve = makeDistortionCurve(effects.distortion * 400);
      dist.oversample = '4x';
      lastNode.connect(dist);
      lastNode = dist;
  }

  // B. Parallel Processing for Time-based FX
  // We need a merge node before destination
  const masterBus = offlineCtx.createGain();
  
  // Dry Path
  lastNode.connect(masterBus);

  // Delay Path
  if (effects.delay > 0.01) {
      const dNode = offlineCtx.createDelay();
      dNode.delayTime.value = 0.35;
      const dFeedback = offlineCtx.createGain();
      dFeedback.gain.value = effects.delay * 0.6; // Scale feedback
      
      const dVol = offlineCtx.createGain();
      dVol.gain.value = effects.delay * 0.5; // Scale volume

      lastNode.connect(dNode);
      dNode.connect(dFeedback);
      dFeedback.connect(dNode);
      dNode.connect(dVol);
      dVol.connect(masterBus);
  }

  // Reverb Path
  if (effects.reverb > 0.01) {
      const rNode = offlineCtx.createConvolver();
      rNode.buffer = createImpulseResponse(offlineCtx, 2.5, 2.5);
      const rGain = offlineCtx.createGain();
      rGain.gain.value = effects.reverb * 2.0;

      lastNode.connect(rNode);
      rNode.connect(rGain);
      rGain.connect(masterBus);
  }

  masterBus.connect(offlineCtx.destination);
  source.start();
  
  const renderedBuffer = await offlineCtx.startRendering();
  
  return trimSilence(renderedBuffer);
}

export function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for (i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < buffer.length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][pos])); 
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; 
      view.setInt16(44 + offset, sample, true); 
      offset += 2;
    }
    pos++;
  }

  return new Blob([bufferArr], { type: "audio/wav" });

  function setUint16(data: any) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: any) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

export async function generateBackgroundVideo(
  prompt: string,
  aspectRatio: VideoAspectRatio
): Promise<string> {
  // Create a new instance to ensure we use the latest API key if updated via UI
  const aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const ar = aspectRatio === VideoAspectRatio.Landscape ? '16:9' : '9:16';

  let operation = await aiClient.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: ar
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await aiClient.operations.getVideosOperation({operation: operation});
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) {
    throw new Error("Video generation failed. No URI returned.");
  }

  return `${videoUri}&key=${process.env.API_KEY}`;
}
