import { GoogleGenAI } from "@google/genai";
import { Tone, VoiceName, EmotionVector, PitchPoint } from "../types";
import { TONES } from "../constants";

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

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: promptText }] }],
      config: {
        responseModalities: ["AUDIO"] as any, // Using string literal to avoid Enum issues
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
  } catch (error: any) {
    console.error("Gemini TTS Error:", error);
    // Improve error message for 500s
    if (error.message && error.message.includes("500")) {
        throw new Error("Gemini Service Error (500). Please try again in a moment or simplify the text.");
    }
    throw error;
  }
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
  pitchPoints: PitchPoint[]
): Promise<AudioBuffer> {
  // Determine duration based on pitch automation
  // Lower pitch = Slower speed = Longer duration.
  
  let minPitch = 0;
  if (pitchPoints.length > 0) {
      minPitch = Math.min(...pitchPoints.map(p => p.y));
  }

  // Effective rate factor at the lowest pitch point
  const minRateFactor = Math.pow(2, minPitch / 12);
  const minEffectiveSpeed = speed * minRateFactor;

  // Calculate worst-case duration
  const estimatedMaxDuration = originalBuffer.duration / minEffectiveSpeed;
  
  // Add safety buffer (1.5 seconds)
  const renderLength = Math.ceil(estimatedMaxDuration * originalBuffer.sampleRate) + (originalBuffer.sampleRate * 1.5);
  
  const offlineCtx = new OfflineAudioContext(
    originalBuffer.numberOfChannels,
    renderLength,
    originalBuffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = originalBuffer;
  source.playbackRate.value = speed;
  
  // Apply Automation
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
  
  source.connect(offlineCtx.destination);
  source.start();
  
  const renderedBuffer = await offlineCtx.startRendering();
  
  // Trim the excess silence we allocated
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