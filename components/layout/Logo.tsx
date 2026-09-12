import Image from 'next/image';

interface LogoProps {
  variant?: 'mobile-header' | 'sidebar';
}

export function Logo({ variant = 'sidebar' }: LogoProps) {
  if (variant === 'mobile-header') {
    return (
      <div className="relative w-full max-w-[220px] h-20 mix-blend-multiply">
        <Image
          src="/cancheros.png"
          alt="Cancheros Logo"
          fill
          priority
          className="object-contain object-left"
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-25 px-2 mix-blend-multiply">
      <Image
        src="/cancheros.png"
        alt="Cancheros Logo"
        fill
        priority
        className="object-contain object-center scale-110"
      />
    </div>
  );
}