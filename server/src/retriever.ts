import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface Document {
  id: string;
  title: string;
  content: string;
  embedding?: number[];
}

const documentsPath = path.join(__dirname, '..', 'data', 'documents.json');
let documents: Document[] | null = null;

async function loadDocuments() {
  if (!documents) {
    const file = fs.readFileSync(documentsPath, 'utf-8');
    documents = JSON.parse(file);
    for (const doc of documents) {
      doc.embedding = await embedText(doc.content);
    }
  }
  return documents!;
}

async function embedText(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY) {
    return text.split('').map((c) => (c.charCodeAt(0) % 100) / 100);
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'embedding-001' });
  const result = await model.embedContent({
    content: {
      parts: [{ text }]
    }
  });
  return result.embedding.values;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function getRelevantContext(question: string, k = 3): Promise<string[]> {
  const docs = await loadDocuments();
  const qEmbedding = await embedText(question);
  const scored = docs.map((doc) => ({
    doc,
    score: doc.embedding ? cosineSimilarity(qEmbedding, doc.embedding) : 0
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((entry) => entry.doc.content);
}
