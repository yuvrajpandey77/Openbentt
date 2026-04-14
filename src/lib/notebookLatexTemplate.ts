/** Starter `.tex` users can paste/edit in Notebook Source before Compile (pdflatex). */
export const NOTEBOOK_LATEX_BOOK_TEMPLATE = String.raw`\documentclass[12pt,oneside]{book}
\usepackage[margin=1in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{setspace}

\setstretch{1.15}

\title{Your Title}
\author{Your Name}
\date{\today}

\begin{document}

\frontmatter

\begin{titlepage}
  \centering
  \vspace*{2.5cm}
  {\Huge \textbf{Your Title}\par}
  \vfill
  {\large Your Name\par}
  \vspace{0.4cm}
  {\large \today\par}
\end{titlepage}

\tableofcontents

\mainmatter

\chapter{First Chapter}
Write here. Ask the assistant to expand sections; keep output as valid LaTeX.

\section{A Section}
\begin{itemize}
  \item Point one
  \item Point two
\end{itemize}

\backmatter

\chapter*{Notes}
Optional closing material.

\end{document}
`;
