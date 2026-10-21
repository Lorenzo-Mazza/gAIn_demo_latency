const videos = [document.querySelector('#fp32-video'), document.querySelector('#gain-video')];
const master = videos[0];
const playButton = document.querySelector('#play-pause');
const startButton = document.querySelector('#start-demo');
const gainCompletion = document.querySelector('#gain-completion');
const chart = document.querySelector('#latency-chart');
const tooltip = document.querySelector('#chart-tooltip');
const errorMessage = document.querySelector('#error-message');
const svgNS = 'http://www.w3.org/2000/svg';
let playing = false;
let ready = false;
let metric = 'inference';
let latency;
let media;
let chartLayout;
let inspectedStep = 1;
let playbackRequest = 0;

function reportError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function setPlaying(value) {
  playing = value;
  playButton.classList.toggle('is-paused', !value);
  playButton.setAttribute('aria-label', value ? 'Pause videos' : 'Play videos');
  playButton.setAttribute('aria-pressed', String(!value));
  playButton.title = `${value ? 'Pause' : 'Play'} videos (Space)`;
}

async function playVideos() {
  if (!ready) return;
  const request = ++playbackRequest;
  setPlaying(true);
  startButton.hidden = true;
  const results = await Promise.allSettled(videos.map(video => {
    if (video.currentTime >= video.duration - 0.06) return undefined;
    return video.play();
  }));
  if (request !== playbackRequest) return;
  const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.some(error => error.name === 'NotAllowedError')) {
    pauseVideos();
    startButton.hidden = false;
    return;
  }
  if (failures.some(error => error.name !== 'AbortError')) {
    pauseVideos();
    reportError('The videos could not start. Please reload the demo.');
  }
}

function pauseVideos() {
  playbackRequest += 1;
  videos.forEach(video => video.pause());
  setPlaying(false);
  startButton.hidden = true;
}

function updatePhases() {
  if (!media) return;
  ['fp32', 'gain'].forEach((model, index) => {
    for (const [phase, seconds] of Object.entries(media[model].phases)) {
      const row = document.querySelector(`[data-model="${model}"] [data-phase="${phase}"]`);
      const complete = videos[index].currentTime + 0.025 >= seconds;
      row.classList.toggle('complete', complete);
      row.setAttribute('aria-label', `${phase}: ${complete ? 'complete' : 'pending'}`);
    }
  });
}

function updatePlayback() {
  updatePhases();
  const gain = videos[1];
  const finished = Number.isFinite(gain.duration) && gain.currentTime >= gain.duration - .06 && (gain.ended || master.currentTime >= gain.duration);
  gainCompletion.hidden = !finished;
}

function seekTo(time) {
  const target = Math.max(0, Math.min(master.duration, time));
  videos.forEach(video => {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(target, Math.max(0, video.duration - 0.03));
    if (target >= video.duration - 0.06) video.pause();
    else if (playing) video.play().catch(() => {});
  });
  updatePlayback();
}

async function replay() {
  if (!ready) return;
  pauseVideos();
  seekTo(0);
  await playVideos();
}

function waitForMetadata(video) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', resolve, {once: true});
    video.addEventListener('error', () => reject(new Error('A video could not be loaded. Please reload the demo.')), {once: true});
  });
}

playButton.addEventListener('click', () => playing ? pauseVideos() : playVideos());
startButton.addEventListener('click', playVideos);
document.querySelector('#restart').addEventListener('click', replay);
master.addEventListener('ended', replay);
videos.forEach(video => {
  video.addEventListener('timeupdate', updatePlayback);
  video.addEventListener('seeked', updatePlayback);
  video.addEventListener('ended', updatePlayback);
  video.addEventListener('error', () => reportError('A video could not be loaded. Please reload the demo.'));
});

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    reportError('Use your browser’s full-screen command to expand the demo.');
  }
}
document.querySelector('#fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const full = Boolean(document.fullscreenElement);
  const button = document.querySelector('#fullscreen');
  button.setAttribute('aria-label', full ? 'Exit full screen' : 'Enter full screen');
  button.title = `${full ? 'Exit full screen' : 'Full screen'} (F)`;
});
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.altKey || event.metaKey || /INPUT|BUTTON|TEXTAREA/.test(event.target.tagName)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    playing ? pauseVideos() : playVideos();
  } else if (event.key.toLowerCase() === 'r') replay();
  else if (event.key.toLowerCase() === 'f') toggleFullscreen();
});

