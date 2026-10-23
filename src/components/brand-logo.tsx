import Image from "next/image";

/** Shared artwork supplied for the Michael brand. */
export default function BrandLogo() {
  return <Image className="brand-image" src="/michael-logo.png" alt="" width={917} height={180} />;
}
