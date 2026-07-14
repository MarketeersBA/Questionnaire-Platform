import os
import time
import logging
from typing import Optional, Dict, Any
from openai import OpenAI
from pydub import AudioSegment
from backend.config import settings
from backend.voice_feedback.models import TranscriptionResult, TranscriptionSegment
from backend.analytics_module.src.ai import api_cost

logger = logging.getLogger(__name__)

class VoiceTranscriber:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key)
        self.temp_dir = "tmp/audio"
        os.makedirs(self.temp_dir, exist_ok=True)

    def _preprocess_audio(self, input_path: str) -> str:
        """
        Normalize audio: convert to WAV, 16kHz, mono.
        This ensures consistent STT performance across diverse formats.
        """
        try:
            audio = AudioSegment.from_file(input_path)
            audio = audio.set_frame_rate(16000).set_channels(1)
            
            output_filename = f"normalized_{os.path.basename(input_path)}.wav"
            output_path = os.path.join(self.temp_dir, output_filename)
            audio.export(output_path, format="wav")
            return output_path
        except Exception as e:
            logger.error(f"Audio preprocessing failed: {e}")
            raise ValueError(f"Could not process audio file: {e}")

    async def transcribe(self, file_path: str) -> TranscriptionResult:
        """
        Transcribe audio using OpenAI Whisper API.
        Includes duration detection and cost tracking.
        """
        start_time = time.time()
        normalized_path = self._preprocess_audio(file_path)
        
        try:
            # Get duration
            audio = AudioSegment.from_file(normalized_path)
            duration_s = len(audio) / 1000.0

            with open(normalized_path, "rb") as audio_file:
                # Call Whisper API
                # Note: 'response_format="verbose_json"' provides segment-level detail
                response = self.client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="verbose_json"
                )

            duration_ms = (time.time() - start_time) * 1000
            
            # Record cost (Whisper API is approximately $0.006 per minute)
            # We use a custom call to api_cost to track this
            self._record_whisper_usage(duration_s, duration_ms)

            # Map response to our model
            segments = []
            if hasattr(response, 'segments'):
                for seg in response.segments:
                    segments.append(TranscriptionSegment(
                        start=seg.get('start', 0),
                        end=seg.get('end', 0),
                        text=seg.get('text', ""),
                        confidence=seg.get('avg_logprob', 0), # avg_logprob is a proxy for confidence
                        language=response.language if hasattr(response, 'language') else None
                    ))

            return TranscriptionResult(
                text=response.text,
                language=response.language if hasattr(response, 'language') else "unknown",
                confidence=1.0, # Whisper doesn't give a single confidence score, but segments have logprobs
                duration_s=duration_s,
                segments=segments
            )

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise
        finally:
            # Cleanup temp files
            if os.path.exists(normalized_path):
                try:
                    os.remove(normalized_path)
                except:
                    pass

    def _record_whisper_usage(self, audio_duration_s: float, duration_ms: float):
        """
        Integration with Questioner's existing cost tracking system.
        """
        try:
            # Approximate cost: $0.006/min = $0.0001/sec
            cost = audio_duration_s * 0.0001
            api_cost.add_custom_usage(
                component="whisper_stt",
                model="whisper-1",
                units=audio_duration_s,
                unit_name="seconds",
                cost_usd=cost,
                duration_ms=duration_ms
            )
        except Exception as e:
            logger.warning(f"Failed to record Whisper usage: {e}")

# Global instance
transcriber = VoiceTranscriber()
