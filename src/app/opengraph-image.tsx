import { ImageResponse } from "next/og";

export const alt = "MichaelOS — your AI planning assistant";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social card for the public landing page. Drawn rather than shipped as a
 * static file so it stays in step with the brand tokens in `globals.css`.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#f7f8f4",
          padding: "96px",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, color: "#254b3a", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          MichaelOS
        </div>
        <div style={{ display: "flex", marginTop: 32, fontSize: 84, lineHeight: 1.1, color: "#1d2922" }}>
          Your AI planning assistant.
        </div>
        <div style={{ display: "flex", marginTop: 32, fontSize: 36, color: "#4a5a50" }}>
          Grounded in the tasks, goals and calendar you already keep.
        </div>
        <div style={{ display: "flex", marginTop: 48, height: 8, width: 160, backgroundColor: "#254b3a" }} />
      </div>
    ),
    size,
  );
}
