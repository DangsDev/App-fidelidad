import Image from 'next/image';

export function BrandMark({ size = 128, className = '' }: { size?: number; className?: string }) {
  return <Image src="/aquelarre-logo.svg" width={size} height={size} alt="" aria-hidden="true" priority className={`shrink-0 rounded-full ${className}`} />;
}
