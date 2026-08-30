import { useEffect, useRef, useState, useCallback } from "react";

export function useVoice() {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);

  const stopLevelMonitor = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setLevel(0);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      ctxRef.current = audioCtx;
      analyserRef.current = analyser;

      const monitor = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(avg / 255);
        rafRef.current = requestAnimationFrame(monitor);
      };
      monitor();

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start();
      recorderRef.current = rec;
      setState("recording");
    } catch {
      setState("idle");
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        stopLevelMonitor();
        resolve(null);
        return;
      }
      rec.onstop = () => {
        stopLevelMonitor();
        stream.getTracks().forEach((t) => t.stop());
        ctxRef.current?.close();
        ctxRef.current = null;
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        resolve(blob.size > 100 ? blob : null);
      };
      const stream = rec.stream;
      rec.stop();
      recorderRef.current = null;
      setState("processing");
    });
  }, [stopLevelMonitor]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
    stopLevelMonitor();
    ctxRef.current?.close();
    ctxRef.current = null;
    setState("idle");
  }, [stopLevelMonitor]);

  return { state, level, startRecording, stopRecording, cancel };
}
