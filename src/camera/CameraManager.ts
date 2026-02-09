export class CameraManager {
  private stream: MediaStream | null = null;

  async open(constraints?: MediaStreamConstraints): Promise<MediaStream> {
    const defaults: MediaStreamConstraints = {
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    };

    this.stream = await navigator.mediaDevices.getUserMedia(
      constraints || defaults
    );

    return this.stream;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
