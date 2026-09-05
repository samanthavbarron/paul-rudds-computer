import { test, expect } from '@playwright/test';

test('real 3D playback, sequences, view, speed, export and mobile layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveCount(2);
  await page.getByRole('button', { name: /TAYNE Original sequence/ }).click();
  await expect(page.locator('.output-window h2')).toContainText('TAYNE');
  await expect(page.locator('#clip')).toHaveValue('HAT WOBBLE');
  await page.getByRole('button', { name: 'Turn around', exact: true }).click();
  await expect(page.locator('.viewport-top')).toContainText('BACK VIEW');
  await page.getByRole('button', { name: 'Double speed', exact: true }).click();
  await expect(page.locator('#tempo')).toHaveValue('2');
  await page.getByRole('button', { name: /Engage Flarhgunnstow/ }).click();
  await expect(page.locator('.flerne-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Pause sequence' }).click();
  await expect(page.getByRole('button', { name: 'Play sequence' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export 3D asset' }).click();
  expect((await download).suggestedFilename()).toBe('tayne.glb');
  await page.getByRole('button', { name: 'Maximize window' }).click();
  await expect(page.locator('.output-window')).toHaveClass(/expanded/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.output-window')).not.toHaveClass(/expanded/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#command').scrollIntoViewIfNeeded();
  await expect(page.locator('#command')).toBeVisible();
  expect(errors).toEqual([]);
});

test('slow submission never polls a fake job; successful generation and motion update library', async ({ page, request }) => {
  const { sequences } = await (await request.get('/api/sequences')).json();
  const result = { ...sequences[0], id: 'test-generated', source: 'codex', character: { ...sequences[0].character, name: 'TEST ASTRONAUT' } };
  let falsePolls = 0;
  await page.route('**/api/jobs/submitting', async route => { falsePolls++; await route.fulfill({ status: 404, json: { error: 'Fake job.' } }); });
  await page.route('**/api/generate', async route => {
    expect(route.request().postDataJSON()).toEqual({ prompt: 'A disco astronaut' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.fulfill({ status: 202, json: { id: 'test-job', status: 'queued', stage: 'WAITING' } });
  });
  await page.route('**/api/jobs/test-job', route => route.fulfill({ json: { id: 'test-job', status: 'complete', result } }));
  await page.goto('/');
  await page.locator('#command').fill('A disco astronaut');
  await page.getByRole('button', { name: 'ENTER ↵' }).click();
  await expect(page.locator('.output-window h2')).toContainText('TEST ASTRONAUT', { timeout: 10000 });
  expect(falsePolls).toBe(0);
  const motionResult = { ...result, character: { ...result.character, defaultClip: 'NEW WAVE', clips: [...result.character.clips, { ...result.character.clips[0], name: 'NEW WAVE' }] } };
  await page.route('**/api/sequences/test-generated/motion', route => route.fulfill({ status: 202, json: { id: 'motion-job', status: 'queued' } }));
  await page.route('**/api/jobs/motion-job', route => route.fulfill({ json: { id: 'motion-job', status: 'complete', result: motionResult } }));
  await page.getByRole('button', { name: 'DIRECT MOVEMENT', exact: true }).click();
  await page.locator('#command').fill('Wave as if deeply disappointed');
  await page.getByRole('button', { name: 'ENTER ↵' }).click();
  await expect(page.locator('#clip')).toHaveValue('NEW WAVE');
  await expect(page.locator('.sequence-list').getByRole('button', { name: /TEST ASTRONAUT/ })).toHaveCount(1);
});

test('cancellation respects a completed server result, and provider errors remain visible', async ({ page, request }) => {
  const { sequences } = await (await request.get('/api/sequences')).json();
  const result = { ...sequences[0], id: 'just-finished', source: 'codex', character: { ...sequences[0].character, name: 'JUST FINISHED' } };
  await page.route('**/api/generate', route => route.fulfill({ status: 202, json: { id: 'cancel-race', status: 'generating', stage: 'COMPUTING' } }));
  await page.route('**/api/jobs/cancel-race', route => route.fulfill({ json: route.request().method() === 'DELETE' ? { id: 'cancel-race', status: 'complete', result } : { id: 'cancel-race', status: 'generating', stage: 'COMPUTING' } }));
  await page.goto('/');
  await page.locator('#command').fill('A very punctual dancer');
  await page.getByRole('button', { name: 'ENTER ↵' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.output-window h2')).toContainText('JUST FINISHED');
  await page.route('**/api/generate', route => route.fulfill({ status: 202, json: { id: 'error-job', status: 'queued' } }));
  await page.route('**/api/jobs/error-job', route => route.fulfill({ json: { id: 'error-job', status: 'error', error: 'Codex is not authenticated. Run codex login.' } }));
  await page.locator('#command').fill('An error prone dancer');
  await page.getByRole('button', { name: 'ENTER ↵' }).click();
  await expect(page.getByRole('log')).toContainText('Codex is not authenticated. Run codex login.');
  await expect(page.locator('#command')).toBeEnabled();
  await expect(page.locator('.output-window h2')).toContainText('JUST FINISHED');
});
