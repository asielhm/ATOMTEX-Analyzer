/** Visible ROI markers with accessible mouse, touch and keyboard handles. */
export function createRoiControls(
  canvas,
  { getChart, getLimits, getValues, onChange },
) {
  const overlay = document.createElement("div");
  overlay.className = "roi-overlay";
  canvas.parentElement.append(overlay);
  let active = null,
    pending = null,
    frame = null;
  const handles = {};
  const bounds = (key, limits) =>
    key === "start"
      ? [0, limits.end - limits.minChannels + 1]
      : [limits.start + limits.minChannels - 1, getValues().length - 1];
  function flush() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    const change = pending;
    pending = null;
    const limits = getLimits();
    if (!change || !limits?.draggable) return;
    const [min, max] = bounds(change.key, limits);
    const channel = Math.min(max, Math.max(min, change.channel));
    if (channel !== limits[change.key]) onChange(change.key, channel);
  }
  function move(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    const chart = getChart(),
      values = getValues();
    if (!chart || !values.length) return;
    const rect = canvas.getBoundingClientRect();
    const pixel = ((event.clientX - rect.left) * chart.width) / rect.width;
    const value = chart.scales.x.getValueForPixel(pixel - active.offset);
    // Prefer the current channel when several channels have identical energies.
    let nearest = getLimits()?.[active.key] ?? 0;
    for (let i = 0; i < values.length; i++) {
      if (Math.abs(values[i] - value) < Math.abs(values[nearest] - value))
        nearest = i;
    }
    pending = { key: active.key, channel: nearest };
    if (frame === null) frame = requestAnimationFrame(flush);
  }
  for (const [key, label, letter] of [
    ["start", "inicial", "I"],
    ["end", "final", "F"],
  ]) {
    const handle = document.createElement("div");
    handle.className = "roi-handle";
    handle.hidden = true;
    handle.tabIndex = 0;
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", `Límite ${label} de integración`);
    handle.setAttribute("aria-orientation", "horizontal");
    const grip = document.createElement("span");
    grip.textContent = letter;
    grip.setAttribute("aria-hidden", "true");
    handle.append(grip);
    overlay.append(handle);
    handles[key] = handle;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !event.isPrimary || !getLimits()?.draggable)
        return;
      event.preventDefault();
      event.stopPropagation();
      handle.focus({ preventScroll: true });
      const chart = getChart(),
        rect = canvas.getBoundingClientRect();
      const pixel = ((event.clientX - rect.left) * chart.width) / rect.width;
      active = {
        key,
        pointerId: event.pointerId,
        offset:
          pixel -
          chart.scales.x.getPixelForValue(getValues()[getLimits()[key]]),
      };
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("dragging");
    });
    handle.addEventListener("pointermove", move);
    const finish = (event) => {
      if (!active || event.pointerId !== active.pointerId) return;
      if (event.type === "pointerup") move(event);
      flush();
      active = null;
      handle.classList.remove("dragging");
      if (handle.hasPointerCapture(event.pointerId))
        handle.releasePointerCapture(event.pointerId);
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      handle.addEventListener(type, finish);
    handle.addEventListener("keydown", (event) => {
      const limits = getLimits();
      if (!limits?.draggable) return;
      const [min, max] = bounds(key, limits);
      const step = event.shiftKey ? 10 : 1;
      const channel = {
        ArrowLeft: limits[key] - step,
        ArrowRight: limits[key] + step,
        Home: min,
        End: max,
      }[event.key];
      if (channel === undefined) return;
      event.preventDefault();
      pending = { key, channel };
      flush();
    });
  }
  return {
    id: "roiLimits",
    afterDraw(chart) {
      const limits = getLimits(),
        values = getValues();
      const { ctx, chartArea, scales } = chart;
      for (const key of ["start", "end"]) {
        const channel = limits?.[key],
          handle = handles[key];
        const x =
          channel == null ? NaN : scales.x.getPixelForValue(values[channel]);
        const visible =
          Number.isFinite(x) && x >= chartArea.left && x <= chartArea.right;
        handle.hidden = !visible || !limits?.draggable;
        if (!visible) continue;
        ctx.save();
        ctx.strokeStyle = "#b56825";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
        if (!limits.draggable) continue;
        const [min, max] = bounds(key, limits);
        const other = key === "start" ? "end" : "start";
        const otherX =
          limits[other] == null
            ? NaN
            : scales.x.getPixelForValue(values[limits[other]]);
        // Separate the grips when adjacent channels share an energy/pixel.
        const gripX =
          Math.abs(otherX - x) < 28
            ? (x + otherX) / 2 + (key === "start" ? -14 : 14)
            : x;
        handle.style.left = `${canvas.offsetLeft + gripX}px`;
        handle.style.top = `${canvas.offsetTop + chartArea.top}px`;
        handle.style.height = `${chartArea.bottom - chartArea.top}px`;
        handle.setAttribute("aria-valuemin", min);
        handle.setAttribute("aria-valuemax", max);
        handle.setAttribute("aria-valuenow", channel);
        handle.setAttribute("aria-valuetext", `Canal ${channel}`);
        handle.title = `Límite ${key === "start" ? "inicial" : "final"}: canal ${channel}. Arrastrá o usá las flechas.`;
      }
    },
  };
}
