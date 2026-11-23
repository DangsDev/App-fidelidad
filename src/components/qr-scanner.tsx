'use client';

import { useEffect, useRef, useState } from 'react';

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type BarcodeWindow = Window & { BarcodeDetector?: new (options?: { formats: string[] }) => Detector };

export function QrScanner({ onToken, onClose }: { onToken: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState('Solicitando acceso a la cámara…');

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = async () => {
      try {
        const DetectorClass = (window as BarcodeWindow).BarcodeDetector;
        if (!DetectorClass) { setMessage('Este navegador no admite lectura QR automática. Ingresa el código manualmente.'); return; }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setMessage('Apunta la cámara al código QR del cliente.');
        const detector = new DetectorClass({ formats: ['qr_code'] });
        const scan = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) { onToken(codes[0].rawValue); return; }
          } catch { /* El siguiente ciclo vuelve a intentarlo. */ }
          timer = setTimeout(scan, 250);
        };
        scan();
      } catch {
        setMessage('No se pudo abrir la cámara. Revisa el permiso o ingresa el código manualmente.');
      }
    };
    start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onToken]);

  return <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Escanear QR">
    <div className="w-full max-w-md rounded-2xl bg-white p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Escanear tarjeta</h2><button type="button" onClick={onClose} className="min-h-touch px-3 text-sm">Cerrar</button></div>
      <video ref={videoRef} className="mt-3 aspect-square w-full rounded-xl bg-stone-900 object-cover" muted playsInline />
      <p className="mt-3 text-sm text-stone-600">{message}</p>
    </div>
  </div>;
}
