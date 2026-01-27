import { UMAP } from 'umap-js';

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'this', 'but', 'they', 'have', 'had', 'been', 'not', 'our',
  'we', 'can', 'which', 'their', 'these', 'also', 'may', 'than', 'such', 'more',
  'where', 'some', 'each', 'into', 'then', 'both', 'over', 'any', 'when', 'between',
  'about', 'all', 'how', 'would', 'there', 'should', 'could', 'other', 'what', 'if',
  'only', 'one', 'two', 'three', 'using', 'show', 'based', 'used', 'proposed',
  'results', 'paper', 'work', 'study', 'present', 'however', 'well', 'first',
  'many', 'most', 'several', 'does', 'while', 'those', 'since', 'through',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Compute 1D UMAP embedding positions for papers based on TF-IDF of their
 * title, abstract, and category text. Returns a Map from paper id to a
 * normalised x value in [0.1, 0.9].
 */
export function computeUmapPositions(
  papers: Array<{ id: number; title: string; summary: string; categories: string }>
): Map<number, number> {
  if (papers.length === 0) return new Map();

  // For very small sets UMAP is not meaningful — spread evenly
  if (papers.length <= 3) {
    const positions = new Map<number, number>();
    papers.forEach((p, i) => {
      positions.set(p.id, (i + 1) / (papers.length + 1));
    });
    return positions;
  }

  // Tokenize all documents: title + abstract + categories
  const docs = papers.map(p => {
    const catTokens: string[] = (() => {
      try {
        return (JSON.parse(p.categories) as string[])
          .flatMap(c => c.split('.'))
          .map(s => s.toLowerCase());
      } catch {
        return [];
      }
    })();
    // Weight categories by repeating them so they carry more signal
    return [
      ...tokenize(p.title),
      ...tokenize(p.summary),
      ...catTokens, ...catTokens, ...catTokens,
    ];
  });

  // Document frequency
  const df = new Map<string, number>();
  docs.forEach(doc => {
    const unique = new Set(doc);
    unique.forEach(term => df.set(term, (df.get(term) || 0) + 1));
  });

  // Build vocabulary: terms appearing in >=2 docs but not in >90% of docs,
  // capped at 500 terms sorted by descending df
  const maxDf = Math.max(2, Math.floor(papers.length * 0.9));
  const vocab = Array.from(df.entries())
    .filter(([, count]) => count >= 2 && count <= maxDf)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 500)
    .map(([term]) => term);

  // Fallback if the vocabulary is too small for meaningful embedding
  if (vocab.length < 3) {
    const positions = new Map<number, number>();
    papers.forEach((p, i) => {
      positions.set(p.id, (i + 1) / (papers.length + 1));
    });
    return positions;
  }

  const vocabIndex = new Map<string, number>();
  vocab.forEach((term, i) => vocabIndex.set(term, i));

  // Build TF-IDF matrix
  const N = docs.length;
  const tfidfMatrix: number[][] = docs.map(doc => {
    const vec = new Array(vocab.length).fill(0);
    const tf = new Map<string, number>();
    let totalMapped = 0;
    doc.forEach(t => {
      if (vocabIndex.has(t)) {
        tf.set(t, (tf.get(t) || 0) + 1);
        totalMapped++;
      }
    });
    if (totalMapped > 0) {
      tf.forEach((count, term) => {
        const idx = vocabIndex.get(term)!;
        const idf = Math.log(N / (df.get(term) || 1));
        vec[idx] = (count / totalMapped) * idf;
      });
    }
    return vec;
  });

  // Run UMAP  (1-component for x-axis)
  const nNeighbors = Math.min(15, papers.length - 1);
  const umap = new UMAP({
    nComponents: 1,
    nNeighbors: Math.max(2, nNeighbors),
    minDist: 0.1,
    distanceFn: cosineDistance,
  });

  const embedding = umap.fit(tfidfMatrix);

  // Normalise to [0.1, 0.9] so nodes are not right at the edge
  const values = embedding.map(e => e[0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const positions = new Map<number, number>();
  papers.forEach((p, i) => {
    positions.set(p.id, ((values[i] - min) / range) * 0.8 + 0.1);
  });

  return positions;
}
