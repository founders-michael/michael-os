import Image from "next/image";

/** Shared artwork supplied for the Michael brand. */
export default function BrandLogo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <>
      <Image className="brand-image" src="/michael-logo.png" alt="" width={917} height={180} />
      <Image className="brand-mark-image" src="/michael-mark.png" alt="" width={300} height={180} />
    </>;
  }

  return <Image className="brand-image" src="/michael-logo.png" alt="" width={917} height={180} />;
}
