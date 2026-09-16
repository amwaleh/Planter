import { useEffect, useRef, useState } from "react";
import { getCropImage } from "../api";
import type { CropImageMetadata } from "../types";

export function PlantImage({
  name,
  title,
  alt,
  image,
}: {
  name: string;
  title: string;
  alt: string;
  image?: CropImageMetadata | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [details, setDetails] = useState<CropImageMetadata | null>(image ?? null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || details || failed) return;
    let cancelled = false;
    let retryTimer: number | undefined;
    void getCropImage(name, title)
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch((error: Error & { status?: number }) => {
        if (cancelled) return;
        if ((error.status ?? 500) >= 500 && attempt < 2) {
          retryTimer = window.setTimeout(
            () => setAttempt((current) => current + 1),
            1000 * (attempt + 1),
          );
        } else {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [attempt, details, failed, name, title, visible]);

  return (
    <div className="plant-image" ref={container}>
      {details ? (
        <>
          <img src={details.image_url} alt={details.alt_text || alt} loading="lazy" />
          <a href={details.source_page_url} target="_blank" rel="noreferrer">
            {details.creator} · {details.license}
          </a>
        </>
      ) : (
        <div className="plant-image-fallback" role="img" aria-label={`${alt}; image unavailable`}>
          {failed ? "Image unavailable" : "Loading image..."}
        </div>
      )}
    </div>
  );
}
