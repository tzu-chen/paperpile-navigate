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
 * Compute 1D embedding positions for papers based on TF-IDF of their
 * title, abstract, and category text, projected onto the first principal
 * component (PCA). Returns a Map from paper id to a normalised x value
 * in [0.1, 0.9].
 *
 * Unlike UMAP, PCA is fully deterministic — the same input always
 * produces the same output, eliminating the "wiggling" that stochastic
 * methods cause on re-render.
 */
export function computeEmbeddingPositions(
  papers: Array<{ id: number; title: string; summary: string; categories: string }>
): Map<number, number> {
  if (papers.length === 0) return new Map();

  // For very small sets, spread evenly
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

  const V = vocab.length;

  // Build TF-IDF matrix (N x V)
  const N = docs.length;
  const tfidfMatrix: number[][] = docs.map(doc => {
    const vec = new Array(V).fill(0);
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

  // --- PCA: project onto first principal component ---

  // 1. Center the matrix (subtract column means)
  const means = new Array(V).fill(0);
  for (const row of tfidfMatrix) {
    for (let j = 0; j < V; j++) means[j] += row[j];
  }
  for (let j = 0; j < V; j++) means[j] /= N;

  const centered = tfidfMatrix.map(row =>
    row.map((v, j) => v - means[j])
  );

  // 2. Power iteration to find the first principal component direction.
  //    We compute X^T X v iteratively without forming the V x V covariance
  //    matrix. Deterministic initialisation: v_j = (j + 1) / V.
  let pc = new Array(V);
  for (let j = 0; j < V; j++) pc[j] = (j + 1) / V;

  for (let iter = 0; iter < 100; iter++) {
    // Compute projections: proj_i = centered[i] . pc
    const proj = new Array(N);
    for (let i = 0; i < N; i++) {
      let dot = 0;
      for (let j = 0; j < V; j++) dot += centered[i][j] * pc[j];
      proj[i] = dot;
    }

    // Compute new pc = X^T * proj
    const newPc = new Array(V).fill(0);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < V; j++) newPc[j] += centered[i][j] * proj[i];
    }

    // Normalise
    let norm = 0;
    for (let j = 0; j < V; j++) norm += newPc[j] * newPc[j];
    norm = Math.sqrt(norm);
    if (norm === 0) break;
    pc = newPc.map(v => v / norm);
  }

  // Ensure sign consistency: the component with the largest absolute
  // weight should be positive, so the ordering is stable.
  let maxAbs = 0;
  let maxSign = 1;
  for (let j = 0; j < V; j++) {
    if (Math.abs(pc[j]) > maxAbs) {
      maxAbs = Math.abs(pc[j]);
      maxSign = pc[j] >= 0 ? 1 : -1;
    }
  }
  if (maxSign < 0) pc = pc.map(v => -v);

  // 3. Project each paper onto the first PC
  const values = centered.map(row => {
    let dot = 0;
    for (let j = 0; j < V; j++) dot += row[j] * pc[j];
    return dot;
  });

  // Normalise to [0.1, 0.9] so nodes are not right at the edge
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const positions = new Map<number, number>();
  papers.forEach((p, i) => {
    positions.set(p.id, ((values[i] - min) / range) * 0.8 + 0.1);
  });

  return positions;
}
