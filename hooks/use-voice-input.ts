'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface UseVoiceInputReturn {
  transcript: string
  isListening: boolean
  isSupported: boolean
  startListening: () => void
  stopListening: () => void
  resetTranscript: () => void
  error: string | null
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef('')

  const createRecognition = useCallback(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition ||
      (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      return null
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onerror = (event) => {
      setIsListening(false)
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access to use voice input.')
      } else if (event.error === 'no-speech') {
        setError('No speech detected. Please try again.')
      } else {
        setError(`Speech recognition error: ${event.error}`)
      }
    }

    recognition.onresult = (event) => {
      let nextTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        nextTranscript += event.results[i][0].transcript
      }
      transcriptRef.current = nextTranscript.trim()
      setTranscript(transcriptRef.current)
    }

    return recognition
  }, [])

  useEffect(() => {
    const recognition = createRecognition()
    if (recognition) {
      setIsSupported(true)
      recognitionRef.current = recognition
    } else {
      setIsSupported(false)
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [createRecognition])

  const startListening = useCallback(() => {
    if (!isListening) {
      transcriptRef.current = ''
      setTranscript('')
      setError(null)

      if (!recognitionRef.current) {
        recognitionRef.current = createRecognition()
      }

      try {
        recognitionRef.current.start()
      } catch (e) {
        console.error('[v0] Error starting recognition:', e)
        // Recreate the recognizer and retry once. Some browsers leave the instance in a bad state.
        try {
          recognitionRef.current?.abort()
        } catch {}
        recognitionRef.current = createRecognition()
        try {
          recognitionRef.current?.start()
        } catch (retryError) {
          console.error('[v0] Error restarting recognition:', retryError)
          setError('Microphone could not be started. Please try again or refresh the page.')
        }
      }
    }
  }, [isListening, createRecognition])

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
  }, [isListening])

  const resetTranscript = useCallback(() => {
    transcriptRef.current = ''
    setTranscript('')
    setError(null)
  }, [])

  return {
    transcript,
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    error,
  }
}
