import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { blogPosts, getPostBySlug } from "@/lib/blog-posts";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  const description = post.excerpt.slice(0, 150);

  return {
    title: `${post.title} | Chess Tactics Trainer`,
    description,
  };
}

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

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) notFound();

  const catStyle = getCategoryStyle(post.category);

  // Related posts: up to 2 other posts
  const related = blogPosts.filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0f1a" }}>
      <MarketingNav />

      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 1.5rem 6rem" }}>
        {/* Breadcrumb */}
        <nav style={{ marginBottom: "2rem" }}>
          <Link
            href="/blog"
            style={{ color: "#64748b", fontSize: "0.85rem", textDecoration: "none" }}
          >
            ← Blog
          </Link>
        </nav>

        {/* Category tag */}
        <div style={{ marginBottom: "1rem" }}>
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
        <h1
          style={{
            color: "#e2e8f0",
            fontSize: "clamp(1.6rem, 4vw, 2.2rem)",
            fontWeight: "900",
            lineHeight: 1.25,
            marginBottom: "1rem",
          }}
        >
          {post.title}
        </h1>

        {/* Meta */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            color: "#475569",
            fontSize: "0.82rem",
            marginBottom: "2.5rem",
            paddingBottom: "2rem",
            borderBottom: "1px solid #1e2d45",
          }}
        >
          <span>{post.date}</span>
          <span>·</span>
          <span>{post.readTime} min read</span>
        </div>

        {/* Article body */}
        <div
          dangerouslySetInnerHTML={{ __html: post.content }}
          style={{
            color: "#cbd5e1",
            fontSize: "1rem",
            lineHeight: 1.8,
          }}
        />

        {/* Post-content styles via a style tag */}
        <style>{`
          .blog-content h2,
          main h2 {
            color: #e2e8f0;
            font-size: 1.25rem;
            font-weight: 700;
            margin: 2rem 0 0.75rem;
            line-height: 1.3;
          }
          main p {
            margin: 0 0 1.25rem;
          }
          main strong {
            color: #e2e8f0;
          }
          main a {
            color: #f97316;
            text-decoration: underline;
            text-underline-offset: 3px;
          }
          main a:hover {
            color: #fb923c;
          }
        `}</style>

        {/* CTA */}
        <div
          style={{
            marginTop: "3rem",
            backgroundColor: "#111827",
            border: "1px solid #f97316",
            borderRadius: "14px",
            padding: "1.75rem",
          }}
        >
          <div
            style={{
              color: "#f97316",
              fontSize: "0.75rem",
              fontWeight: "700",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "0.5rem",
            }}
          >
            Put this into practice
          </div>
          <p
            style={{
              color: "#e2e8f0",
              fontWeight: "700",
              fontSize: "1.05rem",
              marginBottom: "0.5rem",
            }}
          >
            See your weak patterns →
          </p>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
            Chess Tactics Trainer analyzes your games to find the patterns costing you the most rating
            points, then trains them with spaced repetition until they&apos;re automatic.
          </p>
          <Link
            href="/app/calibration"
            style={{
              display: "inline-block",
              backgroundColor: "#f97316",
              color: "#fff",
              padding: "0.75rem 1.75rem",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: "700",
              fontSize: "0.9rem",
            }}
          >
            Start Free →
          </Link>
        </div>

        {/* Related posts */}
        {related.length > 0 && (
          <div style={{ marginTop: "3.5rem" }}>
            <h2
              style={{
                color: "#94a3b8",
                fontSize: "0.8rem",
                fontWeight: "700",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "1rem",
              }}
            >
              More articles
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {related.map((rel) => {
                const relCat = getCategoryStyle(rel.category);
                return (
                  <Link
                    key={rel.slug}
                    href={`/blog/${rel.slug}`}
                    style={{ textDecoration: "none" }}
                  >
                    <div
                      style={{
                        backgroundColor: "#111827",
                        border: "1px solid #1e2d45",
                        borderRadius: "10px",
                        padding: "1rem 1.25rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.35rem",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          backgroundColor: relCat.bg,
                          border: `1px solid ${relCat.border}`,
                          borderRadius: "4px",
                          padding: "0.15rem 0.5rem",
                          color: relCat.text,
                          fontSize: "0.68rem",
                          fontWeight: "700",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          width: "fit-content",
                        }}
                      >
                        {rel.category}
                      </span>
                      <span
                        style={{
                          color: "#e2e8f0",
                          fontSize: "0.9rem",
                          fontWeight: "600",
                          lineHeight: 1.4,
                        }}
                      >
                        {rel.title}
                      </span>
                      <span style={{ color: "#475569", fontSize: "0.78rem" }}>
                        {rel.readTime} min read
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
