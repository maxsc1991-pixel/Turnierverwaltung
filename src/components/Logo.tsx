import { useState } from 'react';

/**
 * Vereinslogo. Bevorzugt wird `public/logo.png` – liegt dort keine Datei,
 * wird auf das mitgelieferte `public/logo.svg` zurückgefallen. Zum Austauschen
 * genügt es also, die eigene Datei unter einem der beiden Namen abzulegen.
 */
export function Logo({ size = 44, className }: { size?: number; className?: string }) {
  const [src, setSrc] = useState('/logo.png');

  return (
    <img
      src={src}
      onError={() => setSrc((current) => (current === '/logo.png' ? '/logo.svg' : current))}
      width={size}
      height={size}
      alt="DC Lok Pfalzel"
      className={className}
    />
  );
}
