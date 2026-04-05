import { WineAssistant } from '@/components/wine-assistant'
import { WineCatalog } from '@/components/wine-catalog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MessageCircle, Wine } from 'lucide-react'

export default function Home() {
  return (
    <main className="h-screen overflow-hidden bg-background flex flex-col">
      {/* Decorative Header */}
      <div className="relative shrink-0 bg-primary/5 border-b border-border">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,50,40,0.05),transparent_50%)]" />
        <div className="relative max-w-7xl mx-auto px-4 py-4 sm:py-5">
          <p className="text-center text-sm uppercase tracking-widest text-muted-foreground">
            Voice-Enabled Wine Discovery
          </p>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full px-4 py-2 sm:py-3">
        <Tabs defaultValue="assistant" className="flex h-full min-h-0 flex-col w-full">
          <TabsList className="shrink-0 grid w-full max-w-md mx-auto grid-cols-2 mb-3 sm:mb-4">
            <TabsTrigger value="assistant" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Ask Sommelier</span>
              <span className="sm:hidden">Ask</span>
            </TabsTrigger>
            <TabsTrigger value="catalog" className="gap-2">
              <Wine className="h-4 w-4" />
              <span className="hidden sm:inline">Wine Catalog</span>
              <span className="sm:hidden">Catalog</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assistant" className="mt-0 flex-1 min-h-0">
            <WineAssistant />
          </TabsContent>

          <TabsContent value="catalog" className="mt-0 flex-1 min-h-0 overflow-y-auto">
            <WineCatalog />
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="shrink-0 py-2 border-t border-border bg-secondary/30">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-center text-xs text-muted-foreground">
            Answers are based on the available wine inventory. Speak clearly for best results.
          </p>
        </div>
      </footer>
    </main>
  )
}
