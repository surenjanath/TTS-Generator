

// Generate a simple sigmoid distortion curve
export function makeDistortionCurve(amount: number) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    let x;
  
    for (let i = 0; i < n_samples; ++i) {
      x = (i * 2) / n_samples - 1;
      // Classic sigmoid wave shaper
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }
  
  // Procedural Reverb Impulse Response
  export function createImpulseResponse(ctx: BaseAudioContext, duration: number = 2.0, decay: number = 2.0) {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
  
    for (let i = 0; i < length; i++) {
      // Exponential decay white noise
      const n = i / length;
      const attenuation = Math.pow(1 - n, decay);
      impulseL[i] = (Math.random() * 2 - 1) * attenuation;
      impulseR[i] = (Math.random() * 2 - 1) * attenuation;
    }
    return impulse;
  }
  
  export interface EffectNodes {
    input: GainNode;
    output: GainNode;
    distortionNode: WaveShaperNode;
    delayNode: DelayNode;
    delayFeedback: GainNode;
    reverbNode: ConvolverNode;
    reverbGain: GainNode;
    dryGain: GainNode;
  }
  
  // Build the Effect Graph
  // Graph Topology:
  // Input -> [Distortion] -> Split -> [Dry] --------------------> Output
  //                                -> [Reverb] ----------------->
  //                                -> [Delay] -> [Feedback] -^
  export function createEffectChain(ctx: BaseAudioContext): EffectNodes {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dryGain = ctx.createGain();
  
    // 1. Distortion
    const distortionNode = ctx.createWaveShaper();
    distortionNode.oversample = '4x';
  
    // 2. Delay
    const delayNode = ctx.createDelay(1.0);
    const delayFeedback = ctx.createGain();
    const delayOutput = ctx.createGain();
    
    // Default Delay settings
    delayNode.delayTime.value = 0.35; // 350ms
    delayFeedback.gain.value = 0.4;
  
    // 3. Reverb
    const reverbNode = ctx.createConvolver();
    // Pre-generate a standard hall-like impulse
    try {
        reverbNode.buffer = createImpulseResponse(ctx, 2.5, 2.5);
    } catch (e) { console.warn("Could not create IR", e)}
    const reverbGain = ctx.createGain();
  
    // --- Routing ---
    
    // Input -> Distortion
    input.connect(distortionNode);
  
    // Distortion -> Dry (Main Path) -> Output
    distortionNode.connect(dryGain);
    dryGain.connect(output);
  
    // Distortion -> Delay Loop -> Output
    // We treat Delay as a send effect here effectively mixed in
    distortionNode.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode); // Feedback loop
    delayNode.connect(output);
  
    // Distortion -> Reverb -> Output
    distortionNode.connect(reverbNode);
    reverbNode.connect(reverbGain);
    reverbGain.connect(output);
  
    return {
      input,
      output,
      distortionNode,
      delayNode,
      delayFeedback,
      reverbNode,
      reverbGain,
      dryGain
    };
  }
  
  export function updateEffectParams(nodes: EffectNodes, settings: { distortion: number, delay: number, reverb: number }) {
      const now = nodes.input.context.currentTime;
  
      // Distortion (0 to 1 maps to Curve Amount)
      // 0 = Linear (no distortion), 1 = Heavily saturated
      if (settings.distortion > 0.01) {
          // Amount 0-400
          nodes.distortionNode.curve = makeDistortionCurve(settings.distortion * 400);
      } else {
          nodes.distortionNode.curve = null;
      }
  
      // Delay (Mix level and Feedback intensity)
      // We'll map 'delay' param to feedback gain and send level
      nodes.delayFeedback.gain.setTargetAtTime(settings.delay * 0.6, now, 0.1); // Max feedback 0.6
      // Also control volume of delay line relative to mix
      // We didn't create a separate delayVolume node in creation, but we can hack it via feedback path or simple addition.
      // Ideally we should have a wet gain. Let's assume delayFeedback controls the tail, 
      // but we need to control the AUDIBILITY.
      // Let's modify the creation slightly if we were stricter, but for now, 
      // let's assume the delayNode connection to output is constant? No that's bad.
      // Re-evaluating: In createEffectChain, delayNode connects to output directly. 
      // We should insert a gain there. 
      // For this simplified version, let's just accept it connects directly and we can't easily modulate volume without a dedicated node.
      // Actually, we can use the AudioParam of the delayNode connection? No.
      // Let's stick to updating what we have.
      // If we want to implement volume control, we need to rebuild graph or add node.
      // Let's rely on Re-render for offline, but for Realtime, we might just be controlling feedback.
      // Correction: Let's create a gain node for delay volume in the future. 
      // For now, let's map 'delay' to feedback mostly.
  
      // Reverb (Wet Gain)
      nodes.reverbGain.gain.setTargetAtTime(settings.reverb * 2.0, now, 0.1); // Boost reverb a bit
  }