/**
 * Network device discovery utilities for wifi scoring devices
 */

// Web Serial API types
declare global {
  interface Navigator {
    serial: Serial;
  }
  interface Serial extends EventTarget {
    getPorts(): Promise<SerialPort[]>;
    requestPort(options?: SerialOptions): Promise<SerialPort>;
  }
  interface SerialPort {
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
  }
  interface SerialOptions {
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    bufferSize?: number;
    flowControl?: 'none' | 'hardware';
  }
}

export interface NetworkDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  type: 'omni' | 'vert' | 'generic';
  capabilities: string[];
  status: 'online' | 'offline' | 'connecting';
  connectionType: 'wifi' | 'usb';
}

/**
 * USB device interface for serial-connected scoring devices
 */
export interface USBDevice {
  id: string;
  name: string;
  type: 'omni' | 'vert' | 'generic';
  capabilities: string[];
  status: 'online' | 'offline' | 'connecting';
  port: SerialPort | null;
}

/**
 * Discover wifi scoring devices on the local network
 */
export async function discoverNetworkDevices(): Promise<NetworkDevice[]> {
  const devices: NetworkDevice[] = [];

  try {
    // Get local network info
    const localIPs = await getLocalIPs();

    for (const localIP of localIPs) {
      // Scan common ports for dart scoring devices
      const scanResults = await scanNetwork(localIP, [80, 8080, 8787, 8788, 3000, 5000]);

      for (const result of scanResults) {
        const device = await probeDevice(result.ip, result.port);
        if (device) {
          devices.push(device);
        }
      }
    }
  } catch (error) {
    console.error('Network discovery failed:', error);
  }

  return devices;
}

/**
 * Get local IP addresses
 */
async function getLocalIPs(): Promise<string[]> {
  const ips: string[] = [];

  try {
    // Try to get local IPs via WebRTC
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pc.close();
        resolve(ips);
      }, 5000);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const ipMatch = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch && ipMatch[1] && !ips.includes(ipMatch[1])) {
            const ip = ipMatch[1];
            // Only include private IPs
            if (isPrivateIP(ip)) {
              ips.push(ip);
            }
          }
        } else {
          clearTimeout(timeout);
          pc.close();
          resolve(ips);
        }
      };
    });
  } catch (error) {
    console.error('Failed to get local IPs:', error);
    return ['192.168.1.0']; // fallback
  }
}

/**
 * Check if IP is in private range
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  return (
    (parts[0] === 10) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

/**
 * Scan network for open ports
 */
async function scanNetwork(localIP: string, ports: number[]): Promise<{ip: string, port: number}[]> {
  const results: {ip: string, port: number}[] = [];
  const baseIP = localIP.split('.').slice(0, 3).join('.');

  // Scan a reasonable range (e.g., .1 to .254)
  const promises = [];
  for (let i = 1; i <= 254; i++) {
    const ip = `${baseIP}.${i}`;
    for (const port of ports) {
      promises.push(checkPort(ip, port));
    }
  }

  const portResults = await Promise.allSettled(promises);

  portResults.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      const portIndex = index % ports.length;
      const ipIndex = Math.floor(index / ports.length);
      const ip = `${baseIP}.${ipIndex + 1}`;
      results.push({ ip, port: ports[portIndex] });
    }
  });

  return results;
}

/**
 * Check if a specific port is open on an IP
 */
async function checkPort(ip: string, port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://${ip}:${port}/`, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: AbortSignal.timeout(2000)
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Probe a device to identify its type and capabilities
 */
async function probeDevice(ip: string, port: number): Promise<NetworkDevice | null> {
  try {
    // Try common endpoints for dart scoring devices
    const endpoints = [
      '/',
      '/api/info',
      '/api/status',
      '/camera',
      '/stream'
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`http://${ip}:${port}${endpoint}`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          const text = await response.text();

          // Check for OMNI device
          if (text.includes('OMNI') || text.includes('omni') || endpoint.includes('omni')) {
            return {
              id: `omni-${ip}-${port}`,
              name: `OMNI Camera (${ip})`,
              ip,
              port,
              type: 'omni',
              capabilities: ['video', 'calibration'],
              status: 'online',
              connectionType: 'wifi'
            };
          }

          // Check for VERT device
          if (text.includes('VERT') || text.includes('vert') || endpoint.includes('vert')) {
            return {
              id: `vert-${ip}-${port}`,
              name: `VERT Camera (${ip})`,
              ip,
              port,
              type: 'vert',
              capabilities: ['video', 'calibration'],
              status: 'online',
              connectionType: 'wifi'
            };
          }

          // Check for generic video streaming device
          if (contentType.includes('video') || text.includes('stream') || endpoint === '/stream') {
            return {
              id: `generic-${ip}-${port}`,
              name: `Network Camera (${ip})`,
              ip,
              port,
              type: 'generic',
              capabilities: ['video'],
              status: 'online',
              connectionType: 'wifi'
            };
          }
        }
      } catch {
        // Continue to next endpoint
      }
    }
  } catch (error) {
    console.error(`Failed to probe device ${ip}:${port}:`, error);
  }

  return null;
}

