"use client";

import { fetch } from "@libs/util/client";
import type { TileComponent } from "pigeon-maps";
import { useEffect, useRef, useState } from "react";

const MIN_ZOOM_FOR_CHECK = 18;
const TILE_SIZE = 256;

// Cache: tile key -> resolved dataURL (or null if it's a good tile)
const resolvedCache = new Map<string, string | null>();
// Cache: tile URL -> Promise<Blob>
const fetchCache = new Map<string, Promise<Blob>>();
// Reference placeholder blob size (fetched once on init)
let placeholderSize: number | null = null;
const placeholderInitPromise = fetchTileBlob(buildTileUrl(0, 0, 23))
  .then((blob) => {
    placeholderSize = blob.size;
  })
  .catch(() => {
    //
  });

function buildTileUrl(x: number, y: number, z: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

function fetchTileBlob(url: string): Promise<Blob> {
  const cached = fetchCache.get(url);
  if (cached) return cached;
  const promise = fetch(url).then((r) => r.blob());
  fetchCache.set(url, promise);
  return promise;
}

async function isPlaceholderTile(url: string): Promise<boolean> {
  await placeholderInitPromise;
  if (placeholderSize === null) return false;
  const blob = await fetchTileBlob(url);
  return blob.size === placeholderSize;
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

function cropAndScale(source: HTMLImageElement | string, quadX: number, quadY: number): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const half = TILE_SIZE / 2;
    if (typeof source === "string") {
      const img = new Image();
      img.src = source;
      ctx.drawImage(img, quadX * half, quadY * half, half, half, 0, 0, TILE_SIZE, TILE_SIZE);
    } else {
      ctx.drawImage(source, quadX * half, quadY * half, half, half, 0, 0, TILE_SIZE, TILE_SIZE);
    }
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

async function getFallbackDataUrl(x: number, y: number, z: number, depth = 0): Promise<string | null> {
  if (depth > 3 || z <= 0) return null;
  const parentX = Math.floor(x / 2);
  const parentY = Math.floor(y / 2);
  const parentZ = z - 1;
  const quadX = x % 2;
  const quadY = y % 2;
  const parentUrl = buildTileUrl(parentX, parentY, parentZ);
  try {
    const isPlaceholder = await isPlaceholderTile(parentUrl);
    if (isPlaceholder) {
      const parentFallback = await getFallbackDataUrl(parentX, parentY, parentZ, depth + 1);
      if (!parentFallback) return null;
      return cropAndScale(parentFallback, quadX, quadY);
    }
    const parentBlob = await fetchTileBlob(parentUrl);
    const parentImg = await loadImageFromBlob(parentBlob);
    return cropAndScale(parentImg, quadX, quadY);
  } catch {
    return null;
  }
}

async function resolveTile(x: number, y: number, z: number, url: string): Promise<string | null> {
  const isPlaceholder = await isPlaceholderTile(url);
  if (!isPlaceholder) return null;
  return getFallbackDataUrl(x, y, z);
}

export const OverzoomTile: TileComponent = ({ tile, tileLoaded }) => {
  const [src, setSrc] = useState(tile.url);
  const tileLoadedCalledRef = useRef(false);

  useEffect(() => {
    setSrc(tile.url);
    tileLoadedCalledRef.current = false;

    const [xStr, yStr, zStr] = tile.key.split("-");
    const z = Number(zStr);
    if (z < MIN_ZOOM_FOR_CHECK) return;

    const cacheKey = tile.key;
    if (resolvedCache.has(cacheKey)) {
      const cached = resolvedCache.get(cacheKey);
      if (cached) setSrc(cached);
      return;
    }

    void resolveTile(Number(xStr), Number(yStr), z, tile.url).then((dataUrl) => {
      resolvedCache.set(cacheKey, dataUrl);
      if (dataUrl) setSrc(dataUrl);
    });
  }, [tile.url, tile.key]);

  const handleLoad = () => {
    if (!tileLoadedCalledRef.current) {
      tileLoadedCalledRef.current = true;
      tileLoaded();
    }
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={src === tile.url ? tile.srcSet : undefined}
      width={tile.width}
      height={tile.height}
      loading="lazy"
      crossOrigin="anonymous"
      onLoad={handleLoad}
      alt=""
      style={{
        position: "absolute",
        left: tile.left,
        top: tile.top,
        willChange: "transform",
        transformOrigin: "top left",
        opacity: 1,
      }}
    />
  );
};
