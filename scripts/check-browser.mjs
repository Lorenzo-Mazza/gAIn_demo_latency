import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin = process.env.DEMO_URL || 'http://127.0.0.1:4173/';
const data = JSON.parse(await readFile(new URL('../data/latency.json', import.meta.url)));
assert.equal(data.samples.fp32.length, 59);
assert.equal(data.samples.gain.length, 60);
for (const model of ['fp32', 'gain']) {
  for (const metric of ['inference', 'total']) {
    const values = data.samples[model];
    const mean = values.reduce((sum, sample) => sum + sample[metric], 0) / values.length;
    assert.ok(Math.abs(mean - data.summary[model][metric]) < 0.001);
  }
}

await mkdir('artifacts', {recursive: true});
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(origin, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#fp32-video').currentTime > 0.2);
  assert.equal(await page.locator('.latency-curve').count(), 2);
  assert.deepEqual(await page.locator('.latency-curve').evaluateAll(items => items.map(path => getComputedStyle(path).stroke)), ['rgb(124, 142, 133)', 'rgb(0, 132, 102)']);
  assert.equal(await page.locator('#latency-chart circle').count(), 0);
  assert.equal(await page.locator('#speedup').textContent(), '3.1×');
  assert.equal(await page.locator('input[type="range"]').count(), 0, 'No progress bar');
  assert.equal(await page.locator('#gain-completion').isVisible(), false);
  assert.deepEqual(await page.locator('video').evaluateAll(items => items.map(video => getComputedStyle(video).filter)), ['brightness(0.8)', 'brightness(0.8)']);
  const revealWidths = () => page.locator('clipPath rect').evaluateAll(items => items.map(rect => rect.width.baseVal.value));
  const growingBefore = await revealWidths();
  await page.waitForTimeout(250);
  const growingAfter = await revealWidths();
  assert.ok(growingAfter.every((width, index) => width > growingBefore[index]), 'Both curves grow while the videos play');
  assert.ok(growingAfter[1] > growingAfter[0], 'The shorter gAIn recording reveals its curve faster');
  assert.deepEqual(await page.locator('video').evaluateAll(items => items.map(video => video.playbackRate)), [1, 1]);
  const lengths = await page.locator('video').evaluateAll(items => items.map(video => video.duration));
  assert.ok(Math.abs(lengths[0] - 45) < .1, `FP32 duration ${lengths[0]}`);
  assert.ok(Math.abs(lengths[1] - 17) < .1, `gAIn duration ${lengths[1]}`);
  await page.locator('#play-pause').click();
  assert.deepEqual(await page.locator('video').evaluateAll(items => items.map(video => video.paused)), [true, true]);
  const pausedWidths = await revealWidths();
  await page.waitForTimeout(250);
  assert.deepEqual(await revealWidths(), pausedWidths, 'Pause freezes both curves');

  async function seek(seconds) {
    await page.locator('video').evaluateAll((items, value) => {
      items.forEach(video => {video.currentTime = Math.min(value, video.duration - .03);});
    }, seconds);
    await page.waitForFunction(value => Math.abs(document.querySelector('#fp32-video').currentTime - value) < .1 && [...document.querySelectorAll('video')].every(video => !video.seeking), seconds);
    await page.waitForTimeout(100);
  }

  for (const [seconds, fp32, gain] of [[0,0,0],[4.8,0,0],[5.1,0,1],[7.1,0,2],[15.1,0,3],[16.8,0,3],[17.1,0,3],[29.8,0,3],[30.1,1,3],[33.1,2,3],[44.1,3,3]]) {
    await seek(seconds);
    assert.equal(await page.locator('[data-model="fp32"] .complete').count(), fp32, `FP32 phases at ${seconds}s`);
    assert.equal(await page.locator('[data-model="gain"] .complete').count(), gain, `gAIn phases at ${seconds}s`);
    assert.equal(await page.locator('#gain-completion').isVisible(), seconds >= 17, `gAIn completion tick at ${seconds}s`);
  }
  await seek(16.8);
  await page.locator('#play-pause').click();
  await page.waitForFunction(() => document.querySelector('#gain-video').ended);
  assert.equal(await page.locator('#gain-completion').isVisible(), true, 'Natural video completion shows the large tick');
  await page.locator('#play-pause').click();
  await seek(17);
  const heldTrace = await page.locator('#reveal-gain rect').evaluate(rect => rect.width.baseVal.value);
  const completeGainWidth = await page.locator('[data-series="gain"]').evaluate(path => path.getBBox().width);
  assert.ok(heldTrace >= completeGainWidth, 'Finished gAIn recording holds its complete curve');
  const positionBeforeToggle = await revealWidths();
  assert.equal(await page.locator('#start-demo').isVisible(), false);
  await page.screenshot({path: 'artifacts/desktop-1920.png'});
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true, '1920 desktop fits the screen');
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.getByRole('button', {name: 'Complete cycle', exact: true}).click();
  assert.equal(await page.locator('#speedup').textContent(), '2.35×');
  assert.equal(await page.locator('#fp32-mean').textContent(), '937 ms');
  assert.equal(await page.locator('#gain-mean').textContent(), '399 ms');
  assert.deepEqual(await revealWidths(), positionBeforeToggle, 'Metric switching keeps the reveal position');
  await page.getByRole('button', {name: 'AI computation', exact: true}).click();
  await page.locator('#latency-chart').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#chart-tooltip').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#chart-tooltip').isVisible(), false);
  await page.locator('#restart').click();
  await page.waitForFunction(() => {
    const video = document.querySelector('#fp32-video');
    return !video.paused && video.currentTime > .1 && video.currentTime < 2;
  });
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.phase-overlay .complete').count(), 0, 'Replay clears phase ticks');
  assert.equal(await page.locator('#gain-completion').isVisible(), false, 'Replay clears completion tick');
  assert.ok((await revealWidths()).every(width => width < 150), 'Replay restarts both curves near the beginning');
  await page.locator('#play-pause').click();
  await seek(44.8);
  await page.locator('#play-pause').click();
  await page.waitForFunction(() => {
    const video = document.querySelector('#fp32-video');
    return !video.paused && video.currentTime > .1 && video.currentTime < 2;
  });
  assert.equal(await page.locator('.phase-overlay .complete').count(), 0, 'Automatic loop restarts both recordings');
  assert.equal(await page.locator('#gain-completion').isVisible(), false, 'Automatic loop clears completion tick');
  await page.locator('#play-pause').click();
  await seek(17);
  await page.setViewportSize({width: 1366, height: 768});
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#start-demo').isVisible(), false, 'No fallback overlay after successful looping and seeking');
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true, '1366 desktop fits the screen');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No desktop horizontal overflow');
  await page.screenshot({path: 'artifacts/desktop-1366.png'});
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal overflow');
  await page.screenshot({path: 'artifacts/mobile-390.png', fullPage: true});
  assert.deepEqual(errors, []);
  console.log('Passed: measured data, natural-speed autoplay, trims, milestone ticks, final completion tick, no progress bar, shared controls, looping, metric toggle, keyboard chart inspection and desktop/mobile layouts.');
} finally {
  await browser.close();
}
