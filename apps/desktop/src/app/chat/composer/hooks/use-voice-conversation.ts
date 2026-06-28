import { useCallback, useEffect, useRef, useState } from 'react'

import { useI18n } from '@/i18n'
import { clearPrefetchCache, playSpeechText, prefetchSpeechAudio, stopVoicePlayback } from '@/lib/voice-playback'
import { notify, notifyError } from '@/store/notifications'

import { useMicRecorder } from './use-mic-recorder'

export type ConversationStatus = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

// Barge-in: mic monitoring threshold during AI speech. Higher than the normal
// listening threshold (0.075) to avoid picking up TTS audio from speakers.
// Echo cancellation in getUserMedia helps, but a higher threshold adds safety.
const BARGE_IN_THRESHOLD = 0.15
const BARGE_IN_SILENCE_MS = 400

interface PendingVoiceResponse {
  id: string
  pending: boolean
  text: string
}

interface VoiceConversationOptions {
  busy: boolean
  enabled: boolean
  onFatalError?: () => void
  onSubmit: (text: string) => Promise<void> | void
  onTranscribeAudio?: (audio: Blob) => Promise<string>
  pendingResponse: () => PendingVoiceResponse | null
  consumePendingResponse: () => void
}

export function useVoiceConversation({
  busy,
  enabled,
  onFatalError,
  onSubmit,
  onTranscribeAudio,
  pendingResponse,
  consumePendingResponse
}: VoiceConversationOptions) {
  const { t } = useI18n()
  const voiceCopy = t.notifications.voice
  const { handle, level } = useMicRecorder(voiceCopy)
  const [status, setStatus] = useState<ConversationStatus>('idle')
  const [muted, setMuted] = useState(false)
  const turnTimeoutRef = useRef<number | null>(null)
  const pendingStartRef = useRef(false)
  const turnClosingRef = useRef(false)
  const awaitingSpokenResponseRef = useRef(false)
  const responseIdRef = useRef<string | null>(null)
  const spokenSourceLengthRef = useRef(0)
  const speechBufferRef = useRef('')
  const enabledRef = useRef(enabled)
  const mutedRef = useRef(muted)
  const busyRef = useRef(busy)
  const statusRef = useRef<ConversationStatus>('idle')
  const wasEnabledRef = useRef(enabled)
  // Barge-in: mic stream + analyser for detecting user speech during TTS playback
  const bargeInStreamRef = useRef<MediaStream | null>(null)
  const bargeInContextRef = useRef<AudioContext | null>(null)
  const bargeInAnimRef = useRef<number | null>(null)
  const bargeInTriggeredRef = useRef(false)

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const clearTurnTimeout = () => {
    if (turnTimeoutRef.current) {
      window.clearTimeout(turnTimeoutRef.current)
      turnTimeoutRef.current = null
    }
  }

  // ─── Barge-in: detect user speech during TTS playback ────────────────────
  const stopBargeInMonitor = useCallback(() => {
    if (bargeInAnimRef.current) {
      window.cancelAnimationFrame(bargeInAnimRef.current)
      bargeInAnimRef.current = null
    }

    void bargeInContextRef.current?.close()
    bargeInContextRef.current = null
    bargeInStreamRef.current?.getTracks().forEach(track => track.stop())
    bargeInStreamRef.current = null
    bargeInTriggeredRef.current = false
  }, [])

  const startBargeInMonitor = useCallback(async () => {
    if (bargeInStreamRef.current) {return} // already monitoring
    bargeInTriggeredRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })

      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

      if (!AudioContextCtor) {
        stream.getTracks().forEach(t => t.stop())

        return
      }

      const ctx = new AudioContextCtor()
      const analyser = ctx.createAnalyser()
      const source = ctx.createMediaStreamSource(stream)
      analyser.fftSize = 256
      source.connect(analyser)
      bargeInStreamRef.current = stream
      bargeInContextRef.current = ctx

      const data = new Uint8Array(analyser.fftSize)
      let speechStartedAt: number | null = null

      const tick = () => {
        if (bargeInTriggeredRef.current) {return}

        analyser.getByteTimeDomainData(data)
        let sum = 0

        for (const value of data) {
          const centered = value - 128
          sum += centered * centered
        }

        const rms = Math.sqrt(sum / data.length)
        const normalized = Math.min(1, rms / 42)
        const now = Date.now()

        if (normalized >= BARGE_IN_THRESHOLD) {
          speechStartedAt = now
        } else if (speechStartedAt !== null && now - speechStartedAt >= BARGE_IN_SILENCE_MS) {
          // User spoke — interrupt TTS
          bargeInTriggeredRef.current = true
          stopBargeInMonitor()
          stopVoicePlayback()
          // Cancel any pending response and restart listening
          awaitingSpokenResponseRef.current = false
          resetSpeechBuffer()
          consumePendingResponse()
          pendingStartRef.current = true
          setStatus('idle')

          return
        }

        bargeInAnimRef.current = window.requestAnimationFrame(tick)
      }

      tick()
    } catch {
      // Mic access failed during barge-in — silently skip, TTS continues normally
    }
  }, [consumePendingResponse, stopBargeInMonitor])

  const resetSpeechBuffer = () => {
    responseIdRef.current = null
    spokenSourceLengthRef.current = 0
    speechBufferRef.current = ''
  }

  const appendSpeechText = (text: string) => {
    if (!text) {
      return
    }

    speechBufferRef.current = `${speechBufferRef.current}${text}`
  }

  const takeSpeechChunk = (force = false): string | null => {
    const buffer = speechBufferRef.current.replace(/\s+/g, ' ').trim()

    if (!buffer) {
      speechBufferRef.current = ''

      return null
    }

    const sentence = buffer.match(/^(.+?[.!?。！？])(?:\s+|$)/)

    if (sentence?.[1] && (sentence[1].length >= 4 || force)) {
      const chunk = sentence[1].trim()
      speechBufferRef.current = buffer.slice(sentence[1].length).trim()

      return chunk
    }

    if (!force && buffer.length > 160) {
      const softBoundary = Math.max(
        buffer.lastIndexOf(', ', 120),
        buffer.lastIndexOf('; ', 120),
        buffer.lastIndexOf(': ', 120)
      )

      if (softBoundary > 40) {
        const chunk = buffer.slice(0, softBoundary + 1).trim()
        speechBufferRef.current = buffer.slice(softBoundary + 1).trim()

        return chunk
      }
    }

    if (!force) {
      return null
    }

    speechBufferRef.current = ''

    return buffer
  }

  const handleTurn = useCallback(
    async (forceTranscribe = false) => {
      if (turnClosingRef.current) {
        return
      }

      turnClosingRef.current = true
      clearTurnTimeout()
      setStatus('transcribing')

      const turnStart = performance.now()

      try {
        const result = await handle.stop()

        if (!result || (!result.heardSpeech && !forceTranscribe) || !onTranscribeAudio) {
          if (enabledRef.current && !mutedRef.current && !busyRef.current && statusRef.current !== 'speaking') {
            pendingStartRef.current = true
          }

          setStatus('idle')

          return
        }

        try {
          const transcribeStart = performance.now()
          const transcript = (await onTranscribeAudio(result.audio)).trim()
          const transcribeMs = Math.round(performance.now() - transcribeStart)

          if (transcript) {
            console.debug(`[voice] STT: ${transcribeMs}ms (${transcript.length} chars)`)
          }

          if (!transcript) {
            if (enabledRef.current) {
              pendingStartRef.current = true
            }

            setStatus('idle')

            return
          }

          awaitingSpokenResponseRef.current = true
          resetSpeechBuffer()
          await onSubmit(transcript)
          setStatus('thinking')
          console.debug(`[voice] turn total: ${Math.round(performance.now() - turnStart)}ms`)
        } catch (error) {
          notifyError(error, voiceCopy.transcriptionFailed)

          if (enabledRef.current && !mutedRef.current && !busyRef.current) {
            pendingStartRef.current = true
          }

          setStatus('idle')
        }
      } finally {
        turnClosingRef.current = false
      }
    },
    [handle, onSubmit, onTranscribeAudio, voiceCopy.transcriptionFailed]
  )

  const startListening = useCallback(async () => {
    pendingStartRef.current = false

    if (!enabledRef.current || mutedRef.current || busyRef.current) {
      return
    }

    if (statusRef.current !== 'idle') {
      return
    }

    try {
      // VAD tuning mirrors `tools.voice_mode` defaults so the browser loop matches the CLI.
      await handle.start({
        silenceLevel: 0.075,
        silenceMs: 1_250,
        idleSilenceMs: 12_000,
        onError: error => {
          notifyError(error, voiceCopy.microphoneFailed)
          pendingStartRef.current = false
          onFatalError?.()
        },
        onSilence: () => void handleTurn()
      })
      setStatus('listening')
      turnTimeoutRef.current = window.setTimeout(() => void handleTurn(), 60_000)
    } catch (error) {
      notifyError(error, voiceCopy.couldNotStartSession)
      pendingStartRef.current = false
      setStatus('idle')
      onFatalError?.()
    }
  }, [handle, handleTurn, onFatalError, voiceCopy.couldNotStartSession, voiceCopy.microphoneFailed])

  const speak = useCallback(
    async (text: string) => {
      setStatus('speaking')
      // Start barge-in monitor so user can interrupt TTS by speaking
      void startBargeInMonitor()

      const ttsStart = performance.now()

      try {
        await playSpeechText(text, { source: 'voice-conversation' })
        console.debug(`[voice] TTS: ${Math.round(performance.now() - ttsStart)}ms (${text.length} chars)`)
      } catch (error) {
        notifyError(error, voiceCopy.playbackFailed)
      } finally {
        stopBargeInMonitor()

        if (enabledRef.current) {
          pendingStartRef.current = true
          setStatus('idle')
        } else {
          setStatus('idle')
        }
      }
    },
    [startBargeInMonitor, stopBargeInMonitor, voiceCopy.playbackFailed]
  )

  const start = useCallback(async () => {
    if (!onTranscribeAudio) {
      notify({
        kind: 'warning',
        title: voiceCopy.unavailable,
        message: voiceCopy.configureSpeechToText
      })
      onFatalError?.()

      return
    }

    setMuted(false)
    awaitingSpokenResponseRef.current = false
    resetSpeechBuffer()
    consumePendingResponse()
    pendingStartRef.current = true
    await startListening()
  }, [
    consumePendingResponse,
    onFatalError,
    onTranscribeAudio,
    startListening,
    voiceCopy.configureSpeechToText,
    voiceCopy.unavailable
  ])

  const end = useCallback(async () => {
    pendingStartRef.current = false
    clearTurnTimeout()
    stopBargeInMonitor()
    stopVoicePlayback()
    clearPrefetchCache()
    handle.cancel()
    turnClosingRef.current = false
    awaitingSpokenResponseRef.current = false
    resetSpeechBuffer()
    consumePendingResponse()
    setMuted(false)
    setStatus('idle')
  }, [consumePendingResponse, handle, stopBargeInMonitor])

  const stopTurn = useCallback(() => {
    if (statusRef.current === 'listening') {
      void handleTurn(true)
    }
  }, [handleTurn])

  const toggleMute = useCallback(() => {
    setMuted(value => {
      const next = !value

      if (next) {
        clearTurnTimeout()
        handle.cancel()
        setStatus('idle')
      } else if (enabledRef.current && !busyRef.current && statusRef.current === 'idle') {
        pendingStartRef.current = true
      }

      return next
    })
  }, [handle])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      // Space interrupts TTS playback (barge-in via keyboard)
      if (statusRef.current === 'speaking') {
        event.preventDefault()
        stopBargeInMonitor()
        stopVoicePlayback()
        awaitingSpokenResponseRef.current = false
        resetSpeechBuffer()
        consumePendingResponse()
        pendingStartRef.current = true
        setStatus('idle')

        return
      }

      if (statusRef.current !== 'listening') {
        return
      }

      event.preventDefault()
      stopTurn()
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })

    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [enabled, stopTurn])

  // Drive the loop: after a voice-submitted turn, speak stable chunks as the
  // assistant stream grows. Otherwise start listening when idle between turns.
  useEffect(() => {
    if (!enabled || muted) {
      return
    }

    if (awaitingSpokenResponseRef.current && status !== 'speaking') {
      const response = pendingResponse()

      if (response) {
        if (response.id !== responseIdRef.current) {
          resetSpeechBuffer()
          responseIdRef.current = response.id
        }

        if (response.text.length > spokenSourceLengthRef.current) {
          appendSpeechText(response.text.slice(spokenSourceLengthRef.current))
          spokenSourceLengthRef.current = response.text.length
        }

        const chunk = takeSpeechChunk(!response.pending && !busy)

        if (chunk) {
          void speak(chunk)

          // Pre-fetch TTS for the next chunk while current one plays (pipelining).
          // Save/restore the buffer so the peek doesn't consume the chunk.
          const savedBuffer = speechBufferRef.current
          const nextChunk = takeSpeechChunk(false)

          if (nextChunk) {
            void prefetchSpeechAudio(nextChunk).catch(() => {})
          }

          speechBufferRef.current = savedBuffer

          return
        }

        if (!response.pending && !busy) {
          awaitingSpokenResponseRef.current = false
          consumePendingResponse()
          resetSpeechBuffer()
          pendingStartRef.current = true
          setStatus('idle')

          return
        }
      }

      if (!busy && status === 'thinking') {
        awaitingSpokenResponseRef.current = false
        resetSpeechBuffer()
        pendingStartRef.current = true
        setStatus('idle')

        return
      }
    }

    if (busy || status !== 'idle') {
      return
    }

    if (pendingStartRef.current) {
      void startListening()
    }
  }, [busy, consumePendingResponse, enabled, muted, pendingResponse, speak, startListening, status])

  useEffect(() => {
    if (enabled && !wasEnabledRef.current) {
      void start()
    }

    if (!enabled && wasEnabledRef.current) {
      void end()
    }

    wasEnabledRef.current = enabled
  }, [enabled, end, start])

  // Cleanup barge-in monitor on unmount
  useEffect(() => {
    return () => stopBargeInMonitor()
  }, [stopBargeInMonitor])

  return { end, level, muted, start, status, stopTurn, toggleMute }
}
