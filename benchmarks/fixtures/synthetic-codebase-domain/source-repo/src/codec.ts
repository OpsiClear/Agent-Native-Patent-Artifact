// Compress gaussian payloads into indexed atlas frames to reduce bandwidth.
export class GaussianCodec {
  encodeFrame(points) {
    return quantize(points);
  }
}

export function quantize(points) {
  return points.map((p) => p);
}

export function streamAtlas(frame) {
  return frame;
}
