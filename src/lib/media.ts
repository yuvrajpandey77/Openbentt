/** Browser-side media helpers for multimodal chat (no server). */

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function assertImageSize(file: File): void {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (max ~${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB)`);
  }
}

/** Grab a mid-frame PNG data URL from a video file (vision models see it as an image). */
export function extractVideoFrameDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
      } catch {
        video.currentTime = 0.5;
      }
    };

    video.onseeked = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          cleanup();
          reject(new Error("Could not read video dimensions"));
          return;
        }
        const canvas = document.createElement("canvas");
        const max = 1024;
        const scale = Math.min(1, max / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          reject(new Error("Canvas unsupported"));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error("Video frame failed"));
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Video could not be decoded in browser"));
    };
  });
}
