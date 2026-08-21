import { createApp } from './app'

const PORT = Number(process.env.PORT ?? 4000)

const app = createApp()

app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`)
})
