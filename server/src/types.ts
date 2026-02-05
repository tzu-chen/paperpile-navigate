export interface ArxivPaper {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  categories: string[];
  pdfUrl: string;
  absUrl: string;
  doi?: string;
  journalRef?: string;
  announceType?: 'new' | 'cross-list';
}

export interface SavedPaper {
  id: number;
  arxiv_id: string;
  title: string;
  summary: string;
  authors: string;
  published: string;
  updated: string;
  categories: string;
  pdf_url: string;
  abs_url: string;
  doi: string | null;
  journal_ref: string | null;
  added_at: string;
  status: 'new' | 'reading' | 'reviewed' | 'exported';
}

export interface Comment {
  id: number;
  paper_id: number;
  content: string;
  page_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface PaperTag {
  paper_id: number;
  tag_id: number;
}

export interface CategoryGroup {
  label: string;
  categories: Record<string, string>;
}

export const ARXIV_CATEGORY_GROUPS: CategoryGroup[] = [
  {
    label: 'Computer Science',
    categories: {
      'cs.AI': 'Artificial Intelligence',
      'cs.AR': 'Hardware Architecture',
      'cs.CC': 'Computational Complexity',
      'cs.CE': 'Computational Engineering, Finance, and Science',
      'cs.CG': 'Computational Geometry',
      'cs.CL': 'Computation and Language',
      'cs.CR': 'Cryptography and Security',
      'cs.CV': 'Computer Vision and Pattern Recognition',
      'cs.CY': 'Computers and Society',
      'cs.DB': 'Databases',
      'cs.DC': 'Distributed, Parallel, and Cluster Computing',
      'cs.DL': 'Digital Libraries',
      'cs.DM': 'Discrete Mathematics',
      'cs.DS': 'Data Structures and Algorithms',
      'cs.ET': 'Emerging Technologies',
      'cs.FL': 'Formal Languages and Automata Theory',
      'cs.GL': 'General Literature',
      'cs.GR': 'Graphics',
      'cs.GT': 'Computer Science and Game Theory',
      'cs.HC': 'Human-Computer Interaction',
      'cs.IR': 'Information Retrieval',
      'cs.IT': 'Information Theory',
      'cs.LG': 'Machine Learning',
      'cs.LO': 'Logic in Computer Science',
      'cs.MA': 'Multiagent Systems',
      'cs.MM': 'Multimedia',
      'cs.MS': 'Mathematical Software',
      'cs.NA': 'Numerical Analysis',
      'cs.NE': 'Neural and Evolutionary Computing',
      'cs.NI': 'Networking and Internet Architecture',
      'cs.OH': 'Other Computer Science',
      'cs.OS': 'Operating Systems',
      'cs.PF': 'Performance',
      'cs.PL': 'Programming Languages',
      'cs.RO': 'Robotics',
      'cs.SC': 'Symbolic Computation',
      'cs.SD': 'Sound',
      'cs.SE': 'Software Engineering',
      'cs.SI': 'Social and Information Networks',
      'cs.SY': 'Systems and Control',
    },
  },
  {
    label: 'Economics',
    categories: {
      'econ.EM': 'Econometrics',
      'econ.GN': 'General Economics',
      'econ.TH': 'Theoretical Economics',
    },
  },
  {
    label: 'Electrical Engineering and Systems Science',
    categories: {
      'eess.AS': 'Audio and Speech Processing',
      'eess.IV': 'Image and Video Processing',
      'eess.SP': 'Signal Processing',
      'eess.SY': 'Systems and Control',
    },
  },
  {
    label: 'Mathematics',
    categories: {
      'math.AC': 'Commutative Algebra',
      'math.AG': 'Algebraic Geometry',
      'math.AP': 'Analysis of PDEs',
      'math.AT': 'Algebraic Topology',
      'math.CA': 'Classical Analysis and ODEs',
      'math.CO': 'Combinatorics',
      'math.CT': 'Category Theory',
      'math.CV': 'Complex Variables',
      'math.DG': 'Differential Geometry',
      'math.DS': 'Dynamical Systems',
      'math.FA': 'Functional Analysis',
      'math.GM': 'General Mathematics',
      'math.GN': 'General Topology',
      'math.GR': 'Group Theory',
      'math.GT': 'Geometric Topology',
      'math.HO': 'History and Overview',
      'math.IT': 'Information Theory',
      'math.KT': 'K-Theory and Homology',
      'math.LO': 'Logic',
      'math.MG': 'Metric Geometry',
      'math.MP': 'Mathematical Physics',
      'math.NA': 'Numerical Analysis',
      'math.NT': 'Number Theory',
      'math.OA': 'Operator Algebras',
      'math.OC': 'Optimization and Control',
      'math.PR': 'Probability',
      'math.QA': 'Quantum Algebra',
      'math.RA': 'Rings and Algebras',
      'math.RT': 'Representation Theory',
      'math.SG': 'Symplectic Geometry',
      'math.SP': 'Spectral Theory',
      'math.ST': 'Statistics Theory',
    },
  },
  {
    label: 'Astrophysics',
    categories: {
      'astro-ph.CO': 'Cosmology and Nongalactic Astrophysics',
      'astro-ph.EP': 'Earth and Planetary Astrophysics',
      'astro-ph.GA': 'Astrophysics of Galaxies',
      'astro-ph.HE': 'High Energy Astrophysical Phenomena',
      'astro-ph.IM': 'Instrumentation and Methods for Astrophysics',
      'astro-ph.SR': 'Solar and Stellar Astrophysics',
    },
  },
  {
    label: 'Condensed Matter',
    categories: {
      'cond-mat.dis-nn': 'Disordered Systems and Neural Networks',
      'cond-mat.mes-hall': 'Mesoscale and Nanoscale Physics',
      'cond-mat.mtrl-sci': 'Materials Science',
      'cond-mat.other': 'Other Condensed Matter',
      'cond-mat.quant-gas': 'Quantum Gases',
      'cond-mat.soft': 'Soft Condensed Matter',
      'cond-mat.stat-mech': 'Statistical Mechanics',
      'cond-mat.str-el': 'Strongly Correlated Electrons',
      'cond-mat.supr-con': 'Superconductivity',
    },
  },
  {
    label: 'High Energy Physics',
    categories: {
      'hep-ex': 'High Energy Physics - Experiment',
      'hep-lat': 'High Energy Physics - Lattice',
      'hep-ph': 'High Energy Physics - Phenomenology',
      'hep-th': 'High Energy Physics - Theory',
    },
  },
  {
    label: 'General Relativity & Quantum',
    categories: {
      'gr-qc': 'General Relativity and Quantum Cosmology',
      'quant-ph': 'Quantum Physics',
    },
  },
  {
    label: 'Mathematical & Nuclear Physics',
    categories: {
      'math-ph': 'Mathematical Physics',
      'nucl-ex': 'Nuclear Experiment',
      'nucl-th': 'Nuclear Theory',
    },
  },
  {
    label: 'Nonlinear Sciences',
    categories: {
      'nlin.AO': 'Adaptation and Self-Organizing Systems',
      'nlin.CD': 'Chaotic Dynamics',
      'nlin.CG': 'Cellular Automata and Lattice Gases',
      'nlin.PS': 'Pattern Formation and Solitons',
      'nlin.SI': 'Exactly Solvable and Integrable Systems',
    },
  },
  {
    label: 'Physics',
    categories: {
      'physics.acc-ph': 'Accelerator Physics',
      'physics.ao-ph': 'Atmospheric and Oceanic Physics',
      'physics.app-ph': 'Applied Physics',
      'physics.atm-clus': 'Atomic and Molecular Clusters',
      'physics.atom-ph': 'Atomic Physics',
      'physics.bio-ph': 'Biological Physics',
      'physics.chem-ph': 'Chemical Physics',
      'physics.class-ph': 'Classical Physics',
      'physics.comp-ph': 'Computational Physics',
      'physics.data-an': 'Data Analysis, Statistics and Probability',
      'physics.ed-ph': 'Physics Education',
      'physics.flu-dyn': 'Fluid Dynamics',
      'physics.gen-ph': 'General Physics',
      'physics.geo-ph': 'Geophysics',
      'physics.hist-ph': 'History and Philosophy of Physics',
      'physics.ins-det': 'Instrumentation and Detectors',
      'physics.med-ph': 'Medical Physics',
      'physics.optics': 'Optics',
      'physics.plasm-ph': 'Plasma Physics',
      'physics.pop-ph': 'Popular Physics',
      'physics.soc-ph': 'Physics and Society',
      'physics.space-ph': 'Space Physics',
    },
  },
  {
    label: 'Quantitative Biology',
    categories: {
      'q-bio.BM': 'Biomolecules',
      'q-bio.CB': 'Cell Behavior',
      'q-bio.GN': 'Genomics',
      'q-bio.MN': 'Molecular Networks',
      'q-bio.NC': 'Neurons and Cognition',
      'q-bio.OT': 'Other Quantitative Biology',
      'q-bio.PE': 'Populations and Evolution',
      'q-bio.QM': 'Quantitative Methods',
      'q-bio.SC': 'Subcellular Processes',
      'q-bio.TO': 'Tissues and Organs',
    },
  },
  {
    label: 'Quantitative Finance',
    categories: {
      'q-fin.CP': 'Computational Finance',
      'q-fin.EC': 'Economics',
      'q-fin.GN': 'General Finance',
      'q-fin.MF': 'Mathematical Finance',
      'q-fin.PM': 'Portfolio Management',
      'q-fin.PR': 'Pricing of Securities',
      'q-fin.RM': 'Risk Management',
      'q-fin.ST': 'Statistical Finance',
      'q-fin.TR': 'Trading and Market Microstructure',
    },
  },
  {
    label: 'Statistics',
    categories: {
      'stat.AP': 'Applications',
      'stat.CO': 'Computation',
      'stat.ME': 'Methodology',
      'stat.ML': 'Machine Learning',
      'stat.OT': 'Other Statistics',
      'stat.TH': 'Statistics Theory',
    },
  },
];
