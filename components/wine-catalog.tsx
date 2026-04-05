'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Wine, Search, MapPin, Calendar, DollarSign, Star, GrapeIcon, ExternalLink, Percent, Beaker } from 'lucide-react'
import Image from 'next/image'

interface WineData {
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
  professional_ratings: Array<{
    source: string
    score: number
    max_score: number
    note: string
  }>
}

export function WineCatalog() {
  const [wines, setWines] = useState<WineData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedWine, setSelectedWine] = useState<WineData | null>(null)

  useEffect(() => {
    async function fetchWines() {
      try {
        const response = await fetch('/api/wine')
        const data = await response.json()
        setWines(data.wines || [])
      } catch (error) {
        console.error('Failed to fetch wines:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchWines()
  }, [])

  const filteredWines = wines.filter(wine => {
    const query = searchQuery.toLowerCase()
    return (
      wine.name.toLowerCase().includes(query) ||
      wine.producer.toLowerCase().includes(query) ||
      wine.varietal.toLowerCase().includes(query) ||
      wine.region.toLowerCase().includes(query) ||
      wine.country.toLowerCase().includes(query) ||
      wine.type.toLowerCase().includes(query)
    )
  })
  
  const getHighestRating = (ratings: WineData['professional_ratings']) => {
    if (!ratings || ratings.length === 0) return null
    return ratings.reduce((highest, curr) => 
      curr.score > (highest?.score || 0) ? curr : highest
    , ratings[0])
  }

  const getWineTypeColor = (type: string) => {
    const t = type.toLowerCase()
    if (t.includes('red')) return 'bg-red-900/20 text-red-800 border-red-800/30'
    if (t.includes('white')) return 'bg-amber-100/50 text-amber-800 border-amber-800/30'
    if (t.includes('rosé') || t.includes('rose')) return 'bg-pink-100/50 text-pink-700 border-pink-700/30'
    if (t.includes('sparkling') || t.includes('champagne')) return 'bg-yellow-100/50 text-yellow-700 border-yellow-700/30'
    return 'bg-muted text-muted-foreground border-border'
  }

  const formatPrice = (price: string) => {
    const num = price.replace(/[^0-9.]/g, '')
    return num ? `$${parseFloat(num).toFixed(2)}` : price
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search wines by name, region, or type..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Wine Count */}
      <p className="text-sm text-muted-foreground">
        {filteredWines.length} wine{filteredWines.length !== 1 ? 's' : ''} found
      </p>

      {/* Wine Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredWines.map((wine, index) => {
          const highestRating = getHighestRating(wine.professional_ratings)
          return (
            <Card
              key={`${wine.id || wine.name}-${index}`}
              className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5 overflow-hidden"
              onClick={() => setSelectedWine(wine)}
            >
              {/* Wine Image */}
              {wine.image_url && (
                <div className="relative h-48 bg-muted/30">
                  <Image
                    src={wine.image_url}
                    alt={wine.name}
                    fill
                    className="object-contain p-2"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
              )}
              <CardContent className="p-4 space-y-3">
                {/* Wine Type & Varietal Badges */}
                <div className="flex flex-wrap gap-2">
                  {wine.type && (
                    <Badge variant="outline" className={getWineTypeColor(wine.type)}>
                      {wine.type}
                    </Badge>
                  )}
                  {wine.varietal && (
                    <Badge variant="secondary" className="text-xs">
                      {wine.varietal}
                    </Badge>
                  )}
                </div>

                {/* Wine Name */}
                <h3 className="font-semibold text-foreground leading-tight line-clamp-2">
                  {wine.name}
                </h3>
                
                {/* Producer */}
                {wine.producer && (
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {wine.producer}
                  </p>
                )}

                {/* Region & Country */}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {[wine.appellation || wine.region, wine.country].filter(Boolean).join(', ') || 'Unknown region'}
                  </span>
                </div>

                {/* Price, Rating & Vintage Row */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  {wine.price && (
                    <div className="flex items-center gap-1 text-sm font-medium text-primary">
                      <DollarSign className="h-3.5 w-3.5" />
                      {formatPrice(wine.price).replace('$', '')}
                    </div>
                  )}
                  {highestRating && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                      {highestRating.score}
                    </div>
                  )}
                  {wine.vintage && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {wine.vintage}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filteredWines.length === 0 && (
        <div className="text-center py-12">
          <Wine className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No wines found matching your search.</p>
        </div>
      )}

      {/* Wine Detail Dialog */}
      <Dialog open={!!selectedWine} onOpenChange={(open) => !open && setSelectedWine(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-3">
              <Wine className="h-6 w-6 shrink-0 text-primary mt-0.5" />
              <span className="text-balance">{selectedWine?.name}</span>
            </DialogTitle>
            <DialogDescription>
              {selectedWine?.producer || selectedWine?.varietal 
                ? `${selectedWine?.producer || ''}${selectedWine?.varietal ? ` - ${selectedWine.varietal}` : ''}`
                : 'Complete wine details and tasting notes'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedWine && (
            <div className="space-y-6 pt-2">
              {/* Image */}
              {selectedWine.image_url && (
                <div className="relative h-64 bg-muted/30 rounded-lg overflow-hidden">
                  <Image
                    src={selectedWine.image_url}
                    alt={selectedWine.name}
                    fill
                    className="object-contain p-4"
                    sizes="(max-width: 768px) 100vw, 600px"
                  />
                </div>
              )}
              
              {/* Type & Varietal Badges */}
              <div className="flex flex-wrap gap-2">
                {selectedWine.type && (
                  <Badge variant="outline" className={getWineTypeColor(selectedWine.type)}>
                    <GrapeIcon className="h-3 w-3 mr-1" />
                    {selectedWine.type}
                  </Badge>
                )}
                {selectedWine.varietal && (
                  <Badge variant="secondary">
                    {selectedWine.varietal}
                  </Badge>
                )}
              </div>

              {/* Info Grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                {selectedWine.producer && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Producer</p>
                    <p className="font-medium">{selectedWine.producer}</p>
                  </div>
                )}

                {selectedWine.appellation && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Appellation</p>
                    <p className="font-medium">{selectedWine.appellation}</p>
                  </div>
                )}

                {selectedWine.region && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Region</p>
                    <p className="font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      {selectedWine.region}
                    </p>
                  </div>
                )}

                {selectedWine.country && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Country</p>
                    <p className="font-medium">{selectedWine.country}</p>
                  </div>
                )}

                {selectedWine.vintage && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Vintage</p>
                    <p className="font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      {selectedWine.vintage}
                    </p>
                  </div>
                )}

                {selectedWine.price && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Retail Price</p>
                    <p className="font-medium flex items-center gap-2 text-primary">
                      <DollarSign className="h-4 w-4" />
                      {formatPrice(selectedWine.price).replace('$', '')}
                    </p>
                  </div>
                )}

                {selectedWine.abv && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">ABV</p>
                    <p className="font-medium flex items-center gap-2">
                      <Percent className="h-4 w-4 text-primary" />
                      {selectedWine.abv}%
                    </p>
                  </div>
                )}

                {selectedWine.volume_ml && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Volume</p>
                    <p className="font-medium flex items-center gap-2">
                      <Beaker className="h-4 w-4 text-primary" />
                      {selectedWine.volume_ml}ml
                    </p>
                  </div>
                )}
              </div>

              {/* Professional Ratings */}
              {selectedWine.professional_ratings && selectedWine.professional_ratings.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Professional Ratings</p>
                  <div className="space-y-4">
                    {selectedWine.professional_ratings.map((rating, idx) => (
                      <div key={idx} className="bg-muted/30 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{rating.source}</span>
                          <Badge variant="secondary" className="font-mono">
                            <Star className="h-3 w-3 fill-accent text-accent mr-1" />
                            {rating.score}/{rating.max_score}
                          </Badge>
                        </div>
                        {rating.note && (
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {rating.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Buy Link */}
              {selectedWine.reference_url && (
                <div className="pt-2 border-t border-border">
                  <Button asChild className="w-full">
                    <a href={selectedWine.reference_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on Wine.com
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
