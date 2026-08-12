export interface ProfessionalRating {
  source: string
  score: number
  max_score: number
  note: string
}

export interface WineRecord {
  id: string
  name: string
  producer: string
  varietal: string
  region: string
  country: string
  appellation: string
  vintage: string
  price: string
  type: string
  abv: string
  volume_ml: string
  image_url: string
  reference_url: string
  description: string
  tasting_notes: string
  body: string
  sweetness: string
  acidity: string
  food_pairing: string
  professional_ratings: ProfessionalRating[]
}

export interface WineMetadata {
  id: string
  source: string
  name: string
  producer: string
  varietal: string
  region: string
  country: string
  appellation: string
  vintage: string
  type: string
  price: number | null
  averageRating: number | null
  ratingCount: number
  bestValueScore: number | null
}

export interface EnrichedWine extends WineRecord {
  retailPrice: number | null
  avgCriticScore: number | null
  maxCriticScore: number | null
  ratingCount: number
  rawValueScore: number | null
  bestValueScore: number | null
  giftScore: number | null
  priceBand: 'budget' | 'mid' | 'premium' | 'luxury' | null
  documentText: string
  metadata: WineMetadata
}

export interface RetrievalFilters {
  type?: string
  maxPrice?: number
  minPrice?: number
  region?: string
  country?: string
  varietal?: string
  minRating?: number
}

export interface RetrievalResult {
  wine: EnrichedWine
  document: string
  distance: number | null
  similarity: number | null
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  text: string
  wineIds?: string[]
}
