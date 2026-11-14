/**
 * Renders a JSON-LD graph. The payload is built server-side from our own
 * constants, never from user input, so there is no injected-content path here.
 */
export default function StructuredData({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
