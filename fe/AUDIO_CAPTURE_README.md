# Audio Capture Implementation

This document describes the audio capture feature implementation for capturing microphone and system audio (e.g., from Google Meet/Zoom calls) and preparing it for Eleven Labs integration.

## Features Implemented

### 1. Audio Capture Service ([audioCapture.ts](src/renderer/src/services/audioCapture.ts))

A comprehensive service that captures audio from two sources:

- **Microphone Audio**: Direct microphone input
- **System Audio**: Audio from applications (requires screen/tab sharing with audio)

#### Key Features:
- Captures at 16kHz sample rate (configurable)
- Converts audio to 16-bit PCM format (little-endian)
- Mono channel output
- Real-time audio processing using Web Audio API

#### Audio Format:
The audio is captured in the format recommended by Eleven Labs:
- **Format**: `pcm_16000` (16-bit PCM, little-endian)
- **Sample Rate**: 16kHz
- **Channels**: Mono (1 channel)

### 2. UI Integration ([App.tsx](src/renderer/src/App.tsx))

- **Toggle Button**: Circular button in the bottom-right corner of the card
  - Blue microphone icon (🎤) when not listening
  - Red pause icon (⏸) when actively listening
  - Pulsing animation when active

- **Audio Debug Display**: Shows real-time audio levels and sample counts
  - Displays microphone audio level as percentage
  - Displays system audio level as percentage
  - Shows sample count for debugging

### 3. Eleven Labs Integration Helper ([elevenLabsIntegration.ts](src/renderer/src/services/elevenLabsIntegration.ts))

Utility functions for integrating with Eleven Labs:
- `pcmToBase64()`: Converts PCM data to base64 for transmission
- `sendToElevenLabs()`: Placeholder for sending audio to Eleven Labs API
- `AudioBuffer`: Helper class for batching audio chunks

## How to Use

### Starting Audio Capture

1. Click the microphone button (🎤) in the bottom-right corner of the assistant card
2. Grant microphone permissions when prompted
3. For system audio capture, you'll be prompted to share your screen/tab
   - **Important**: Make sure to check "Share audio" in the dialog
   - Select the tab with your Google Meet/Zoom call
4. Audio capture will start, and the button will turn red with a pulsing animation

### Stopping Audio Capture

Click the button again (now showing ⏸) to stop capturing audio.

### Viewing Audio Levels

When listening is active, you'll see real-time audio information displayed in the card:
- Mic audio level (0-100%)
- System audio level (0-100%)
- Sample counts for debugging

## System Audio Capture Notes

### How It Works

System audio capture uses the `getDisplayMedia` API, which allows capturing audio from:
- Browser tabs (e.g., Google Meet tab)
- Application windows
- Entire screen

### Limitations

1. **User Permission Required**: Users must explicitly grant permission and select what to share
2. **Chrome/Edge Only**: Full system audio capture works best in Chromium-based browsers
3. **Audio Checkbox**: Users must remember to check "Share audio" in the sharing dialog

### For Video Conferencing (Google Meet, Zoom, etc.)

To capture audio from a video call:
1. Click the audio capture button
2. In the screen sharing dialog, select the tab with your video call
3. **Important**: Check the "Share audio" checkbox
4. Click "Share"

The system will now capture both:
- Your microphone input
- The other person's voice from the call

## Integration with Eleven Labs

The audio data is ready to be sent to Eleven Labs. To complete the integration:

### 1. Add Eleven Labs API Key

Store your API key securely (e.g., in environment variables or secure storage).

### 2. Implement WebSocket/HTTP Connection

In [App.tsx](src/renderer/src/App.tsx), locate the `handleAudioData` function and add:

```typescript
import { sendToElevenLabs } from './services/elevenLabsIntegration'

const handleAudioData = async (data: AudioData, source: 'mic' | 'system'): Promise<void> => {
  // ... existing code ...

  // Send to Eleven Labs
  await sendToElevenLabs(data.buffer, source, {
    apiKey: 'your-api-key-here',
    voiceId: 'your-voice-id',
    modelId: 'eleven_monolingual_v1'
  })
}
```

### 3. Implement the WebSocket Connection

Update [elevenLabsIntegration.ts](src/renderer/src/services/elevenLabsIntegration.ts) with actual Eleven Labs WebSocket/HTTP implementation.

Example WebSocket approach:
```typescript
const ws = new WebSocket('wss://api.elevenlabs.io/v1/convai/conversation?agent_id=YOUR_AGENT_ID')

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'audio',
    audio: pcmToBase64(pcmData),
    format: 'pcm_16000'
  }))
}

ws.onmessage = (event) => {
  const response = JSON.parse(event.data)
  // Handle AI response audio
}
```

## Technical Details

### Audio Processing Flow

1. **Capture**: Browser captures raw audio via `getUserMedia` (mic) and `getDisplayMedia` (system)
2. **Context**: Audio is processed through `AudioContext` at 16kHz sample rate
3. **Processing**: `ScriptProcessorNode` processes audio in 4096-sample chunks
4. **Conversion**: Float32 audio is converted to Int16 (16-bit PCM)
5. **Callback**: Processed audio is sent to `handleAudioData` callback
6. **Transmission**: Audio can be sent to Eleven Labs (ready to implement)

### Audio Format Specifications

| Property | Value | Notes |
|----------|-------|-------|
| Sample Rate | 16,000 Hz | Matches Eleven Labs `pcm_16000` |
| Bit Depth | 16-bit | Signed integer |
| Channels | 1 (Mono) | Single channel |
| Encoding | PCM | Little-endian |
| Chunk Size | 4096 samples | ~256ms at 16kHz |

### Browser Compatibility

- **Chrome/Edge**: Full support for both mic and system audio
- **Firefox**: Mic support only (limited system audio support)
- **Safari**: Mic support, limited screen sharing capabilities

## Testing

1. Run the app: `npm run dev`
2. Click the microphone button
3. Grant permissions
4. Check the console for audio data logs
5. Verify audio levels are displayed in the UI
6. Open DevTools to see detailed logs with sample counts and levels

## Future Improvements

- [ ] Add audio buffering to reduce API calls
- [ ] Implement voice activity detection (VAD) to send only speech segments
- [ ] Add audio visualization (waveform/bars)
- [ ] Implement proper error handling and retry logic
- [ ] Add audio quality indicators
- [ ] Support recording and playback for debugging

## Troubleshooting

### No Microphone Permission
- Check browser settings for microphone permissions
- Ensure the app is running over HTTPS or localhost

### No System Audio Captured
- Verify "Share audio" checkbox was selected
- Try selecting a different tab or window
- Check browser console for errors

### Audio Levels Always Zero
- Check if audio source is actually producing sound
- Verify AudioContext is running (check console logs)
- Test with a simple audio file or speech

## Files Modified/Created

- ✅ [src/renderer/src/services/audioCapture.ts](src/renderer/src/services/audioCapture.ts) - Audio capture service
- ✅ [src/renderer/src/services/elevenLabsIntegration.ts](src/renderer/src/services/elevenLabsIntegration.ts) - Eleven Labs integration helpers
- ✅ [src/renderer/src/App.tsx](src/renderer/src/App.tsx) - UI integration
- ✅ [src/renderer/src/assets/main.css](src/renderer/src/assets/main.css) - Styling for button and debug display
