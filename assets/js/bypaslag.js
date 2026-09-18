/* ── Bypass Lag: rekomendasi setting + checklist ───────────────────── */
(function () {
  "use strict";

  var deviceSel = document.getElementById("device");
  var qualitySel = document.getElementById("quality");
  var lagSel = document.getElementById("lagtype");
  var cekBtn = document.getElementById("cekBtn");
  var output = document.getElementById("output");
  var scoreEl = document.getElementById("score");
  var listEl = document.getElementById("list");

  function rekomendasi(device, quality, lag) {
    var items = [];
    var base = 60;

    if (lag === "ping") {
      items.push("📶 Main pake **kabel LAN** / deketin router — ping paling ngefek dari ini.");
      items.push("🔌 Pastiin charger nempel, HP / laptop jangan kehemat daya pas main.");
      items.push("🛑 Tutup aplikasi yang nyedot internet (download, streaming, torrent).");
      items.push("🌐 Konek ke server yang paling deket (region Asia kalau jarakmu ke sini).");
      items.push("🔄 Matiin VPN / proxy kalau lagi aktif — bisa nambah ping banyak.");
    } else {
      items.push("🖼️ Set Graphic Quality ke **" + (device === "hp" || device === "ios" ? "3 (HP)" : "5-6 (PC)") + "** — nggak harus High buat keliatan bagus.");
      items.push("⚡ Aktifin **Performance Stats** (Shift+F5) buat mantau FPS realtime.");
      items.push("🔔 Turunin / matiin **chat spam & notif server** yang narik FPS.");
      items.push("🧹 Kosongin RAM: tutup tab browser & aplikasi yang nggak kepake.");
      items.push("🎮 Main di **Fullscreen**, bukan windowed — biasanya lebih lancar.");
    }

    if (quality === "high") {
      items.push("⬇️ Grafis turun dari High ke Medium — ini yang paling kerasa buat FPS.");
    }
    if (device === "hp" || device === "ios") {
      items.push("📱 Aktifin **Mode Performance / Game Mode** di HP (kalau ada).");
      items.push("🔥 Terakhir: kalau HP panas → dudukin, jangan sambil nge-charge full speed.");
    } else {
      items.push("🎞️ Cek **Nvidia/AMD driver** udah update — sering diabaikan tapi ngefek.");
      items.push("🌡️ Cek suhu CPU/GPU pas main — overheat = FPS drop paksa.");
    }

    // Skor estimasi FPS setelah ikutin rekomendasi.
    var gain = 0;
    if (quality === "high") gain += 30;
    else if (quality === "mid") gain += 12;
    else gain += 0;
    if (lag === "both") gain += 8;
    if (device === "hp") base = 40; else if (device === "ios") base = 50;
    var final = base + gain;

    return { items: items, fps: final };
  }

  cekBtn.addEventListener("click", function () {
    var r = rekomendasi(deviceSel.value, qualitySel.value, lagSel.value);
    output.hidden = false;
    scoreEl.innerHTML = "±" + r.fps + " FPS <small style='font-size:0.9rem;color:var(--muted);'>estimasi setelah setting</small>";
    listEl.innerHTML = "";
    r.items.forEach(function (t) {
      var li = document.createElement("li");
      li.textContent = t.replace(/\*\*/g, "");
      listEl.appendChild(li);
    });
  });

  // Checklist → progress.
  var ckInputs = document.querySelectorAll("#checklist input[type=checkbox]");
  var ckbar = document.getElementById("ckbar");
  var ckprog = document.getElementById("ckprog");
  var cklabel = document.getElementById("cklabel");

  function updateCk() {
    var done = 0;
    ckInputs.forEach(function (i) { if (i.checked) done++; });
    var pct = Math.round((done / ckInputs.length) * 100);
    ckprog.hidden = false;
    cklabel.hidden = false;
    ckbar.style.width = pct + "%";
    cklabel.textContent = done + "/" + ckInputs.length + " selesai (" + pct + "%) — " +
      (pct >= 100 ? "Sip, siap gas! 🚀" : "teruskan, makin banyak makin mulus!");
  }
  ckInputs.forEach(function (i) { i.addEventListener("change", updateCk); });
})();