/**
 * Discover USB scoring devices connected via serial
 */
export async function discoverUSBDevices(): Promise<USBDevice[]> {
  const devices: USBDevice[] = [];

  try {
    // Check if Web Serial API is supported
    if (!('serial' in navigator)) {
      console.warn('Web Serial API not supported in this browser');
      return devices;
    }

    // Get already paired ports
    const ports = await navigator.serial.getPorts();

    for (const port of ports) {
      const device = await probeUSBDevice(port);
      if (device) {
        devices.push(device);
      }
    }

    // Also try to request a new port (this will show user selection dialog)
    // Note: This is optional and will be handled separately in the UI
  } catch (error) {
    console.error('USB device discovery failed:', error);
  }

  return devices;
}

/**
 * Request user to select a USB device
 */
export async function requestUSBDevice(): Promise<USBDevice | null> {
  try {
    if (!('serial' in navigator)) {
      alert('Web Serial API not supported in this browser. Please use a compatible browser like Chrome or Edge.');
      return null;
    }

    const port = await navigator.serial.requestPort();
    return await probeUSBDevice(port);
  } catch (error) {
    if ((error as any).name !== 'NotFoundError') {
      console.error('USB device request failed:', error);
    }
    return null;
  }
}

/**
 * Probe a USB serial port to identify the device type
 */
async function probeUSBDevice(port: SerialPort): Promise<USBDevice | null> {
  try {
    // Open the port with common settings for dart scoring devices
    await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' });

    // Try to read some data to identify the device
    const reader = port.readable?.getReader();
    if (reader) {
      try {
        // Set a timeout for reading
        const timeout = setTimeout(() => reader.cancel(), 2000);

        const { value, done } = await reader.read();
        clearTimeout(timeout);

        if (!done && value) {
          const text = new TextDecoder().decode(value);

          // Check for OMNI device
          if (text.includes('OMNI') || text.includes('omni')) {
            reader.releaseLock();
            return {
              id: `usb-omni-${Date.now()}`,
              name: 'OMNI Camera (USB)',
              type: 'omni',
              capabilities: ['video', 'calibration'],
              status: 'online',
              port
            };
          }

          // Check for VERT device
          if (text.includes('VERT') || text.includes('vert')) {
            reader.releaseLock();
            return {
              id: `usb-vert-${Date.now()}`,
              name: 'VERT Camera (USB)',
              type: 'vert',
              capabilities: ['video', 'calibration'],
              status: 'online',
              port
            };
          }
        }
      } catch {
        // Continue
      } finally {
        try { reader.releaseLock(); } catch {}
      }
    }

    // If we can't identify, assume it's a generic device
    return {
      id: `usb-generic-${Date.now()}`,
      name: 'USB Scoring Device',
      type: 'generic',
      capabilities: ['video'],
      status: 'online',
      port
    };

  } catch (error) {
    console.error('Failed to probe USB device:', error);
    return null;
  }
}

/**
 * Connect to a network device and get video stream
 */
export async function connectToNetworkDevice(device: NetworkDevice): Promise<MediaStream | null> {
  try {
    // For now, assume devices provide an MJPEG or HLS stream
    // This would need to be adapted based on the actual device API
    const streamUrl = `http://${device.ip}:${device.port}/stream`;

    // Create a video element to capture the stream
    const video = document.createElement('video');
    video.src = streamUrl;
    video.crossOrigin = 'anonymous';

    return new Promise((resolve, reject) => {
      video.onloadeddata = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Create a MediaStream from the video
        const stream = canvas.captureStream(30); // 30 FPS

        const drawFrame = () => {
          if (video.readyState >= 2) {
            ctx.drawImage(video, 0, 0);
          }
          requestAnimationFrame(drawFrame);
        };
        drawFrame();

        resolve(stream);
      };

      video.onerror = () => reject(new Error('Failed to load video stream'));
      video.load();
    });
  } catch (error) {
    console.error('Failed to connect to network device:', error);
    return null;
  }
}

/**
 * Connect to a USB device and get video stream
 */
export async function connectToUSBDevice(device: USBDevice): Promise<MediaStream | null> {
  try {
    if (!device.port) {
      throw new Error('No serial port available');
    }

    // For USB devices, we assume they provide video through a companion app or driver
    // This is a placeholder - actual implementation would depend on the device protocol
    console.log('USB device connection not fully implemented yet');
    return null;

  } catch (error) {
    console.error('Failed to connect to USB device:', error);
    return null;
  }
}