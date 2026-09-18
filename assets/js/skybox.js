/* ── Skybox Converter: equirectangular (2:1) → 6 sisi cubemap ────── */
(function () {
  "use strict";

  var dropzone = document.getElementById("dropzone");
  var fileInput = document.getElementById("fileInput");
  var sizeSel = document.getElementById("size");
  var convertBtn = document.getElementById("convertBtn");
  var preview = document.getElementById("preview");
  var previewImg = document.getElementById("previewImg");
  var progress = document.getElementById("progress");
  var progressBar = document.getElementById("progressBar");
  var progressLabel = document.getElementById("progressLabel");
  var result = document.getElementById("result");
  var faceGrid = document.getElementById("faceGrid");

  var sourceImage = null; // Image

  // Orientasi tiap sisi kubus (OpenGL-style, y-up). u,v di [-1,1].
  var FACES = [
    { id: "px", label: "Right",  dir: function (u, v) { return [1, -v, -u]; } },
    { id: "nx", label: "Left",   dir: function (u, v) { return [-1, -v, u]; } },
    { id: "py", label: "Top",    dir: function (u, v) { return [u, 1, v]; } },
    { id: "ny", label: "Bottom", dir: function (u, v) { return [u, -1, -v]; } },
    { id: "pz", label: "Back",   dir: function (u, v) { return [u, -v, 1]; } },
    { id: "nz", label: "Front",  dir: function (u, v) { return [-u, -v, -1]; } },
  ];

  function setProgress(pct, text) {
    progress.hidden = false;
    progressLabel.hidden = false;
    progressBar.style.width = pct + "%";
    progressLabel.textContent = text;
  }

  // Bilinear sampling dari ImageData sumber (equirect 2:1).
  function sampleEquirect(src, W, H, dirX, dirY, dirZ) {
    var lon = Math.atan2(dirZ, dirX);              // -π .. π
    var lat = Math.asin(Math.max(-1, Math.min(1, dirY))); // -π/2 .. π/2
    var u = (lon / (2 * Math.PI) + 0.5) * W;       // 0..W
    var v = (0.5 - lat / Math.PI) * H;             // 0..H (atas = +lat)

    // wrap horizontal
    u = ((u % W) + W) % W;
    v = Math.max(0, Math.min(H - 1.0001, v));

    var x0 = Math.floor(u), y0 = Math.floor(v);
    var x1 = (x0 + 1) % W, y1 = Math.min(y0 + 1, H - 1);
    var fx = u - x0, fy = v - y0;

    function px(x, y, c) { return src[(y * W + x) * 4 + c]; }
    var r = px(x0, y0, 0) * (1 - fx) * (1 - fy) + px(x1, y0, 0) * fx * (1 - fy)
          + px(x0, y1, 0) * (1 - fx) * fy + px(x1, y1, 0) * fx * fy;
    var g = px(x0, y0, 1) * (1 - fx) * (1 - fy) + px(x1, y0, 1) * fx * (1 - fy)
          + px(x0, y1, 1) * (1 - fx) * fy + px(x1, y1, 1) * fx * fy;
    var b = px(x0, y0, 2) * (1 - fx) * (1 - fy) + px(x1, y0, 2) * fx * (1 - fy)
          + px(x0, y1, 2) * (1 - fx) * fy + px(x1, y1, 2) * fx * fy;
    return [r, g, b, 255];
  }

  function renderFace(canvas, src, W, H, face, size, tick) {
    var ctx = canvas.getContext("2d");
    var img = ctx.createImageData(size, size);
    var data = img.data;
    var chunk = 64; // baris per tick

    return new Promise(function (resolve) {
      function renderRows(yStart) {
        var yEnd = Math.min(yStart + chunk, size);
        for (var y = yStart; y < yEnd; y++) {
          var v = ((y + 0.5) / size) * 2 - 1;
          for (var x = 0; x < size; x++) {
            var u = ((x + 0.5) / size) * 2 - 1;
            var d = face.dir(u, v);
            var len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
            var c = sampleEquirect(src, W, H, d[0] / len, d[1] / len, d[2] / len);
            var idx = (y * size + x) * 4;
            data[idx] = c[0]; data[idx + 1] = c[1]; data[idx + 2] = c[2]; data[idx + 3] = c[3];
          }
        }
        if (yEnd < size) {
          setProgress(tick.progress() + ((yEnd - yStart) / size) * tick.unit(), "Render " + face.label + "…");
          setTimeout(function () { renderRows(yEnd); }, 0);
        } else {
          ctx.putImageData(img, 0, 0);
          resolve();
        }
      }
      renderRows(0);
    });
  }

  convertBtn.addEventListener("click", async function () {
    if (!sourceImage) return;

    var size = parseInt(sizeSel.value, 10);
    var W = sourceImage.naturalWidth;
    var H = sourceImage.naturalHeight;

    // Render ke canvas sumber sekali (biar ImageData gampang diakses).
    var srcCanvas = document.createElement("canvas");
    srcCanvas.width = W; srcCanvas.height = H;
    var srcCtx = srcCanvas.getContext("2d");
    srcCtx.drawImage(sourceImage, 0, 0);
    var srcData = srcCtx.getImageData(0, 0, W, H).data;

    convertBtn.disabled = true;
    result.hidden = true;
    faceGrid.innerHTML = "";
    setProgress(1, "Mulai konversi…");

    var total = FACES.length * size; // total baris
    var done = 0;
    var tick = {
      unit: function () { return 97 / total; },
      progress: function () { return 1 + (done / total) * 97; },
    };

    var canvases = [];
    for (var i = 0; i < FACES.length; i++) {
      var canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      await renderFace(canvas, srcData, W, H, FACES[i], size, tick);
      done += size;
      canvases.push({ face: FACES[i], canvas: canvas });
    }

    setProgress(100, "Selesai! 🎉");
    setTimeout(function () { progress.hidden = true; progressLabel.hidden = true; }, 800);

    // Tampilkan hasil + tombol download.
    for (var j = 0; j < canvases.length; j++) {
      var item = canvases[j];
      var box = document.createElement("div");
      box.className = "face-item";
      box.appendChild(item.canvas);

      var fname = document.createElement("div");
      fname.className = "fname";
      fname.textContent = item.face.id + " · " + item.face.label;
      box.appendChild(fname);

      var dl = document.createElement("button");
      dl.className = "btn btn-ghost";
      dl.textContent = "⬇ Download";
      dl.addEventListener("click", (function (c, id) {
        return function () {
          var a = document.createElement("a");
          a.href = c.toDataURL("image/png");
          a.download = "skybox_" + id + ".png";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };
      })(item.canvas, item.face.id));
      box.appendChild(dl);

      faceGrid.appendChild(box);
    }

    result.hidden = false;
    convertBtn.disabled = false;
    convertBtn.textContent = "🔄 Konversi Ulang";
  });

  // Drag & drop + klik.
  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) { alert("Maks 20 MB."); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        sourceImage = img;
        previewImg.src = e.target.result;
        preview.hidden = false;
        convertBtn.disabled = false;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

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