function svgElement(tag, attributes = {}, text) {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function drawChart() {
  if (!latency) return;
  const {width, height} = chart.getBoundingClientRect();
  if (!width || !height) return;
  const compact = width < 650;
  const margin = {left: compact ? 43 : 56, right: 18, top: 14, bottom: 36};
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = step => margin.left + ((step - 1) / 59) * innerWidth;
  const y = value => margin.top + (1 - value / 1000) * innerHeight;
  chartLayout = {width, height, margin, x, y, innerWidth, innerHeight};
  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chart.replaceChildren();
  chart.append(svgElement('title', {}, metric === 'inference' ? 'AI computation latency' : 'Complete processing cycle latency'));
  chart.append(svgElement('desc', {}, `Each line shows measured latency per prediction. Mean FP32 latency: ${Math.round(latency.summary.fp32[metric])} milliseconds. Mean gAIn latency: ${Math.round(latency.summary.gain[metric])} milliseconds.`));
  const defs = svgElement('defs');
  const gradient = svgElement('linearGradient', {id: 'gain-area', x1: '0', x2: '0', y1: '0', y2: '1'});
  gradient.append(svgElement('stop', {offset: '0%', 'stop-color': '#008466', 'stop-opacity': '.065'}));
  gradient.append(svgElement('stop', {offset: '100%', 'stop-color': '#008466', 'stop-opacity': '.006'}));
  defs.append(gradient);
  chart.append(defs);
  for (const value of [0, 250, 500, 750, 1000]) {
    chart.append(svgElement('line', {x1: margin.left, x2: width - margin.right, y1: y(value), y2: y(value), class: 'chart-grid'}));
    chart.append(svgElement('text', {x: margin.left - 12, y: y(value) + 5, 'text-anchor': 'end', class: 'chart-tick'}, value));
  }
  chart.append(svgElement('text', {x: margin.left - 12, y: 2, 'text-anchor': 'end', class: 'chart-unit'}, 'ms'));
  const ticks = compact ? [1, 15, 30, 45, 60] : [1, 10, 20, 30, 40, 50, 60];
  for (const step of ticks) chart.append(svgElement('text', {x: x(step), y: height - 15, 'text-anchor': 'middle', class: 'chart-tick'}, step));
  chart.append(svgElement('text', {x: width - margin.right, y: height - 1, 'text-anchor': 'end', class: 'chart-unit'}, 'Prediction'));
  for (const model of ['fp32', 'gain']) {
    const samples = latency.samples[model];
    const path = samples.map((sample, index) => `${index ? 'L' : 'M'}${x(sample.step).toFixed(2)},${y(sample[metric]).toFixed(2)}`).join(' ');
    if (model === 'gain') {
      chart.append(svgElement('path', {d: `${path} L${x(samples.at(-1).step)},${y(0)} L${x(samples[0].step)},${y(0)} Z`, fill: 'url(#gain-area)'}));
    }
    chart.append(svgElement('path', {d: path, class: `latency-curve curve-${model}`, 'data-series': model}));
  }
  chart.append(svgElement('line', {id: 'chart-hover-line', x1: 0, x2: 0, y1: margin.top, y2: height - margin.bottom, class: 'chart-hover-line', visibility: 'hidden'}));
  document.querySelector('#speedup').textContent = metric === 'inference' ? `${latency.summary.speedup[metric].toFixed(1)}×` : `${latency.summary.speedup[metric].toFixed(2)}×`;
  document.querySelector('#fp32-mean').textContent = `${Math.round(latency.summary.fp32[metric])} ms`;
  document.querySelector('#gain-mean').textContent = `${Math.round(latency.summary.gain[metric])} ms`;
  chart.setAttribute('aria-label', `${metric === 'inference' ? 'AI computation' : 'Complete cycle'} latency per prediction. Use left and right arrows to inspect predictions.`);
  hideTooltip();
}

function hideTooltip() {
  tooltip.hidden = true;
  document.querySelector('#chart-hover-line')?.setAttribute('visibility', 'hidden');
}

function inspectPrediction(step, announce = false) {
  if (!chartLayout || !latency) return;
  inspectedStep = Math.max(1, Math.min(60, step));
  const values = ['fp32', 'gain'].map(model => latency.samples[model].find(sample => sample.step === inspectedStep)?.[metric]);
  tooltip.replaceChildren();
  const heading = document.createElement('b');
  heading.textContent = `Prediction ${inspectedStep}`;
  tooltip.append(heading);
  ['FP32', 'gAIn'].forEach((label, index) => {
    const row = document.createElement('span');
    if (index === 1) row.className = 'gain-value';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('strong');
    value.textContent = values[index] === undefined ? '—' : `${Math.round(values[index])} ms`;
    row.append(name, value);
    tooltip.append(row);
  });
  const location = chartLayout.x(inspectedStep);
  const line = document.querySelector('#chart-hover-line');
  line.setAttribute('x1', location);
  line.setAttribute('x2', location);
  line.setAttribute('visibility', 'visible');
  tooltip.hidden = false;
  tooltip.style.left = `${Math.max(0, Math.min(chartLayout.width - tooltip.offsetWidth - 5, location + 14))}px`;
  tooltip.style.top = '12px';
  if (announce) document.querySelector('#chart-announcement').textContent = `Prediction ${inspectedStep}. FP32 ${values[0] === undefined ? 'unavailable' : Math.round(values[0]) + ' milliseconds'}. gAIn ${Math.round(values[1])} milliseconds.`;
}

chart.addEventListener('pointermove', event => {
  if (!chartLayout) return;
  const pixel = event.clientX - chart.getBoundingClientRect().left;
  if (pixel < chartLayout.margin.left || pixel > chartLayout.width - chartLayout.margin.right) return hideTooltip();
  inspectPrediction(Math.round(1 + (pixel - chartLayout.margin.left) / chartLayout.innerWidth * 59));
});
chart.addEventListener('pointerleave', hideTooltip);
chart.addEventListener('blur', hideTooltip);
chart.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    inspectPrediction(inspectedStep + (event.key === 'ArrowRight' ? 1 : -1), true);
  } else if (event.key === 'Escape') hideTooltip();
});
document.querySelectorAll('[data-metric]').forEach(button => button.addEventListener('click', () => {
  metric = button.dataset.metric;
  document.querySelectorAll('[data-metric]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  drawChart();
}));
new ResizeObserver(drawChart).observe(document.querySelector('.chart-container'));

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('The demo data could not be loaded. Please reload the page.');
  return response.json();
}

async function initialize() {
  try {
    [latency, media] = await Promise.all([loadJSON('data/latency.json'), loadJSON('data/media.json')]);
    drawChart();
    await document.fonts.ready;
    drawChart();
    await Promise.all(videos.map(waitForMetadata));
    ready = true;
    updatePlayback();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPlaying(false);
      startButton.hidden = false;
    } else await playVideos();
  } catch (error) {
    reportError(error.message);
  }
}
setPlaying(false);
initialize();
