# 📺 Camera Selection - Visual Guide

## What You'll See

### **When You Open Calibrator**

```
┌─────────────────────────────────────────┐
│  🎯 Dartboard Calibration               │
│  Point your camera at your dartboard... │
├─────────────────────────────────────────┤
│                                         │
│  Calibration Confidence                 │
│  ████░░░░░░ 0% • (waiting)              │
│                                         │
│  📷 Select Camera (3)  ← Click if 2+    │
│                                         │
│  ✓ Camera Active                        │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  [LIVE DARTBOARD FROM CAMERA]   │   │
│  │  🎯 Target zones show           │   │
│  │  Colored circles guide you      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  D20  D6  D3  D11 Bull  ← Status bars  │
│  🔴  🔵  🟠  🟡  ⚪                     │
│                                         │
│  📍 Step 1/5: Click D20 (Top)           │
│  Click the exact location on board      │
│                                         │
│  [← Undo] [Reset All]                  │
│                                         │
└─────────────────────────────────────────┘
```

---

## Camera Selector Dropdown

### **Click "📷 Select Camera (3)" to see this:**

```
┌──────────────────────────────────────┐
│ 📷 Available Cameras                 │
├──────────────────────────────────────┤
│                                      │
│ ✓ 📺 OBS Virtual Camera (Virtual)   │
│   Currently active                   │ ← Selected
│                                      │
│ 📱 DroidCam (Front)                 │
│                                      │
│ 🎥 USB Logitech Webcam              │
│                                      │
│ 📹 HDMI Capture Card                │
│                                      │
├──────────────────────────────────────┤
│ 💡 Tips:                             │
│ • 📺 OBS Virtual Cam - Use OBS      │
│   Studio with virtual camera        │
│ • 📱 Phone Camera - DroidCam or     │
│   IP Webcam over WiFi              │
│ • 🎥 USB Camera - Plug & play       │
│ • 📹 External Camera - HDMI or      │
│   USB capture card                  │
└──────────────────────────────────────┘
```

---

## Camera Icons Explained

| Icon | Meaning | What To Do |
|------|---------|-----------|
| 📺 | OBS Virtual Camera | Install OBS + plugin, start camera |
| 📱 | Phone Camera (WiFi) | Install DroidCam/IP Webcam, connect |
| 🎥 | USB Webcam | Just plug it in! |
| 📹 | External/Capture | Connect HDMI/USB, install drivers |

---

## Step-by-Step: First Time Using OBS Virtual Camera

### **Step 1: Download OBS**
```
1. Go to obsproject.com
2. Download OBS Studio for your OS
3. Install it
4. Open OBS
```

### **Step 2: Add Virtual Camera Plugin**
```
1. In OBS, go to Tools menu
2. Look for "Virtual Camera" option
3. If not there, install plugin first
4. Then enable in Tools
```

### **Step 3: Set Up Your Dartboard**
```
OBS Screen:

1. Capture video of dartboard
   (Phone pointed at board, or video input)

2. Make sure dartboard fills most of screen

3. Good lighting is IMPORTANT

4. Dartboard should be centered
```

### **Step 4: Start Virtual Camera**
```
1. Click "Start Virtual Camera" button
2. You'll see indicator it's running
3. Keep OBS open while using Nine Dart Nation
```

### **Step 5: Open Nine Dart Nation**
```
1. Go to calibration
2. You'll see "📺 OBS Virtual Camera" selected
3. See dartboard in the feed
4. Start calibrating!
```

---

## Step-by-Step: Using Phone Camera (DroidCam)

### **On Your Phone:**
```
1. Download "DroidCam" app (free or paid)
2. Open the app
3. Note the IP address shown
   (Usually: 192.168.1.x:4747)
4. Keep it running
```

### **On Your PC:**
```
1. Download "DroidCam Client" 
2. Install it
3. Enter phone's IP address
4. Click Connect
```

### **In Nine Dart Nation:**
```
1. Open calibrator
2. Click "📷 Select Camera"
3. Look for "📱 DroidCam"
4. Click it
5. See your phone's camera feed
6. Start calibrating!
```

---

## Step-by-Step: Using USB Webcam

### **Simplest Option!**

```
1. Plug USB camera into your PC
2. Wait 5 seconds for drivers
3. Open Nine Dart Nation
4. Click "📷 Select Camera"
5. Find "🎥 [Camera Name]"
6. Click it
7. Done! Start calibrating!
```

