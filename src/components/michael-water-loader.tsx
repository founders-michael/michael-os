import Image from "next/image";

export type MichaelWaterLoaderSize = "compact" | "default" | "large";

/**
 * The Michael mark filling from the bottom. Both layers are the logo image
 * itself, never a recoloured shape, so the colours match the logo exactly in
 * either theme: a faded copy is the empty mark, and the full-colour copy is
 * revealed by a rising, wave-edged clip.
 */
export default function MichaelWaterLoader({ label = "Loading MichaelOS", size = "default" }: { label?: string; size?: MichaelWaterLoaderSize }) {
  return <span className={`michael-water-loader michael-water-loader-${size}`} role="status" aria-label={label}>
    <Image className="michael-water-base" src="/michael-mark.png" alt="" width={300} height={180} priority />
    <span className="michael-water-fill" aria-hidden="true">
      <Image className="michael-water-logo" src="/michael-mark.png" alt="" width={300} height={180} priority />
    </span>
  </span>;
}
