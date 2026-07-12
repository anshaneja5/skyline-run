// Gyroscope steering for phones: roll the device to steer, pitch it like a
// yoke to climb/dive. iOS needs an explicit permission request from a user
// gesture, so requestEnable() must be called from a tap handler.

const DEADZONE = 3; // degrees of tilt ignored around neutral
const MAX_TILT = 22; // degrees of tilt for full deflection

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const normalize = (deg: number) => {
  if (Math.abs(deg) < DEADZONE) return 0;
  return clamp((deg - Math.sign(deg) * DEADZONE) / (MAX_TILT - DEADZONE), -1, 1);
};

class TiltControl {
  enabled = false;
  steer = 0; // -1..1
  climb = 0; // -1..1
  private neutralPitch: number | null = null;

  /** Must be called from a user gesture (iOS permission prompt). */
  async requestEnable(): Promise<boolean> {
    if (this.enabled) return true;
    const DOE = (window as any).DeviceOrientationEvent;
    if (!DOE) return false;
    if (typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    } else if (!('ondeviceorientation' in window)) {
      return false;
    }
    window.addEventListener('deviceorientation', this.onOrient);
    this.enabled = true;
    return true;
  }

  /** Treat the phone's current pitch as level flight (called on game start). */
  recalibrate() {
    this.neutralPitch = null;
  }

  private onOrient = (e: DeviceOrientationEvent) => {
    const beta = e.beta ?? 0; // front-back tilt in portrait
    const gamma = e.gamma ?? 0; // left-right tilt in portrait
    // remap axes for the current screen orientation
    const angle = (screen.orientation?.angle ?? (window as any).orientation ?? 0) as number;
    let roll: number;
    let pitch: number;
    if (angle === 90) {
      roll = beta;
      pitch = -gamma;
    } else if (angle === 270 || angle === -90) {
      roll = -beta;
      pitch = gamma;
    } else if (angle === 180) {
      roll = -gamma;
      pitch = -beta;
    } else {
      roll = gamma;
      pitch = beta;
    }
    // whatever angle the player holds the phone at when starting is "level"
    if (this.neutralPitch === null) this.neutralPitch = pitch;
    this.steer = normalize(roll);
    // pull the top of the phone toward you (like a yoke) to climb
    this.climb = normalize(pitch - this.neutralPitch);
  };
}

export const tilt = new TiltControl();
