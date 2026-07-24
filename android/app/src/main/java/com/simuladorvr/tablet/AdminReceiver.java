package com.simuladorvr.tablet;

import android.app.admin.DeviceAdminReceiver;

/**
 * Device admin component. Its only job is to exist so the app can be promoted
 * to Device Owner (via `adb shell dpm set-device-owner`), which unlocks true
 * lock-task kiosk mode: the app auto-locks, hides the system bars (nav + status)
 * and can't be exited — none of which screen pinning can do.
 */
public class AdminReceiver extends DeviceAdminReceiver {
}
