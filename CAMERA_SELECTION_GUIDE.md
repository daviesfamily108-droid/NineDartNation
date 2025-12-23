# 📷 Multi-Camera Support for Calibration

## ✅ What's Implemented

### **Camera Detection & Selection**
- ✅ **Auto-detect all cameras** on startup
- ✅ **Camera types identified:**
  - 📺 OBS Virtual Camera (with icon)
  - 📹 Virtual cameras (Evostream, etc)
  - 🎥 USB cameras
  - 📱 Phone cameras (Front/Back)
  - Other connected cameras
- ✅ **Camera selector dropdown** showing all options
- ✅ **Friendly labels** with helpful hints
- ✅ **Remember last selected** camera (localStorage)
- ✅ **Real-time device detection** via devicechange listener

### **Features**
- ✅ Switch cameras without restarting
- ✅ Only show selector if multiple cameras detected
- ✅ Visual indication of active camera (✓ checkmark)
- ✅ Helpful tips for setting up each camera type
- ✅ Persistent camera preference

---

## 🎥 Supported Camera Types

### **1. OBS Virtual Camera** (Recommended)
**What it is:** Free broadcasting software with virtual camera output

**Setup:**
1. Download & install [OBS Studio](https://obsproject.com/)
2. Install [OBS Virtual Camera plugin](https://github.com/CatxFish/obs-virtual-camera)
3. Set up a scene with your dartboard
4. Start Virtual Camera
5. Select "OBS Virtual Cam" in Nine Dart Nation

**Advantages:**
- ✅ Works from PC/Laptop
- ✅ Can zoom/pan dartboard
- ✅ Can add overlays
- ✅ Professional grade
- ✅ Free & open source

**Tips:**
- Make sure dartboard fills most of frame
- Good lighting essential
- Keep resolution at least 1280x720

---

### **2. Phone Camera (via IP Camera App)**
**What it is:** Use your smartphone as a wireless camera

**Options:**
- **DroidCam** (Android) - Easiest
- **IP Webcam** (Android)
- **EpocCam** (iPhone)
- Any app that broadcasts over IP

**Setup (DroidCam example):**
1. Install DroidCam on phone
2. Download DroidCam client on PC
3. Connect via WiFi
4. It appears as a camera option
5. Select it in Nine Dart Nation

**Advantages:**
- ✅ High quality phone camera
- ✅ Wireless (no cables)
- ✅ Can position anywhere
- ✅ Works with existing phone

**Tips:**
- Good WiFi connection needed
- Position phone perpendicular to dartboard
- Make sure dartboard is well-lit

---

### **3. USB Webcam**
**What it is:** Any USB webcam you plug in

**Setup:**
1. Plug in USB camera
2. Wait for drivers to install
3. It appears automatically
4. Select it in Nine Dart Nation

**Advantages:**
- ✅ Plug & play
- ✅ Very stable
- ✅ Cheap option
- ✅ No software needed

**Tips:**
- Use good quality USB camera (1080p+)
- Mount on tripod for stability
- Position perpendicular to board

---

### **4. HDMI Capture Card**
**What it is:** Capture video from external devices

**Setup:**
1. Connect camera/device via HDMI to capture card
2. Connect capture card to PC via USB
3. Install capture card drivers
4. Select in Nine Dart Nation

**Advantages:**
- ✅ Can use any camera
- ✅ Professional cameras supported
- ✅ Mirror from other systems

**Tips:**
- Most common: Elgato, AVerMedia, Blackmagic
- Prices: $50-500+
- Great for high-quality setups

---

## 🖥️ How Camera Selection Works

### **Automatic Detection**
```
App starts
    ↓
navigator.mediaDevices.enumerateDevices()
    ↓
Find all videoinput devices
    ↓
Get label for each (OBS, USB, etc)
    ↓
Show in dropdown
```

### **Switching Cameras**
```
User clicks "📷 Select Camera"
    ↓
Dropdown shows all available
    ↓
User selects camera
    ↓
Stop current stream
    ↓
Request permission for new camera
    ↓
Start new camera
    ↓
Canvas displays new feed
    ↓
Save preference to localStorage
```

### **Camera Persistence**
```
Camera saved: localStorage["ndn-selected-camera"]
    ↓
Next time app loads
    ↓
If saved camera still available → Use it
    ↓
Otherwise → Use first available
    ↓
Remember for next session
```

---

## 🛠️ Implementation Details

### **Device Enumeration**
```tsx
const cameras = await navigator.mediaDevices.enumerateDevices();
const videoDevices = cameras.filter((d) => d.kind === "videoinput");
```

### **Friendly Labeling**
```tsx
// Automatically detects and adds emojis:
"OBS Virtual Camera" → "📺 OBS Virtual Camera (Virtual)"
"Front Camera" → "📱 Front Camera (Front)"
"USB2.0 Camera" → "🎥 USB2.0 Camera (USB)"
```

### **Camera Change**
```tsx
const handleCameraChange = async (cameraId: string) => {
  // Stop old stream
  stream?.getTracks().forEach(t => t.stop());
  
  // Request new camera
  const newStream = await getUserMedia({ 
    video: { deviceId: { exact: cameraId } }
  });
  
  // Display in video element
  videoRef.current.srcObject = newStream;
};
```

### **Device Change Listener**
```tsx
// Re-detect cameras when devices plugged/unplugged
navigator.mediaDevices.addEventListener("devicechange", () => {
  const cameras = await getAvailableCameras();
  setAvailableCameras(cameras);
});
```

---

## 📱 UI Elements

### **Camera Selector Button**
- Only shows if 2+ cameras detected
- Shows count: "📷 Select Camera (3)"
- Purple color for visibility

### **Camera Selector Dropdown**
```
┌─────────────────────────┐
│ 📷 Available Cameras    │
├─────────────────────────┤
│ ✓ 📺 OBS Virtual Cam    │  ← Selected
│   (Currently active)    │
├─────────────────────────┤
│   📱 Front Camera       │
│                         │
├─────────────────────────┤
│   🎥 USB Webcam         │
├─────────────────────────┤
│ 💡 Tips:                │
│ • OBS Virtual Cam...   │
│ • Phone Camera...      │
│ • USB Camera...        │
│ • External Camera...   │
└─────────────────────────┘
```

### **Camera Status Indicator**
```
✓ Camera Active         ← Green, shows it's ready
🎥 Initializing...      ← Yellow, loading
📷 Camera Access Req.   ← Red error
```

---

## 🔐 Permissions

### **Required Permissions**
```
navigator.mediaDevices.getUserMedia({
  video: { deviceId: { exact: selectedCameraId } },
  audio: false,  // No audio needed
})
```

### **What User Sees**
1. First use → Permission prompt
2. Grant → Camera starts
3. Deny → Error message with instructions
4. Later uses → No prompt (permission saved)

### **Browser Support**
- ✅ Chrome/Edge (best support)
- ✅ Firefox
- ✅ Safari (limited)
- ✅ Opera

---

## 💾 Storage

### **Selected Camera Preference**
```
localStorage["ndn-selected-camera"] = deviceId
```

**Example:**
```
"1a2b3c4d5e6f7g8h9i0j"
```

**What happens:**
- Saved when user selects camera
- Loaded on app startup
- If camera no longer available → Use first
- Never persists if permission denied

### **Camera Enumeration Data**
```
NOT stored (dynamic, changes on each run)
```

---

## 🎯 Use Cases

### **Scenario 1: PC with OBS Virtual Camera**
```
User has dartboard setup in OBS
1. Open Nine Dart Nation
2. Sees "📺 OBS Virtual Camera" auto-selected ✓
3. Starts calibrating immediately
4. Perfect! Can zoom/pan in OBS as needed
```

### **Scenario 2: Phone Camera Backup**
```
USB camera disconnected
1. Open Nine Dart Nation
2. Sees both USB and Phone cameras
3. Clicks "📷 Select Camera"
4. Switches to "📱 DroidCam"
5. Calibrates with phone instead
```

### **Scenario 3: Tournament Setup**
```
Multiple camera sources:
1. Phone camera on dartboard
2. HDMI capture from external camera
3. OBS Virtual for overlays
4. User can switch between for different purposes
```

---

## ✅ Testing Checklist

- [ ] Single camera (phone/USB) - auto-selects
- [ ] Multiple cameras - shows selector
- [ ] OBS Virtual Camera - detects & labels correctly
- [ ] Switch cameras - video changes
- [ ] Close selector - still works
- [ ] Unplug camera - list updates
- [ ] Plug in camera - appears in list
- [ ] Restart app - remembers selection
- [ ] Permission denied - shows error message
- [ ] Grant permission - works next time

---

## 🚀 Advanced Features (Future)

- [ ] Save multiple camera profiles
- [ ] Auto-switch if selected camera unavailable
- [ ] Camera quality/resolution picker
- [ ] Preview before selecting
- [ ] Camera test/diagnostic mode
- [ ] Camera focus/exposure controls

---

## 🐛 Troubleshooting

### **"No cameras found"**
- Check System Preferences → Security → Camera
- Make sure camera drivers installed
- Try unplugging/replugging USB camera
- Restart browser

### **OBS Virtual Camera not showing**
- Make sure OBS Studio is OPEN
- Check virtual camera plugin installed
- Restart OBS and browser
- Try "Virtual Camera" in Windows settings first

### **Phone camera not connecting**
- Check WiFi connection
- Make sure DroidCam app running on phone
- Try restarting both apps
- Check firewall isn't blocking

### **"Permission denied"**
- Go to System Settings → Privacy → Camera
- Grant Nine Dart Nation permission
- Restart browser
- Try incognito window

### **Camera freezes**
- Switch to different camera
- Close and reopen calibrator
- Disconnect and reconnect camera
- Restart browser

---

## 🎓 Summary

**What You Get:**
- Automatic detection of ALL cameras
- Easy switching between sources
- Works with OBS, phones, USB, capture cards
- Remembers your choice
- Professional-grade flexibility

**Best Setup:**
```
🏆 Recommended: OBS Virtual Camera
   - PC-based
   - Full control
   - Can zoom/pan
   - Professional

✅ Alternative: Phone Camera (DroidCam)
   - High quality
   - Wireless
   - Mobile friendly

✅ Alternative: USB Webcam
   - Simple
   - Plug & play
   - Stable
```

Start calibrating! Your dartboard camera is ready. 🎯

