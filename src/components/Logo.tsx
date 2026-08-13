import { useState } from 'react';

/**
 * Bevorzugt wird `public/logo.png`, sonst `public/logo.svg`. Zum Austauschen
 * genügt es, die eigene Datei unter einem der beiden Namen abzulegen.
 *
 * Die Pfade stehen bewusst je genau einmal im Code: beim Bauen werden sie durch
 * die eingebetteten Bilddaten ersetzt, und jede zusätzliche Fundstelle würde das
 * Logo ein weiteres Mal in die fertige Datei schreiben.
 */
const SOURCES = ['./logo.png', './logo.svg'];

export function Logo({ size = 44, className }: { size?: number; className?: string }) {
  const [index, setIndex] = useState(0);

  return (
    <img
      src={SOURCES[index]}
      onError={() => setIndex((current) => Math.min(current + 1, SOURCES.length - 1))}
      width={size}
      height={size}
      alt="DC Lok Pfalzel"
      className={className}
    />
  );
}
