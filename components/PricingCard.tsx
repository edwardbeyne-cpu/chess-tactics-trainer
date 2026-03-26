import Link from "next/link";

interface PricingCardProps {
  tier: "free" | "pro";
  price?: string;
  priceAnnual?: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
}

export default function PricingCard({
  tier,
  price,
  priceAnnual,
  features,
  cta,
  ctaHref,
  highlighted = false,
}: PricingCardProps) {
  return (
    <div
      style={{
        backgroundColor: highlighted ? "#0d2218" : "#1a1a2e",
        border: `2px solid ${highlighted ? "#4ade80" : "#2e3a5c"}`,
        borderRadius: "16px",
        padding: "2rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        position: "relative",
      }}
    >
      {highlighted && (
        <div
          style={{
            position: "absolute",
            top: "-14px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#4ade80",
            color: "#0f0f1a",
            padding: "0.25rem 1rem",
            borderRadius: "20px",
            fontSize: "0.75rem",
            fontWeight: "bold",
            whiteSpace: "nowrap",
          }}
        >
          MOST POPULAR
        </div>
      )}

      <div>
        <div
          style={{
            color: highlighted ? "#4ade80" : "#94a3b8",
            fontSize: "0.8rem",
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "0.5rem",
          }}
        >
          {tier === "free" ? "Free" : "Pro"}
        </div>
        {price ? (
          <div>
            <span
              style={{ color: "#e2e8f0", fontSize: "2.5rem", fontWeight: "bold" }}
            >
              {price}
            </span>
            <span style={{ color: "#64748b", fontSize: "0.9rem" }}>/month</span>
            {priceAnnual && (
              <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                or {priceAnnual}/year (save 38%)
              </div>
            )}
          </div>
        ) : (
          <div
            style={{ color: "#e2e8f0", fontSize: "2.5rem", fontWeight: "bold" }}
          >
            $0
          </div>
        )}
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {features.map((f, i) => (
          <li
            key={i}
            style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", color: "#cbd5e1", fontSize: "0.9rem" }}
          >
            <span style={{ color: "#4ade80", flexShrink: 0, marginTop: "2px" }}>✓</span>
            {f}
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        style={{
          backgroundColor: highlighted ? "#4ade80" : "transparent",
          color: highlighted ? "#0f0f1a" : "#4ade80",
          border: `2px solid ${highlighted ? "#4ade80" : "#4ade80"}`,
          borderRadius: "8px",
          padding: "0.75rem",
          textAlign: "center",
          textDecoration: "none",
          fontWeight: "bold",
          fontSize: "0.95rem",
          display: "block",
        }}
      >
        {cta}
      </Link>
    </div>
  );
}
