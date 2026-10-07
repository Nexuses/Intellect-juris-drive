import Image from "next/image";

const LOGO_URL = "https://assets.wefundco.com/image__35__1791354788326_9uuo.png";

export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={LOGO_URL}
      alt="Intellect Juris Law Offices"
      width={922}
      height={745}
      priority={priority}
      className={`mix-blend-multiply ${className ?? ""}`}
    />
  );
}
