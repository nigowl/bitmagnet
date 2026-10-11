"use client";

import { Image, type ImageProps } from "@mantine/core";
import { useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from "react";
import { getAuthHeaders } from "@/lib/api";

const COVER_RETRY_INTERVAL_MS = 1000;

function isCoverAPIURL(value: string): boolean {
  return /\/api\/media\/[^/]+\/cover\/(poster|backdrop)\/(sm|md|lg|xl)(\?|$)/.test(value);
}

function withQueryValue(url: string, key: string, value: string): string {
  const [base, hash = ""] = url.split("#");
  const connector = base.includes("?") ? "&" : "?";
  return `${base}${connector}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash ? `#${hash}` : ""}`;
}

type CoverImageProps = ImageProps & {
  autoRetry?: boolean;
  alt?: string;
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
  decoding?: ImgHTMLAttributes<HTMLImageElement>["decoding"];
};

export function CoverImage({ src, autoRetry = true, alt = "", loading, decoding, ...rest }: CoverImageProps) {
  const [revision, setRevision] = useState(0);
  const [visibleSource, setVisibleSource] = useState("");
  const [pending, setPending] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const source = typeof src === "string" ? src : "";
  const coverAPI = autoRetry && source !== "" && isCoverAPIURL(source);
  const fullWidth = typeof rest.className === "string" &&
    (rest.className.includes("media-wall-poster") || rest.className.includes("topic-card-cover"));

  useEffect(() => {
    setPending(coverAPI);
    if (!coverAPI) return undefined;

    const image = imageRef.current;
    if (!image || typeof IntersectionObserver === "undefined") {
      setVisibleSource(source);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisibleSource(source);
      observer.disconnect();
    }, { rootMargin: "240px" });
    observer.observe(image);

    return () => observer.disconnect();
  }, [coverAPI, source]);

  useEffect(() => {
    if (!coverAPI || visibleSource !== source) return undefined;

    let active = true;
    let timer: number | null = null;
    let inflight = false;

    const probe = async () => {
      if (!active || inflight) return;
      inflight = true;
      try {
        const response = await fetch(withQueryValue(source, "__cover_probe", String(Date.now())), {
          method: "HEAD",
          cache: "no-store",
          credentials: "include",
          headers: getAuthHeaders()
        });
        if (!active) return;

        if (response.status === 200) {
          setPending(false);
          setRevision((current) => current + 1);
          if (timer != null) {
            window.clearInterval(timer);
            timer = null;
          }
          return;
        }

        if (response.status === 202) {
          setPending(true);
          return;
        }

        if (response.status === 404 || response.status === 410) {
          setPending(false);
          if (timer != null) {
            window.clearInterval(timer);
            timer = null;
          }
        }
      } catch {
        // Ignore transient network issues; next interval retries automatically.
      } finally {
        inflight = false;
      }
    };

    void probe();
    timer = window.setInterval(() => {
      void probe();
    }, COVER_RETRY_INTERVAL_MS);

    return () => {
      active = false;
      if (timer != null) {
        window.clearInterval(timer);
      }
    };
  }, [coverAPI, source, visibleSource]);

  const resolvedSrc = useMemo(() => {
    if (!source || !coverAPI) return src;
    if (visibleSource !== source) return undefined;
    return withQueryValue(source, "__cover_retry", String(revision));
  }, [coverAPI, revision, source, src, visibleSource]);

  return (
    <span className={`cover-image-frame${fullWidth ? " cover-image-frame-full" : ""}`} aria-busy={pending}>
      <Image {...rest} ref={imageRef} src={resolvedSrc} alt={alt} component="img" loading={loading} decoding={decoding} />
      {pending && visibleSource === source ? (
        <span className="cover-image-loading" aria-hidden="true">
          <span className="cover-image-loading-spinner" />
        </span>
      ) : null}
    </span>
  );
}
