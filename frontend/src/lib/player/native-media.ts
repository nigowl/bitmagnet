type WebKitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type PictureInPictureDocument = Document & {
  pictureInPictureEnabled?: boolean;
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
};

type PictureInPictureVideo = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<void>;
  webkitEnterFullscreen?: () => void;
};

export function playNativeVideo(video: HTMLVideoElement): Promise<void> {
  return video.play();
}

export function pauseNativeVideo(video: HTMLVideoElement): void {
  video.pause();
}

export function setNativePlaybackRate(video: HTMLVideoElement, rate: number): number {
  const nextRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  video.playbackRate = nextRate;
  return nextRate;
}

export function isElementFullscreen(stage: HTMLElement, ownerDocument: Document = document): boolean {
  const doc = ownerDocument as WebKitDocument;
  const current = ownerDocument.fullscreenElement || doc.webkitFullscreenElement || null;
  return Boolean(current && stage.contains(current));
}

export async function toggleNativeFullscreen(
  stage: HTMLElement | null,
  video: HTMLVideoElement | null,
  ownerDocument: Document = document
): Promise<void> {
  const doc = ownerDocument as WebKitDocument;
  const current = ownerDocument.fullscreenElement || doc.webkitFullscreenElement || null;

  if (current) {
    if (ownerDocument.exitFullscreen) {
      await ownerDocument.exitFullscreen();
      return;
    }
    if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
    return;
  }

  const stageElement = stage as FullscreenElement | null;
  if (stageElement) {
    if (stageElement.requestFullscreen) {
      await stageElement.requestFullscreen();
      return;
    }
    if (stageElement.webkitRequestFullscreen) {
      await stageElement.webkitRequestFullscreen();
      return;
    }
  }

  const videoElement = video as PictureInPictureVideo | null;
  if (videoElement && typeof videoElement.webkitEnterFullscreen === "function") {
    videoElement.webkitEnterFullscreen();
  }
}

export async function toggleNativePictureInPicture(
  video: HTMLVideoElement,
  ownerDocument: Document = document
): Promise<void> {
  const pipDocument = ownerDocument as PictureInPictureDocument;
  const pipVideo = video as PictureInPictureVideo;

  if (!pipDocument.pictureInPictureEnabled || typeof pipVideo.requestPictureInPicture !== "function") {
    return;
  }

  if (pipDocument.pictureInPictureElement) {
    if (typeof pipDocument.exitPictureInPicture === "function") {
      await pipDocument.exitPictureInPicture();
    }
    return;
  }

  await pipVideo.requestPictureInPicture();
}
