import { useRef, useCallback } from "react";

interface ComponentPreviewProps {
  code: string;
  height?: number;
  showFullscreenButton?: boolean;
}

export function ComponentPreview({ code, height = 200, showFullscreenButton = false }: ComponentPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const goFullscreen = useCallback(() => {
    iframeRef.current?.requestFullscreen?.();
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <iframe
        ref={iframeRef}
        srcDoc={code}
        sandbox="allow-scripts allow-same-origin"
        allow="fullscreen"
        style={{
          width: "100%",
          height,
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          background: "#fff",
          display: "block",
        }}
        title="Preview"
      />
      {showFullscreenButton && (
        <button onClick={goFullscreen} style={fullscreenBtnStyle} title="Fullscreen">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
          </svg>
        </button>
      )}
    </div>
  );
}

const fullscreenBtnStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 30,
  height: 30,
  borderRadius: "6px",
  border: "1px solid rgba(0,0,0,0.15)",
  background: "rgba(255,255,255,0.85)",
  color: "#333",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  backdropFilter: "blur(4px)",
  opacity: 0.6,
  transition: "opacity 0.15s",
};
