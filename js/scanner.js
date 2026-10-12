// Barcode scanning with the camera.

import { $, loadScript, openSheet } from './ui.js';

export function openScanner(onCode) {
  let stream, reader, stopped = false, timer;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    try { reader?.reset(); } catch { /* already stopped */ }
    stream?.getTracks().forEach((t) => t.stop());
  };
  const sheet = openSheet({
    title: 'Scan barcode',
    onClose: stop,
    body: `
      <div class="scanner"><video playsinline muted autoplay></video><div class="reticle"></div></div>
      <p class="muted small" id="scan-status">Starting camera…</p>
      <form class="field" id="manual">
        <span>Or type the barcode number</span>
        <div class="search"><input inputmode="numeric" id="manual-code" placeholder="e.g. 012345678905" aria-label="Barcode number"><button class="btn primary">Look up</button></div>
      </form>`,
  });
  const b = sheet.body;
  const video = $('video', b);
  const status = $('#scan-status', b);
  const done = (code) => {
    if (stopped) return;
    navigator.vibrate?.(60);
    sheet.close();
    onCode(code);
  };
  $('#manual', b).onsubmit = (e) => {
    e.preventDefault();
    const code = $('#manual-code', b).value.replace(/\D/g, '');
    if (code.length >= 6) done(code);
  };

  (async () => {
    try {
      const native = 'BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('ean_13');
      if (native) {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stop();
        video.srcObject = stream;
        await video.play();
        const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        status.textContent = 'Point the camera at a barcode.';
        const tick = async () => {
          if (stopped) return;
          try {
            const [hit] = await det.detect(video);
            if (hit) return done(hit.rawValue);
          } catch { /* frame not ready */ }
          timer = setTimeout(tick, 120);
        };
        tick();
      } else {
        await loadScript('vendor/zxing.min.js');
        if (stopped) return;
        const Z = window.ZXing;
        const hints = new Map([[Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]]]);
        reader = new Z.BrowserMultiFormatReader(hints, 150);
        await reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, (res) => { if (res) done(res.getText()); });
        if (stopped) return stop();
        stream = video.srcObject;
        status.textContent = 'Point the camera at a barcode.';
      }
    } catch (e) {
      status.textContent = e?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow it in your browser settings, or type the number below.'
        : 'Camera unavailable. Type the barcode number below.';
    }
  })();
}
