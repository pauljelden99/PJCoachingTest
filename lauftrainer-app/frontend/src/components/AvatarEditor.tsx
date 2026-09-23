"use client";

import { useRef, useState } from "react";

import { Avatar } from "@/components/Avatar";

const VIEWPORT_PX = 220;
const OUTPUT_PX = 320;
const MAX_ZOOM = 3;
const JPEG_QUALITY = 0.85;

interface CropState {
  imageSrc: string;
  imgW: number;
  imgH: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

function baseScale(imgW: number, imgH: number): number {
  return VIEWPORT_PX / Math.min(imgW, imgH);
}

function clampOffset(offset: number, dispSize: number): number {
  // Das Bild muss den quadratischen Viewport immer vollstaendig bedecken -
  // offset (Position der Bild-Ecke relativ zum Viewport) bleibt daher
  // zwischen "ganz rechts/unten anliegend" (VIEWPORT_PX - dispSize) und
  // "ganz links/oben anliegend" (0).
  const min = Math.min(0, VIEWPORT_PX - dispSize);
  return Math.min(0, Math.max(min, offset));
}

function centeredCrop(imageSrc: string, imgW: number, imgH: number): CropState {
  const scale = baseScale(imgW, imgH);
  return {
    imageSrc,
    imgW,
    imgH,
    zoom: 1,
    offsetX: (VIEWPORT_PX - imgW * scale) / 2,
    offsetY: (VIEWPORT_PX - imgH * scale) / 2,
  };
}

// Kleiner, abhaengigkeitsfreier Bildausschnitt-Editor (Zoom per Slider,
// Verschieben per Drag) statt einer externen Cropper-Bibliothek - die App
// hat bislang keine einzige UI-Abhaengigkeit dieser Art, und der Bedarf
// (quadratischer Ausschnitt, kein Rotieren/Freistellen) ist klein genug,
// um ihn direkt mit Canvas/Pointer-Events abzubilden.
function CropModal({ crop, onCancel, onConfirm }: { crop: CropState; onCancel: () => void; onConfirm: (dataUrl: string) => void }) {
  const [state, setState] = useState(crop);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  const scale = baseScale(state.imgW, state.imgH) * state.zoom;
  const dispW = state.imgW * scale;
  const dispH = state.imgH * scale;

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, offsetX: state.offsetX, offsetY: state.offsetY };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const nextOffsetX = clampOffset(drag.offsetX + (e.clientX - drag.startX), dispW);
    const nextOffsetY = clampOffset(drag.offsetY + (e.clientY - drag.startY), dispH);
    setState((s) => ({ ...s, offsetX: nextOffsetX, offsetY: nextOffsetY }));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleZoomChange(nextZoom: number) {
    const nextScale = baseScale(state.imgW, state.imgH) * nextZoom;
    setState((s) => ({
      ...s,
      zoom: nextZoom,
      offsetX: clampOffset(s.offsetX, state.imgW * nextScale),
      offsetY: clampOffset(s.offsetY, state.imgH * nextScale),
    }));
  }

  function handleConfirm() {
    const img = new Image();
    img.onload = () => {
      const outScale = OUTPUT_PX / VIEWPORT_PX;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_PX;
      canvas.height = OUTPUT_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, state.offsetX * outScale, state.offsetY * outScale, dispW * outScale, dispH * outScale);
      onConfirm(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.src = state.imageSrc;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
      <div className="card w-full max-w-sm space-y-4">
        <h3 className="text-sm font-medium text-ink">Bildausschnitt wählen</h3>
        <div
          className="mx-auto touch-none overflow-hidden rounded-full border border-mist/20 select-none"
          style={{ width: VIEWPORT_PX, height: VIEWPORT_PX, cursor: "grab" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Bild wird nur lokal fuers Zuschneiden angezeigt */}
          <img
            src={state.imageSrc}
            alt=""
            draggable={false}
            style={{
              width: dispW,
              height: dispH,
              transform: `translate(${state.offsetX}px, ${state.offsetY}px)`,
              maxWidth: "none",
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-mist">Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.05}
            value={state.zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="flex-1"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className="btn-primary" onClick={handleConfirm}>
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}

// Zeigt das Profilbild gross in einem Unterfenster (nach Klick aufs kleine
// Avatar-Icon) - "Bild ändern"/"Entfernen" leben bewusst hier statt direkt
// neben dem kleinen Avatar, da dieser Viewer der einzige Einstiegspunkt in
// die Bearbeitung ist.
function ViewerModal({
  name,
  value,
  onClose,
  onChangeClick,
  onRemove,
}: {
  name: string;
  value: string | null;
  onClose: () => void;
  onChangeClick: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" onClick={onClose}>
      <div className="card w-full max-w-xs space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center">
          <Avatar name={name} src={value} size={160} />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-outline" onClick={onChangeClick}>
            Bild ändern
          </button>
          {value && (
            <button type="button" className="btn-outline-danger" onClick={onRemove}>
              Entfernen
            </button>
          )}
        </div>
        <button type="button" className="text-xs text-mist transition-colors hover:text-ink" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}

// Editierbares Profilbild fuer den "Profilinformationen"-Abschnitt
// (AthleteProfileForm.tsx) - das kleine Avatar-Icon ist anklickbar und
// oeffnet ein Unterfenster mit einer groesseren Vorschau sowie "Bild
// ändern"/"Entfernen" (ViewerModal oben). Der Ausschnitt wird nach dem
// Zuschneiden nur lokal (onChange) gehalten, gespeichert wird er erst
// zusammen mit den uebrigen Profilinformationen ueber den regulaeren
// "Speichern"-Button des Formulars, nicht sofort beim Zuschneiden.
export function AvatarEditor({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string | null;
  onChange: (avatar: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<CropState | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Bitte eine Bilddatei auswählen");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => setPendingCrop(centeredCrop(reader.result as string, img.width, img.height));
      img.onerror = () => setError("Datei ist kein gültiges Bild");
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        className="rounded-full transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-moss/40"
        aria-label="Profilbild anzeigen"
      >
        <Avatar name={name} src={value} size={64} />
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      {error && <p className="text-sm text-danger">{error}</p>}
      {viewerOpen && (
        <ViewerModal
          name={name}
          value={value}
          onClose={() => setViewerOpen(false)}
          onChangeClick={() => {
            setViewerOpen(false);
            inputRef.current?.click();
          }}
          onRemove={() => {
            onChange(null);
            setViewerOpen(false);
          }}
        />
      )}
      {pendingCrop && (
        <CropModal
          crop={pendingCrop}
          onCancel={() => setPendingCrop(null)}
          onConfirm={(dataUrl) => {
            onChange(dataUrl);
            setPendingCrop(null);
          }}
        />
      )}
    </div>
  );
}
