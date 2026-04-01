import type { Metadata } from "next";

const siteName = "bitmagnet（比特磁铁）";

type SEOInput = {
  title: string;
  description: string;
  keywords: string[];
  path: string;
  noIndex?: boolean;
};

export function buildMetadata(input: SEOInput): Metadata {
  const fullTitle = `${input.title} | ${siteName}`;

  return {
    title: fullTitle,
    description: input.description,
    keywords: input.keywords,
    alternates: {
      canonical: input.path
    },
    openGraph: {
      title: fullTitle,
      description: input.description,
      url: input.path,
      siteName,
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: input.description
    },
    robots: input.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true }
  };
}

