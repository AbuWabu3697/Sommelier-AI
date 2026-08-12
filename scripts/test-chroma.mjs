import { ChromaClient } from "chromadb";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";

async function main() {
  console.log("Connecting to Chroma...");

  const client = new ChromaClient({
    host: "127.0.0.1",
    port: 8000,
  });

  const embedder = new DefaultEmbeddingFunction();

  const collection = await client.getOrCreateCollection({
    name: process.env.CHROMA_SMOKE_COLLECTION || "sommelier_chroma_smoke",
    embeddingFunction: embedder,
  });

  console.log("Collection ready:", collection.name);

  await collection.upsert({
    ids: ["wine-1", "wine-2", "wine-3"],

    documents: [
      "A crisp Sauvignon Blanc with citrus flavors and high acidity that pairs well with seafood.",
      "A full-bodied Cabernet Sauvignon with dark fruit flavors that pairs well with steak.",
      "A light Pinot Grigio with refreshing acidity that pairs well with fish and salads.",
    ],

    metadatas: [
      {
        name: "Test Sauvignon Blanc",
        type: "white",
        price: 20,
        rating: 92,
      },
      {
        name: "Test Cabernet Sauvignon",
        type: "red",
        price: 35,
        rating: 94,
      },
      {
        name: "Test Pinot Grigio",
        type: "white",
        price: 18,
        rating: 88,
      },
    ],
  });

  console.log("Test wines inserted.");

  const results = await collection.query({
    queryTexts: ["I want a refreshing wine for seafood"],
    nResults: 2,
    include: ["documents", "metadatas", "distances"],
  });

  console.dir(results, { depth: null });
}

main().catch((error) => {
  console.error("Chroma smoke test failed:");
  console.error(error);
  process.exit(1);
});
