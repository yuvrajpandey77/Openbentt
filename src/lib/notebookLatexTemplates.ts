import { NOTEBOOK_LATEX_BOOK_TEMPLATE } from "@/lib/notebookLatexTemplate";

export type LatexTemplateId = "minimal-article" | "book" | "ieee-local" | "research-article";

export type LatexTemplate = {
  id: LatexTemplateId;
  label: string;
  description: string;
  /** Requires local TeX Live */
  requiresLocalTex?: boolean;
  content: string;
};

export const NOTEBOOK_LATEX_TEMPLATES: LatexTemplate[] = [
  {
    id: "minimal-article",
    label: "Minimal article (WASM-safe)",
    description: "Compiles in browser BusyTeX — lmodern, amsmath, basic structure.",
    content: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage{lmodern}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{geometry}
\geometry{margin=1in}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{hyperref}
\usepackage{setspace}
\setstretch{1.15}

\title{Research Paper Title}
\author{Your Name}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Write your abstract here.
\end{abstract}

\section{Introduction}
Your introduction.

\section{Conclusion}
Summary and future work.

\begin{thebibliography}{99}
\bibitem{ref1} Author, \textit{Title}, Venue, Year.
\end{thebibliography}

\end{document}`,
  },
  {
    id: "book",
    label: "Book / thesis",
    description: "Multi-chapter book template.",
    content: NOTEBOOK_LATEX_BOOK_TEMPLATE,
  },
  {
    id: "ieee-local",
    label: "IEEE conference (local TeX)",
    description: "IEEEtran two-column — compile with Local TeX Live backend.",
    requiresLocalTex: true,
    content: String.raw`\documentclass[conference]{IEEEtran}
\usepackage{lmodern}
\usepackage{cite}
\usepackage{amsmath,amssymb,amsfonts}
\usepackage{algorithmic}
\usepackage{graphicx}
\usepackage{textcomp}
\usepackage{xcolor}

\title{Advanced AI Systems}
\author{\IEEEauthorblockN{Your Name}
\IEEEauthorblockA{Department of Computer Applications}}

\begin{document}
\maketitle

\begin{abstract}
Abstract text.
\end{abstract}

\begin{IEEEkeywords}
Artificial Intelligence, Large Language Models, Transformers
\end{IEEEkeywords}

\section{Introduction}
Introduction.

\section{Conclusion}
Conclusion.

\bibliographystyle{IEEEtran}
\bibliography{references}

\end{document}`,
  },
  {
    id: "research-article",
    label: "Research article (extended)",
    description: "Sections for methodology, experiments, appendix — WASM-friendly packages.",
    content: String.raw`\documentclass[11pt,a4paper]{article}
\usepackage{lmodern}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{geometry}
\geometry{margin=1in}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{hyperref}
\usepackage{setspace}
\setstretch{1.2}

\title{Research Paper}
\author{Your Name}
\date{\today}

\begin{document}
\maketitle
\begin{abstract}Abstract.\end{abstract}

\textbf{Keywords:} AI, Machine Learning, Transformers

\section{Introduction}
\section{Related Work}
\section{Methodology}
\section{Experimental Setup}
\section{Results and Analysis}
\section{Limitations}
\section{Future Work}
\section{Conclusion}

\appendix
\section{Supplementary Material}

\begin{thebibliography}{99}
\bibitem{v} Vaswani et al., \textit{Attention Is All You Need}, NeurIPS 2017.
\end{thebibliography}

\end{document}`,
  },
];

export function getLatexTemplate(id: LatexTemplateId): LatexTemplate | undefined {
  return NOTEBOOK_LATEX_TEMPLATES.find((t) => t.id === id);
}
