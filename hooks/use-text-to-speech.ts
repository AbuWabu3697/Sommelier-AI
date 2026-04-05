'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface UseTextToSpeechReturn {
  speak: (text: string) => void
  stop: () => void
  isSpeaking: boolean
  isSupported: boolean
}

export function useTextToSpeech(): UseTextToSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const pickPreferredVoice = useCallback((voices: SpeechSynthesisVoice[]) => {
    const preferredNames = [
      'Daniel',
      'Alex',
      'Google UK English Male',
      'Microsoft David',
      'Microsoft Guy',
      'Aaron',
      'Google US English',
      'Samantha',
      'Microsoft Zira',
    ]

    for (const preferredName of preferredNames) {
      const match = voices.find((voice) =>
        voice.lang.startsWith('en') && voice.name.includes(preferredName),
      )
      if (match) return match
    }

    const premiumStyleMatch = voices.find((voice) =>
      voice.lang.startsWith('en') &&
      /natural|enhanced|neural|premium/i.test(voice.name),
    )
    if (premiumStyleMatch) return premiumStyleMatch

    return voices.find((voice) => voice.lang.startsWith('en')) ?? null
  }, [])

  useEffect(() => {
    setIsSupported('speechSynthesis' in window)
  }, [])

  const sanitizeForSpeech = useCallback((text: string) => {
    return text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\bABV\b/gi, 'alcohol by volume')
      .replace(/\bavg\b/gi, 'average')
      .replace(/\bvs\b/gi, 'versus')
      .replace(/\$/g, '')
      .replace(/\/100\b/g, ' out of 100')
      .replace(/\s*&\s*/g, ' and ')
      .replace(/\b([A-Z]{2,})\b/g, (match) => {
        return match.length <= 3 ? match.split('').join(' ') : match.toLowerCase()
      })
      .replace(/\s+/g, ' ')
      .trim()
  }, [])

  const speak = useCallback((text: string) => {
    if (!isSupported || !text) return

    // Stop any current speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(sanitizeForSpeech(text))
    utterance.rate = 0.88
    utterance.pitch = 0.9
    utterance.volume = 1
    utterance.lang = 'en-US'

    const voices = window.speechSynthesis.getVoices()
    const preferredVoice = pickPreferredVoice(voices)
    
    if (preferredVoice) {
      utterance.voice = preferredVoice
    }

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [isSupported, pickPreferredVoice, sanitizeForSpeech])

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }, [isSupported])

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
  }
}
