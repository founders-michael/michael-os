import Image from "next/image";

export type MichaelWaterLoaderSize = "compact" | "default" | "large";

export default function MichaelWaterLoader({ label = "Loading MichaelOS", size = "default" }: { label?: string; size?: MichaelWaterLoaderSize }) {
  return <span className={`michael-water-loader michael-water-loader-${size}`} role="status" aria-label={label}>
    <Image className="michael-water-base" src="/michael-mark.png" alt="" width={76} height={46} priority />
    <span className="michael-water-mask" aria-hidden="true"><span className="michael-water-liquid" /></span>
  </span>;
}
