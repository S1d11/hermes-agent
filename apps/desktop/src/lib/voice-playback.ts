import { speakText } from '@/hermes'
import {
  $voicePlayback,
  setVoicePlaybackState,
  type VoicePlaybackSource,
  type VoicePlaybackState
} from '@/store/voice-playback'

import { sanitizeTextForSpeech } from './speech-text'

// Free Edge TTS occasionally hands back audio that never fires `playing`/`ended`
// nor `error` — leaving voice mode stuck "speaking" forever. Reject if playback
// fails to start or stalls mid-stream for this long (rearmed on each progress
// tick, so legitimately long speech is never cut off).
const PLAYBACK_STALL_MS = 15_000

let currentAudio: HTMLAudioElement | null = null
let currentStop: (() => void) | null = null
let sequence = 0

function currentState(
  status: VoicePlaybackState['status'],
  options?: VoicePlaybackOptions,
  audioElement: HTMLAudioElement | null = null
): VoicePlaybackState {
  return {
    audioElement,
    messageId: options?.messageId ?? null,
    sequence,
    source: options?.source ?? null,
    status
  }
}

export interface VoicePlaybackOptions {
  messageId?: string | null
  source: VoicePlaybackSource
}

export function stopVoicePlayback() {
  sequence += 1
  currentStop?.()
  currentStop = null

  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio.load()
    currentAudio = null
  }

  setVoicePlaybackState({
    audioElement: null,
    messageId: null,
    sequence,
    source: null,
    status: 'idle'
  })
}

export async function playSpeechText(text: string, options: VoicePlaybackOptions): Promise<boolean> {
  stopVoicePlayback()

  const speakableText = sanitizeTextForSpeech(text)

  if (!speakableText) {
    return false
  }

  const ownSequence = sequence
  const isCurrent = () => ownSequence === sequence

  setVoicePlaybackState(currentState('preparing', options))

  try {
    // Check for pre-fetched audio first (TTS pipelining)
    const prefetchedPromise = consumePrefetchedAudio(text)
    let dataUrl: string

    if (prefetchedPromise) {
      dataUrl = await prefetchedPromise
    } else {
      const response = await speakText(speakableText)
      dataUrl = response.data_url
    }

    if (!isCurrent()) {
      return false
    }

    const audio = new Audio(dataUrl)
    currentAudio = audio
    setVoicePlaybackState(currentState('speaking', options, audio))

    await new Promise<void>((resolve, reject) => {
      let stall: number | null = null

      const cleanup = () => {
        if (stall !== null) {
          window.clearTimeout(stall)
          stall = null
        }

        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
        audio.removeEventListener('timeupdate', armStall)
        currentStop = null
      }

      const armStall = () => {
        if (stall !== null) {
          window.clearTimeout(stall)
        }

        stall = window.setTimeout(() => {
          cleanup()
          reject(new Error('Playback stalled'))
        }, PLAYBACK_STALL_MS)
      }

      const onEnded = () => {
        cleanup()
        resolve()
      }

      const onError = () => {
        cleanup()
        reject(new Error('Playback failed'))
      }

      currentStop = () => {
        cleanup()
        resolve()
      }

      audio.addEventListener('ended', onEnded, { once: true })
      audio.addEventListener('error', onError, { once: true })
      audio.addEventListener('timeupdate', armStall)
      armStall()
      void audio.play().catch(onError)
    })

    if (!isCurrent()) {
      return false
    }

    currentAudio = null
    setVoicePlaybackState(currentState('idle'))

    return true
  } catch (error) {
    if (isCurrent()) {
      currentStop = null
      currentAudio = null
      setVoicePlaybackState(currentState('idle'))
    }

    throw error
  }
}

export function isVoicePlaybackActive() {
  return $voicePlayback.get().status !== 'idle'
}

// ─── TTS Pre-fetch for pipelining ──────────────────────────────────────────
// Pre-generate TTS audio without playing it, so the next sentence is ready
// before the current one finishes. Eliminates the gap between sentences.

const prefetchCache = new Map<string, Promise<string>>()
const PREFETCH_CACHE_MAX = 5

export async function prefetchSpeechAudio(text: string): Promise<string> {
  const speakableText = sanitizeTextForSpeech(text)

  if (!speakableText) {
    return ''
  }

  const key = speakableText

  // Return existing promise if already pre-fetching
  const existing = prefetchCache.get(key)

  if (existing) {
    return existing
  }

  // Evict oldest entries if cache is full
  if (prefetchCache.size >= PREFETCH_CACHE_MAX) {
    const firstKey = prefetchCache.keys().next().value

    if (firstKey) {
      prefetchCache.delete(firstKey)
    }
  }

  const promise = speakText(speakableText).then(response => response.data_url)

  prefetchCache.set(key, promise)

  return promise
}

export function consumePrefetchedAudio(text: string): Promise<string> | null {
  const speakableText = sanitizeTextForSpeech(text)

  if (!speakableText) {
    return null
  }

  const promise = prefetchCache.get(speakableText)

  if (promise) {
    prefetchCache.delete(speakableText)

    return promise
  }

  return null
}

export function clearPrefetchCache() {
  prefetchCache.clear()
}