---

## What If Only 1 Camera?

```
┌──────────────────────────────────────┐
│  🎯 Dartboard Calibration            │
├──────────────────────────────────────┤
│                                      │
│  Calibration Confidence              │
│  ████░░░░░░ 0%                       │
│                                      │
│  (NO "Select Camera" button)          │
│                                      │
│  ✓ Camera Active                     │
│                                      │
│  [LIVE DARTBOARD]                    │
│                                      │
│  ...rest of calibration              │
│                                      │
└──────────────────────────────────────┘
```

Only 1 camera? No need to select - it auto-starts!

---

## What If Camera Not Found?

### **Error Message:**
```
┌──────────────────────────────────────┐
│ 📷 Camera Access Required             │
│                                      │
│ Camera access denied. Check           │
│ permissions.                          │
│                                      │
│ Go to Settings → App Permissions     │
│ → Camera and grant access to use     │
│ calibration.                          │
│                                      │
│ [Retry]                              │
└──────────────────────────────────────┘
```

**To Fix:**
1. Go to System Settings
2. Find Privacy → Camera
3. Grant Nine Dart Nation permission
4. Restart browser
5. Try again

---

## Common Camera Setups

### **Setup 1: OBS (Most Common)**
```
PC with OBS
    ↓
[HDMI/USB Input from Camera/Phone]
    ↓
OBS Scene shows Dartboard
    ↓
Virtual Camera Output
    ↓
Nine Dart Nation sees it
    ↓
📺 OBS Virtual Camera selected
```

### **Setup 2: Phone Camera**
```
Phone with DroidCam
    ↓
WiFi Connection
    ↓
DroidCam App → IP:Port
    ↓
PC DroidCam Client
    ↓
Nine Dart Nation
    ↓
📱 DroidCam selected
```

### **Setup 3: USB Webcam**
```
USB Webcam
    ↓
Plug into PC
    ↓
Drivers auto-install
    ↓
Nine Dart Nation
    ↓
🎥 [Camera Name] selected
```

---

## Button Descriptions

### **"📷 Select Camera" Button**
- Only appears if you have 2+ cameras
- Shows count: (3), (2), etc
- Purple color to stand out
- Click to see dropdown

### **Selected Camera Indicator**
- Shows ✓ next to active camera
- Text: "Currently active"
- Click any camera to switch
- Changes immediately

### **"ℹ️ Tips" Section**
- How to set up each camera type
- Quick reference
- Always visible in dropdown

---

## Switching Cameras Mid-Calibration

```
You're calibrating with Camera A
    ↓
You click "📷 Select Camera"
    ↓
You pick Camera B
    ↓
Dropdown closes
    ↓
Feed switches to Camera B
    ↓
Your clicked points are GONE (reset)
    ↓
You start over with Camera B
```

**Tip:** Switch cameras BEFORE calibrating, not during!

---

## Camera Preference Memory

```
First time:
  Pick Camera A
    ↓
  Preference saved

Next time:
  App opens
    ↓
  Camera A loads automatically
    ↓
  No need to select again!

Camera unplugged:
  Next time you open
    ↓
  Camera A not found
    ↓
  Falls back to first available
    ↓
  You can pick different one
```

---

## ✅ Checklist: Is My Camera Ready?

| Item | Check |
|------|-------|
| Camera plugged in or running | ☐ |
| Dartboard visible in camera | ☐ |
| Good lighting on board | ☐ |
| Dartboard fills ~80% of frame | ☐ |
| Camera feed is clear (not blurry) | ☐ |
| "✓ Camera Active" shows | ☐ |
| No error messages | ☐ |

If all checked, you're ready to calibrate! 🎯

---

## ❓ FAQ

**Q: Can I use multiple cameras?**
A: Yes! Switch anytime via the dropdown.

**Q: Does it remember which camera I used?**
A: Yes! It saves your selection.

**Q: Can I use my phone's back camera?**
A: Yes, via DroidCam or IP Webcam apps.

**Q: What if OBS camera stops working?**
A: Make sure OBS is open and Virtual Camera started.

**Q: Can I see FPS/quality?**
A: Not yet, but in a future update!

**Q: What resolution should the camera be?**
A: 1280x720 or higher is ideal.

---

## 🎯 You're Ready!

Your camera is all set up. Now let's calibrate! 🎯

