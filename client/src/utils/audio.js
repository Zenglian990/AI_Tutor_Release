/**
 * Downsamples an audio blob to 16kHz Mono and encodes it as a lightweight 16-bit PCM WAV.
 * This reduces upload size by up to 90% and optimizes it for Speech-to-Text API compatibility.
 * 
 * @param {Blob} audioBlob 
 * @returns {Promise<Blob>}
 */
export async function compressAudio(audioBlob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return audioBlob;

  const audioContext = new AudioContextClass();
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Create OfflineAudioContext at 16000Hz (16kHz Mono is the gold standard for speech recognition)
    const offlineCtx = new OfflineAudioContext(
      1, // Mono channel
      Math.ceil(audioBuffer.duration * 16000),
      16000 // 16kHz sample rate
    );
    
    // Set up source node
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    
    const renderedBuffer = await offlineCtx.startRendering();
    
    // Encode downsampled Buffer to standard 16-bit Mono PCM WAV
    return bufferToWav(renderedBuffer);
  } catch (err) {
    console.error('Audio compression failed, uploading original blob:', err);
    return audioBlob;
  } finally {
    try {
      await audioContext.close();
    } catch (e) {}
  }
}

function bufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // 1 = Uncompressed PCM
  const bitDepth = 16;
  
  let result;
  if (numOfChan === 1) {
    result = buffer.getChannelData(0);
  } else {
    // Fallback: merge/interleave channels if stereo (OfflineAudioContext forced mono, so usually unreachable)
    const chan0 = buffer.getChannelData(0);
    const chan1 = buffer.getChannelData(1);
    result = new Float32Array(chan0.length);
    for (let i = 0; i < chan0.length; i++) {
      result[i] = (chan0[i] + chan1[i]) / 2;
    }
  }
  
  const bufferLength = result.length * 2; // 16-bit = 2 bytes per sample
  const wavBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(wavBuffer);
  
  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + bufferLength, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numOfChan, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numOfChan * (bitDepth / 8), true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, bufferLength, true);
  
  // Write PCM audio data
  floatTo16BitPCM(view, 44, result);
  
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
