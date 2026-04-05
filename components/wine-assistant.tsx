'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useVoiceInput } from '@/hooks/use-voice-input'
import { useTextToSpeech } from '@/hooks/use-text-to-speech'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Mic,
  Volume2,
  VolumeX,
  Loader2,
  Wine,
  Send,
  Star,
  DollarSign,
  ChevronRight,
  MapPin,
  Scale,
  X,
} from 'lucide-react'

interface ScoreVisual {
  label: string
  value: string
  percent: number
}

interface NearMiss {
  name: string
  reason: string
}

interface RecommendationCard {
  id: string
  name: string
  producer: string
  varietal: string
  type: string
  region: string
  country: string
  appellation: string
  vintage: string
  imageUrl: string
  referenceUrl: string
  priceText: string
  ratingText: string
  summary: string
  whyChosen: string[]
  scoreBreakdown: Array<{
    label: string
    value: string
  }>
  scoreVisuals: ScoreVisual[]
  whyNotThese: NearMiss[]
}

interface ConversationItem {
  type: 'question' | 'answer'
  text: string
  spokenText?: string
  recommendations?: RecommendationCard[]
}

function ScoreBars({ visuals }: { visuals: ScoreVisual[] }) {
  return (
    <div className="space-y-3">
      {visuals.map((visual) => (
        <div key={visual.label} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{visual.label}</span>
            <span>{visual.value}</span>
          </div>
          <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-primary),var(--color-accent))]"
              style={{ width: `${visual.percent}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ScoreLegend() {
  return (
    <div className="rounded-2xl bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
      <p><span className="font-medium text-foreground">Critic</span> reflects normalized professional rating support on a 100-point scale.</p>
      <p><span className="font-medium text-foreground">Value</span> balances critic strength against price so stronger bottles at friendlier prices score higher.</p>
      <p><span className="font-medium text-foreground">Giftability</span> rewards critic support, present-worthy pricing, and prestige cues that make a bottle feel more special.</p>
    </div>
  )
}

export function WineAssistant() {
  const [isLoading, setIsLoading] = useState(false)
  const [conversation, setConversation] = useState<ConversationItem[]>([])
  const [textInput, setTextInput] = useState('')
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [selectedRecommendation, setSelectedRecommendation] = useState<RecommendationCard | null>(null)
  const [comparisonSelection, setComparisonSelection] = useState<RecommendationCard[]>([])
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const conversationEndRef = useRef<HTMLDivElement | null>(null)

  const {
    transcript,
    isListening,
    isSupported: voiceSupported,
    startListening,
    stopListening,
    resetTranscript,
    error: voiceError,
  } = useVoiceInput()

  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    isSupported: ttsSupported,
  } = useTextToSpeech()

  useEffect(() => {
    if (!isListening && transcript && !isLoading) {
      setPendingQuestion(transcript)
      resetTranscript()
    }
  }, [isListening, transcript, isLoading, resetTranscript])

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [conversation, isLoading])

  const handleQuestion = useCallback(async (question: string, displayText?: string) => {
    if (!question.trim()) return

    setIsLoading(true)
    const history = conversation.slice(-8).map((item) => ({
      role: item.type === 'question' ? 'user' as const : 'assistant' as const,
      text: item.text,
    }))

    setConversation((prev) => [...prev, { type: 'question', text: displayText || question }])

    try {
      const response = await fetch('/api/wine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Request failed')
      }

      const answer = data.answer || data.error || "I'm sorry, I couldn't process that question."
      const spokenText = data.spokenSummary || answer
      const recommendations = Array.isArray(data.recommendations) ? data.recommendations : []

      setConversation((prev) => [
        ...prev,
        {
          type: 'answer',
          text: answer,
          spokenText,
          recommendations,
        },
      ])

      if (autoSpeak && ttsSupported) {
        speak(spokenText)
      }
    } catch (error) {
      console.error('[v0] Error fetching answer:', error)
      const errorMessage = error instanceof Error
        ? error.message
        : "I'm sorry, there was an error processing your question. Please try again."
      setConversation((prev) => [...prev, { type: 'answer', text: errorMessage, spokenText: errorMessage }])
    } finally {
      setIsLoading(false)
    }
  }, [autoSpeak, ttsSupported, speak, conversation])

  useEffect(() => {
    if (pendingQuestion && !isLoading) {
      handleQuestion(pendingQuestion)
      setPendingQuestion(null)
    }
  }, [pendingQuestion, isLoading, handleQuestion])

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (textInput.trim() && !isLoading) {
      handleQuestion(textInput)
      setTextInput('')
    }
  }

  const toggleListening = () => {
    if (isListening) {
      stopListening()
    } else {
      if (isSpeaking) stopSpeaking()
      startListening()
    }
  }

  const toggleSpeaking = () => {
    if (isSpeaking) {
      stopSpeaking()
    }
    setAutoSpeak(!autoSpeak)
  }

  const speakLastAnswer = () => {
    const lastAnswer = [...conversation].reverse().find((item) => item.type === 'answer')
    if (lastAnswer && ttsSupported) {
      speak(lastAnswer.spokenText || lastAnswer.text)
    }
  }

  const toggleCompareSelection = (wine: RecommendationCard) => {
    setComparisonSelection((prev) => {
      const exists = prev.some((item) => item.id === wine.id)
      if (exists) return prev.filter((item) => item.id !== wine.id)
      if (prev.length === 2) return [prev[1], wine]
      return [...prev, wine]
    })
  }

  const emptyState = conversation.length === 0
  const [leftWine, rightWine] = comparisonSelection

  return (
    <>
      <div className="w-full max-w-6xl mx-auto flex h-full min-h-0 flex-col text-foreground pb-1">
        <div className="flex items-center justify-between pb-2">
          <div>
            <p className="text-sm font-medium tracking-wide">Sommelier AI</p>
            <p className="text-xs text-muted-foreground">Grounded wine recommendations with explainable reasoning</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggleSpeaking} className="gap-2 text-muted-foreground">
              {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {autoSpeak ? 'Voice on' : 'Voice off'}
            </Button>
            {conversation.some((item) => item.type === 'answer') && ttsSupported && (
              <Button variant="ghost" size="sm" onClick={isSpeaking ? stopSpeaking : speakLastAnswer} className="gap-2 text-muted-foreground">
                {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {isSpeaking ? 'Stop' : 'Replay'}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
              {emptyState ? (
                <div className="flex h-full flex-col items-center justify-center">
                  <div className="mb-8 text-center">
                    <p className="text-4xl font-serif text-foreground sm:text-5xl">Where should we begin?</p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Ask for the best bottle, a gift-worthy option, or a side-by-side comparison-worthy recommendation.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      'Best-rated wines under $50',
                      'Show me a great housewarming gift',
                      'What do you have from Burgundy?',
                    ].map((example) => (
                      <button
                        key={example}
                        onClick={() => setTextInput(example)}
                        className="rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-5xl flex-col gap-6">
                  {conversation.map((item, index) => (
                    <div key={index} className={`flex ${item.type === 'question' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`w-full ${item.type === 'question' ? 'max-w-xl' : 'max-w-5xl'}`}>
                        <div className={`rounded-3xl border px-5 py-4 ${
                          item.type === 'question'
                            ? 'ml-auto border-primary/20 bg-primary/8'
                            : 'border-border/70 bg-background/80'
                        }`}>
                          <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                            {item.type === 'question' ? 'You' : 'Sommelier'}
                          </p>
                          <div className={`text-sm ${item.type === 'answer' ? 'whitespace-pre-wrap leading-7' : 'leading-6'}`}>
                            {item.text}
                          </div>
                        </div>

                        {item.type === 'answer' && item.recommendations && item.recommendations.length > 0 && (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {item.recommendations.map((recommendation) => {
                              const isSelectedForCompare = comparisonSelection.some((wine) => wine.id === recommendation.id)

                              return (
                                <div
                                  key={recommendation.id}
                                  className={`overflow-hidden rounded-3xl border bg-background/85 transition ${
                                    isSelectedForCompare ? 'border-primary/50 shadow-lg' : 'border-border/70 hover:border-primary/30 hover:shadow-lg'
                                  }`}
                                >
                                  {recommendation.imageUrl && (
                                    <div className="relative h-40 bg-muted/20">
                                      <Image
                                        src={recommendation.imageUrl}
                                        alt={recommendation.name}
                                        fill
                                        className="object-contain p-3"
                                        sizes="(max-width: 640px) 100vw, 33vw"
                                      />
                                    </div>
                                  )}
                                  <div className="space-y-3 p-4">
                                    <div className="flex flex-wrap gap-2">
                                      {recommendation.type && <Badge variant="outline">{recommendation.type}</Badge>}
                                      {recommendation.varietal && <Badge variant="secondary">{recommendation.varietal}</Badge>}
                                    </div>
                                    <div>
                                      <p className="font-semibold leading-tight">{recommendation.name}</p>
                                      {recommendation.producer && (
                                        <p className="mt-1 text-sm text-muted-foreground">{recommendation.producer}</p>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                      <Badge variant="secondary" className="gap-1">
                                        <DollarSign className="h-3 w-3" />
                                        {recommendation.priceText}
                                      </Badge>
                                      <Badge variant="secondary" className="gap-1">
                                        <Star className="h-3 w-3" />
                                        {recommendation.ratingText}
                                      </Badge>
                                    </div>
                                    <ScoreBars visuals={recommendation.scoreVisuals} />
                                    <p className="text-xs leading-5 text-muted-foreground">
                                      Value highlights quality relative to price, while giftability favors bottles that feel more polished and occasion-ready.
                                    </p>
                                    <p className="line-clamp-3 text-sm text-muted-foreground">{recommendation.summary}</p>
                                    <div className="flex gap-2 pt-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full"
                                        onClick={() => toggleCompareSelection(recommendation)}
                                      >
                                        <Scale className="h-3.5 w-3.5" />
                                        {isSelectedForCompare ? 'Selected' : 'Compare'}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="rounded-full"
                                        onClick={() => setSelectedRecommendation(recommendation)}
                                      >
                                        Read more
                                        <ChevronRight className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex items-center gap-3 rounded-3xl border border-border/70 bg-background/80 px-5 py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Consulting the cellar...</p>
                    </div>
                  )}
                  <div ref={conversationEndRef} />
                </div>
              )}
            </div>

            <div className="border-t border-border/70 bg-background/90 px-5 py-5 backdrop-blur sm:px-8">
              <div className="mx-auto max-w-5xl">
                {comparisonSelection.length > 0 && (
                  <div className="mb-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-primary">Comparison Tray</span>
                        {comparisonSelection.map((wine) => (
                          <Badge key={wine.id} variant="secondary" className="gap-1">
                            {wine.name}
                            <button
                              type="button"
                              onClick={() => toggleCompareSelection(wine)}
                              className="ml-1"
                              aria-label={`Remove ${wine.name}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => setComparisonSelection([])}
                        >
                          Clear
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-full"
                          disabled={comparisonSelection.length < 2}
                          onClick={() => setIsCompareOpen(true)}
                        >
                          <Scale className="h-4 w-4" />
                          Compare now
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleTextSubmit} className="rounded-[1.75rem] border border-border/70 bg-card px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Ask anything about the wine list..."
                      disabled={isLoading}
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={toggleListening}
                      disabled={!voiceSupported || isLoading}
                      className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                        isListening
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                      aria-label={isListening ? 'Stop listening' : 'Start listening'}
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                    <Button type="submit" size="icon" disabled={isLoading || !textInput.trim()} className="rounded-full">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </form>

                {isListening && transcript && (
                  <div className="mt-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                    Listening: {transcript}
                  </div>
                )}

                {voiceError && (
                  <p className="mt-3 text-sm text-destructive">{voiceError}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p>Follow-ups keep context, cards can be compared side by side, and voice stays brief while the UI carries the detail.</p>
                  <p>Try: "same budget but red instead" or "give me something more expensive."</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedRecommendation} onOpenChange={(open) => !open && setSelectedRecommendation(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-3">
              <Wine className="h-6 w-6 shrink-0 text-primary mt-0.5" />
              <span className="text-balance">{selectedRecommendation?.name}</span>
            </DialogTitle>
            <DialogDescription>
              {selectedRecommendation?.producer || selectedRecommendation?.varietal
                ? `${selectedRecommendation?.producer || ''}${selectedRecommendation?.varietal ? ` - ${selectedRecommendation.varietal}` : ''}`
                : 'Recommendation details'}
            </DialogDescription>
          </DialogHeader>

          {selectedRecommendation && (
            <div className="space-y-6 pt-2">
              {selectedRecommendation.imageUrl && (
                <div className="relative h-64 overflow-hidden rounded-2xl bg-muted/30">
                  <Image
                    src={selectedRecommendation.imageUrl}
                    alt={selectedRecommendation.name}
                    fill
                    className="object-contain p-4"
                    sizes="(max-width: 768px) 100vw, 700px"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {selectedRecommendation.type && <Badge variant="outline">{selectedRecommendation.type}</Badge>}
                {selectedRecommendation.varietal && <Badge variant="secondary">{selectedRecommendation.varietal}</Badge>}
                {selectedRecommendation.vintage && <Badge variant="secondary">{selectedRecommendation.vintage}</Badge>}
              </div>

              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <p className="mb-2 text-sm font-medium text-primary">Sommelier Take</p>
                <p className="text-sm leading-relaxed text-foreground">{selectedRecommendation.summary}</p>
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Visual Score Explanation</p>
                <ScoreBars visuals={selectedRecommendation.scoreVisuals} />
                <ScoreLegend />
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Why this was chosen</p>
                <div className="space-y-2">
                  {selectedRecommendation.whyChosen.map((reason, index) => (
                    <div key={index} className="rounded-xl bg-muted/30 p-3 text-sm text-foreground">
                      {reason}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Score Breakdown</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedRecommendation.scoreBreakdown.map((item) => (
                    <div key={item.label} className="rounded-xl border border-border bg-card p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                      <p className="mt-1 font-medium text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {(selectedRecommendation.region || selectedRecommendation.country) && (
                  <div className="rounded-xl bg-muted/30 p-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Origin</p>
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      <MapPin className="h-4 w-4 text-primary" />
                      {[selectedRecommendation.appellation || selectedRecommendation.region, selectedRecommendation.country].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-muted/30 p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">At a Glance</p>
                  <div className="space-y-1 text-sm text-foreground">
                    <p>{selectedRecommendation.priceText}</p>
                    <p>{selectedRecommendation.ratingText}</p>
                  </div>
                </div>
              </div>

              {selectedRecommendation.referenceUrl && (
                <Button asChild className="w-full rounded-full">
                  <a href={selectedRecommendation.referenceUrl} target="_blank" rel="noopener noreferrer">
                    View Wine Details
                  </a>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCompareOpen} onOpenChange={setIsCompareOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Scale className="h-5 w-5 text-primary" />
              Comparison Mode
            </DialogTitle>
            <DialogDescription>
              Compare two recommended bottles side by side.
            </DialogDescription>
          </DialogHeader>

          {leftWine && rightWine && (
            <div className="grid gap-6 lg:grid-cols-2">
              {[leftWine, rightWine].map((wine) => (
                <div key={wine.id} className="space-y-4 rounded-2xl border border-border/70 bg-background/80 p-5">
                  <div>
                    <p className="text-lg font-semibold">{wine.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {wine.producer || wine.varietal || 'Selected recommendation'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {wine.type && <Badge variant="outline">{wine.type}</Badge>}
                    {wine.varietal && <Badge variant="secondary">{wine.varietal}</Badge>}
                    <Badge variant="secondary">{wine.priceText}</Badge>
                  </div>

                  <ScoreBars visuals={wine.scoreVisuals} />

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Sommelier Summary</p>
                    <p className="text-sm leading-relaxed">{wine.summary}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Why it stands out</p>
                    {wine.whyChosen.slice(0, 3).map((reason, index) => (
                      <div key={index} className="rounded-xl bg-muted/30 p-3 text-sm">
                        {reason}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
