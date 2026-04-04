import type { Metadata } from "next";
import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { blogPosts } from "@/lib/blog-posts";

export const metadata: Metadata = {
  title: "Blog | Chess Tactics Trainer",
  description:
    "Science-backed chess improvement articles: spaced repetition, tactics training, pattern recognition, and how to break rating plateaus.",
};

const categoryColors: Record<string, { bg: string; border: string; text: string }> = {
  "Training Science": { bg: "#0d1f3c", border: "#1e3a6e", text: "#60a5fa" },
  "Training Tips": { bg: "#0d2218", border: "#1a4a2a", text: "#4ade80" },
  "Improvement": { bg: "#1a1500", border: "#3d3200", text: "#f59e0b" },
  "Tactics Guide": { bg: "#1a0d0d", border: "#4a1a1a", text: "#f97316" },
  "Chess Fundamentals": { bg: "#150e1f", border: "#3a1f5a", text: "#a78bfa" },
};

function getCategoryStyle(category: string) {
  return (
    categoryColors[category] ?? {
      bg: "#1a1a2e",
      border: "#2e3a5c",
      text: "#94a3b8",
    }
  );
}

export default function BlogIndexPage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0f1a" }}>
      <MarketingNav />

      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "4rem 1.5rem 6rem" }}>
        {/* Header */}
        <div style={{ marginBottom: "3rem" }}>
          <h1
            style={{
              color: "#e2e8f0",
              fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
              fontWeight: "900",
              marginBottom: "0.75rem",
              lineHeight: 1.2,
            }}
          >
            Chess Improvement <span style={{ color: "#f97316" }}>Blog</span>
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "1rem", maxWidth: "520px" }}>
            Science-backed articles on tactics training, pattern recognition, and how to actually improve at chess.
          </p>
        </div>

        <style>{`
          .blog-card {
            background-color: #111827;
            border: 1px solid #1e2d45;
            border-radius: 14px;
            padding: 1.5rem;
            height: 100%;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            transition: border-color 0.15s, transform 0.15s;
            cursor: pointer;
          }
          .blog-card:hover {
            border-color: #f97316;
            transform: translateY(-2px);
          }
        `}</style>

        {/* Card grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "1.5rem",
          }}
        >
          {blogPosts.map((post) => {
            const catStyle = getCategoryStyle(post.category);
            return (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                style={{ textDecoration: "none" }}
              >
                <article className="blog-card">
                  {/* Category tag */}
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        backgroundColor: catStyle.bg,
                        border: `1px solid ${catStyle.border}`,
                        borderRadius: "6px",
                        padding: "0.2rem 0.6rem",
                        color: catStyle.text,
                        fontSize: "0.72rem",
                        fontWeight: "700",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}
                    >
                      {post.category}
                    </span>
                  </div>

                  {/* Title */}
                  <h2
                    style={{
                      color: "#e2e8f0",
                      fontSize: "1rem",
                      fontWeight: "700",
                      lineHeight: 1.4,
                      margin: 0,
                      flex: 1,
                    }}
                  >
                    {post.title}
                  </h2>

                  {/* Excerpt */}
                  <p
                    style={{
                      color: "#94a3b8",
                      fontSize: "0.85rem",
                      lineHeight: 1.6,
                      margin: 0,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {post.excerpt}
                  </p>

                  {/* Meta */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      color: "#475569",
                      fontSize: "0.78rem",
                      marginTop: "0.25rem",
                    }}
                  >
                    <span>{post.date}</span>
                    <span>·</span>
                    <span>{post.readTime} min read</span>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>

        {/* CTA banner */}
        <div
          style={{
            marginTop: "4rem",
            backgroundColor: "#111827",
            border: "1px solid #f97316",
            borderRadius: "14px",
            padding: "2rem 2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ color: "#e2e8f0", fontWeight: "700", fontSize: "1.05rem", marginBottom: "0.4rem" }}>
              Ready to put this into practice?
            </div>
            <div style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
              See your weak patterns and start training with spaced repetition — free.
            </div>
          </div>
          <Link
            href="/app/calibration"
            style={{
              backgroundColor: "#f97316",
              color: "#fff",
              padding: "0.75rem 1.75rem",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "700",
              fontSize: "0.9rem",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Start Free →
          </Link>
        </div>
      </main>
    </div>
  );
}
