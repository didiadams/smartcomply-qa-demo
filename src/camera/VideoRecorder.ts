export class VideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  start(stream: MediaStream): void {
    this.chunks = [];

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    this.recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 250_000, // ~1.4 MB for 45s — keeps file under server upload limit
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.recorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        reject(new Error("Recorder is not active"));
        return;
      }

      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: "video/webm" });
        this.chunks = [];
        resolve(blob);
      };

      this.recorder.onerror = () => {
        reject(new Error("Recording failed"));
      };

      this.recorder.stop();
    });
  }

  isRecording(): boolean {
    return this.recorder?.state === "recording";
  }
}
