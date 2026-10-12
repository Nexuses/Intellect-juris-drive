import Image from "next/image";
import { LOGO_HEIGHT, LOGO_URL, LOGO_WIDTH } from "@/app/lib/brand";

export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={LOGO_URL}
      alt="Intellect Juris Law Offices"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority={priority}
      className={`mix-blend-multiply ${className ?? ""}`}
    />
  );
}
