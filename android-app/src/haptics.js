/**
 * OfferPilot Android - 触感震动反馈支持 (Haptics)
 */
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export async function triggerHaptic(type = 'light') {
  try {
    const isHapticEnabled = localStorage.getItem('offerpilot_haptic') !== 'false';
    if (!isHapticEnabled) return;

    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      if (type === 'medium') {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } else if (type === 'heavy') {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } else {
        await Haptics.impact({ style: ImpactStyle.Light });
      }
    } else if (navigator.vibrate) {
      navigator.vibrate(type === 'heavy' ? [40, 60, 40] : (type === 'medium' ? 30 : 15));
    }
  } catch (e) {}
}
