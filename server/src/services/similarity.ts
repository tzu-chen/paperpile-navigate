// TF-IDF based cosine similarity for matching browse papers to worldlines

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'it', 'its',
  'this', 'that', 'these', 'those', 'we', 'our', 'they', 'their',
  'them', 'us', 'he', 'she', 'his', 'her', 'which', 'who', 'whom',
  'what', 'when', 'where', 'why', 'how', 'if', 'then', 'than',
  'so', 'no', 'not', 'only', 'very', 'also', 'just', 'about',
  'such', 'each', 'all', 'both', 'more', 'most', 'other', 'some',
  'any', 'into', 'over', 'after', 'before', 'between', 'through',
  'during', 'above', 'below', 'up', 'down', 'out', 'off', 'as',
  'new', 'use', 'used', 'using', 'based', 'show', 'shows', 'shown',
  'paper', 'propose', 'proposed', 'method', 'methods', 'approach',
  'results', 'result', 'work', 'study', 'present', 'data',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function computeTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  const len = tokens.length;
  if (len > 0) {
    for (const [term, count] of tf) {
      tf.set(term, count / len);
    }
  }
  return tf;
}

function computeIDF(documents: Map<string, number>[], vocabulary: Set<string>): Map<string, number> {
  const idf = new Map<string, number>();
  const N = documents.length;
  for (const term of vocabulary) {
    let df = 0;
    for (const doc of documents) {
      if (doc.has(term)) df++;
    }
    idf.set(term, Math.log((N + 1) / (df + 1)) + 1);
  }
  return idf;
}

function cosineSimilarity(
  vec1: Map<string, number>,
  vec2: Map<string, number>,
  idf: Map<string, number>
): number {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  // Only iterate terms present in at least one vector for efficiency
  const terms = new Set([...vec1.keys(), ...vec2.keys()]);

  for (const term of terms) {
    const idfVal = idf.get(term) || 1;
    const v1 = (vec1.get(term) || 0) * idfVal;
    const v2 = (vec2.get(term) || 0) * idfVal;
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

export interface WorldlineProfile {
  worldlineId: number;
  worldlineName: string;
  worldlineColor: string;
  papers: { title: string; summary: string }[];
}

export interface SimilarityMatch {
  worldlineId: number;
  worldlineName: string;
  worldlineColor: string;
  score: number;
}

export interface PaperSimilarityResult {
  paperId: string;
  matches: SimilarityMatch[];
}

export function computeWorldlineSimilarity(
  browsePapers: { id: string; title: string; summary: string }[],
  worldlineProfiles: WorldlineProfile[],
  threshold: number
): PaperSimilarityResult[] {
  if (browsePapers.length === 0 || worldlineProfiles.length === 0) return [];

  const vocabulary = new Set<string>();
  const browseDocTFs: Map<string, number>[] = [];
  const worldlineDocTFs: Map<string, number>[] = [];

  // Tokenize browse papers — weight title more by repeating it
  for (const paper of browsePapers) {
    const tokens = tokenize(`${paper.title} ${paper.title} ${paper.summary}`);
    const tf = computeTermFrequency(tokens);
    browseDocTFs.push(tf);
    for (const term of tf.keys()) vocabulary.add(term);
  }

  // Tokenize worldline profiles — combine all papers in each worldline
  for (const profile of worldlineProfiles) {
    const combinedText = profile.papers
      .map(p => `${p.title} ${p.title} ${p.summary}`)
      .join(' ');
    const tokens = tokenize(combinedText);
    const tf = computeTermFrequency(tokens);
    worldlineDocTFs.push(tf);
    for (const term of tf.keys()) vocabulary.add(term);
  }

  // Compute IDF across all documents
  const allDocs = [...browseDocTFs, ...worldlineDocTFs];
  const idf = computeIDF(allDocs, vocabulary);

  // Compute similarities
  const results: PaperSimilarityResult[] = [];
  for (let i = 0; i < browsePapers.length; i++) {
    const matches: SimilarityMatch[] = [];
    for (let j = 0; j < worldlineProfiles.length; j++) {
      const score = cosineSimilarity(browseDocTFs[i], worldlineDocTFs[j], idf);
      if (score >= threshold) {
        matches.push({
          worldlineId: worldlineProfiles[j].worldlineId,
          worldlineName: worldlineProfiles[j].worldlineName,
          worldlineColor: worldlineProfiles[j].worldlineColor,
          score: Math.round(score * 1000) / 1000,
        });
      }
    }
    if (matches.length > 0) {
      matches.sort((a, b) => b.score - a.score);
      results.push({
        paperId: browsePapers[i].id,
        matches,
      });
    }
  }

  return results;
}
