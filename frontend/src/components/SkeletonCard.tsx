export function SkeletonCard() {
  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        padding: "24px",
        border: "1px solid #f3f4f6",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
      }}
    >
      <div
        style={{
          height: "16px",
          background: "#f3f4f6",
          borderRadius: "4px",
          marginBottom: "12px",
          width: "60%",
          animation: "shimmer 1.5s infinite"
        }}
      />
      <div
        style={{
          height: "12px",
          background: "#f3f4f6",
          borderRadius: "4px",
          marginBottom: "8px",
          width: "90%",
          animation: "shimmer 1.5s infinite"
        }}
      />
      <div
        style={{
          height: "12px",
          background: "#f3f4f6",
          borderRadius: "4px",
          width: "75%",
          animation: "shimmer 1.5s infinite"
        }}
      />
      <style>{`
        @keyframes shimmer {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
