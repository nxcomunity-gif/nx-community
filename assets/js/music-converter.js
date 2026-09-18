/* ── Music Converter: audio → WAV siap Roblox (semua di browser) ────── */
(function () {
  "use strict";

  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("fileInput");
  var srSel = document.getElementById("samplerate");
  var chSel = document.getElementById("channels");
  var optNormalize = document.getElementById("optNormalize");
  var optTrim = document.getElementById("optTrim");
  var optSilence = document.getElementById("optSilence");
  var volSlider = document.getElementById("volSlider");
  var volLabel = document.getElementById("volLabel");
  var convertBtn = document.getElementById("convertBtn");
  var progress = document.getElementById("progress");
  var progressBar = document.getElementById("progressBar");
  var progressLabel = document.getElementById("progressLabel");
  var result = document.getElementById("result");
  var resultInfo = document.getElementById("resultInfo");
  var downloadBtn = document.getElementById("downloadBtn");

  var sourceBuffer = null; // AudioBuffer hasil decode
  var sourceName = "";
  var wavBlob = null;

  function setProgress(pct, text) {
    progress.hidden = false;
    progressLabel.hidden = false;
    progressBar.style.width = pct + "%";
    progressLabel.textContent = text;
  }

  // ── WAV encoder (PCM 16-bit) ──────────────────────────────────────
  function encodeWAV(samples, sampleRate, numChannels) {
    // samples: Float32Array interleaved (ch0, ch1, ch0, ch1, ...)
    var total = samples.length;
    var buffer = new ArrayBuffer(44 + total * 2);
    var view = new DataView(buffer);

    function writeStr(offset, str) {
      for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }
    function writeU32(offset, val) { view.setUint32(offset, val, true); }
    function writeU16(offset, val) { view.setUint16(offset, val, true); }

    writeStr(0, "RIFF");
    writeU32(4, 36 + total * 2);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    writeU32(16, 16);                 // fmt chunk size
    writeU16(20, 1);                  // PCM
    writeU16(22, numChannels);
    writeU32(24, sampleRate);
    writeU32(28, sampleRate * numChannels * 2); // byte rate
    writeU16(32, numChannels * 2);    // block align
    writeU16(34, 16);                 // bits per sample
    writeStr(36, "data");
    writeU32(40, total * 2);

    var offset = 44;
    for (var i = 0; i < total; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  // ── Interleave semua channel jadi 1 array ─────────────────────────
  function interleave(channels, totalFrames) {
    var n = channels.length;
    var out = new Float32Array(totalFrames * n);
    for (var c = 0; c < n; c++) {
      var ch = channels[c];
      for (var i = 0; i < totalFrames; i++) out[i * n + c] = ch[i];
    }
    return out;
  }

  // ── Konversi: decode di-resample & di-normalisasi via OfflineAudioContext
  async function convert() {
    if (!sourceBuffer) return;

    var outRate = parseInt(srSel.value, 10);
    var outCh = parseInt(chSel.value, 10);
    var durSource = sourceBuffer.duration;
    var volume = parseFloat(volSlider.value) || 1; // 0.1 - 2.0

    convertBtn.disabled = true;
    result.hidden = true;
    wavBlob = null;
    setProgress(4, "Menyiapkan…");

    // Potong ke 7 menit (batas upload Roblox).
    var dur = durSource;
    var potong = false;
    if (optTrim.checked && dur > 420) { dur = 420; potong = true; }

    // Buang senyap awal (max 10 detik, minimal 0.3s gap).
    var start = 0;
    if (optSilence.checked) {
      var data0 = sourceBuffer.getChannelData(0);
      var threshold = 0.005;
      var block = Math.floor(sourceBuffer.sampleRate * 0.1);  // 100ms blok
      var maxSkip = Math.floor(sourceBuffer.sampleRate * 10);
      for (var i = 0; i < maxSkip; i += block) {
        var mx = 0;
        for (var j = i; j < Math.min(i + block, data0.length); j++) {
          var a = Math.abs(data0[j]);
          if (a > mx) mx = a;
        }
        if (mx > threshold) break;
        start = i + block;
      }
    }

    var frameStart = Math.floor(start / sourceBuffer.sampleRate * outRate);
    var frames = Math.max(1, Math.floor(dur * outRate) - frameStart);

    setProgress(12, "Render ulang ke " + outRate + " Hz…");

    // OfflineAudioContext otomatis handle resample.
    var ctx = new OfflineAudioContext(outCh, frames, outRate);
    var src = ctx.createBufferSource();
    src.buffer = sourceBuffer;

    var gainNode = ctx.createGain();
    src.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Kalau kepotong dari tengah-tengah source, offset start-nya.
    var offsetStart = start / sourceBuffer.sampleRate;

    src.start(0, offsetStart, dur - offsetStart);

    var rendered = await ctx.startRendering();

    setProgress(70, "Normalisasi volume…");

    // Normalisasi: cari peak seluruh saluran.
    if (optNormalize.checked) {
      var peak = 0;
      for (var c = 0; c < rendered.numberOfChannels; c++) {
        var chd = rendered.getChannelData(c);
        for (var k = 0; k < chd.length; k++) {
          var ab = Math.abs(chd[k]);
          if (ab > peak) peak = ab;
        }
      }
      if (peak > 1e-6) {
        var gain = 0.95 / peak;
        for (var c2 = 0; c2 < rendered.numberOfChannels; c2++) {
          var chd2 = rendered.getChannelData(c2);
          for (var k2 = 0; k2 < chd2.length; k2++) chd2[k2] *= gain;
        }
      }
    }

    // Terapkan volume user (0.1 - 2.0). Kalau >1, cegah clipping.
    if (volume !== 1) {
      var vpeak = 1e-6;
      for (var vc = 0; vc < rendered.numberOfChannels; vc++) {
        var vch = rendered.getChannelData(vc);
        for (var vk = 0; vk < vch.length; vk++) {
          var vab = Math.abs(vch[vk]);
          if (vab > vpeak) vpeak = vab;
        }
      }
      var vgain = volume;
      if (vpeak * volume > 0.98) vgain = 0.98 / vpeak; // kurangi biar nggak pecah (clip)
      for (var vc2 = 0; vc2 < rendered.numberOfChannels; vc2++) {
        var vch2 = rendered.getChannelData(vc2);
        for (var vk2 = 0; vk2 < vch2.length; vk2++) vch2[vk2] *= vgain;
      }
    }

    setProgress(90, "Encode WAV…");

    var channels = [];
    for (var c3 = 0; c3 < rendered.numberOfChannels; c3++) {
      channels.push(rendered.getChannelData(c3));
    }
    var interleaved = interleave(channels, rendered.length);
    wavBlob = encodeWAV(interleaved, outRate, outCh);

    setProgress(100, "Selesai! 🎉");
    setTimeout(function () { progress.hidden = true; progressLabel.hidden = true; }, 800);

    var durFinal = rendered.length / outRate;
    var sizeMB = (wavBlob.size / (1024 * 1024)).toFixed(2);
    var catatan = [];
    catatan.push("Durasi: " + durFinal.toFixed(1) + " detik");
    if (potong) catatan.push("dipotong dari " + durSource.toFixed(1) + "s");
    catatan.push(sizeMB + " MB");
    catatan.push(outRate + " Hz");
    catatan.push(outCh === 1 ? "Mono" : "Stereo");
    catatan.push("Volume " + volume.toFixed(1) + "×");

    resultInfo.innerHTML =
      "<b>" + sourceName + "</b><br>" +
      catatan.join(" · ") +
      (potong ? "<br>⚠️ Audio asli lebih dari 7 menit — udah dipotong ke 7 menit (batas Roblox)." : "");

    result.hidden = false;
    convertBtn.disabled = false;
  }

  downloadBtn.addEventListener("click", function () {
    if (!wavBlob) return;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(wavBlob);
    a.download = (sourceName.replace(/\.[^/.]+$/, "") || "audio") + "_robux.wav";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
  });

  // Drag & drop + klik.
  function loadFile(file) {
    if (!file || !file.type.startsWith("audio/")) return;
    if (file.size > 25 * 1024 * 1024) { alert("Maks 25 MB."); return; }
    sourceName = file.name;

    var reader = new FileReader();
    reader.onload = async function (e) {
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        var ctx = new AudioCtx();
        var arr = e.target.result; // udah ArrayBuffer dari readAsArrayBuffer
        sourceBuffer = await ctx.decodeAudioData(arr);
        ctx.close();
        convertBtn.disabled = false;
        setProgress(0, "🎵 " + sourceName + " — " + sourceBuffer.duration.toFixed(1) + "s, siap!");
        setTimeout(function () { progress.hidden = true; progressLabel.hidden = true; }, 2000);
      } catch (err) {
        convertBtn.disabled = true;
        alert("Gagal baca file audio: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  convertBtn.addEventListener("click", convert);

  volSlider.addEventListener("input", function () {
    volLabel.textContent = parseFloat(volSlider.value).toFixed(1) + "×";
  });

  dropzone.addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function () { loadFile(fileInput.files[0]); });
  dropzone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", function () { dropzone.classList.remove("dragover"); });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    loadFile(e.dataTransfer.files[0]);
  });
})();