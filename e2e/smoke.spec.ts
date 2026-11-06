import { expect, test, type Page } from '@playwright/test';

async function addPeas(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add item' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Peas');
  await page.getByRole('button', { name: 'Drawer 2' }).click();
  await page.getByLabel('Unit', { exact: true }).selectOption('bag');
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Save' })).toBeHidden();
}

test.describe.configure({ mode: 'serial' });

test('add Peas, 2 bags, Drawer 2: it appears under Drawer 2', async ({ page }) => {
  await addPeas(page);
  const drawer2 = page.locator('app-drawer-group', {
    has: page.getByRole('heading', { name: /Drawer 2/ }),
  });
  await expect(drawer2.getByText('Peas')).toBeVisible();
  await expect(drawer2.getByText('2 bags')).toBeVisible();
});

test('take out twice removes it, Undo brings it back with quantity 1', async ({ page }) => {
  await page.goto('/');
  const peas = page.getByRole('listitem').filter({ hasText: 'Peas' });
  const take = page.getByRole('button', { name: 'Take one Peas out' });
  await take.click();
  await expect(peas).toContainText('1 bag');
  await take.click();
  await expect(peas).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(peas).toBeVisible();
  await expect(peas).toContainText('1 bag');
});

test('search filters the list and shows the empty message', async ({ page }) => {
  await page.goto('/');
  const search = page.getByPlaceholder('Search your freezer');
  await search.fill('pea');
  await expect(page.getByText('Peas', { exact: true })).toBeVisible();
  await search.fill('xyz');
  await expect(page.getByText("Nothing matches 'xyz'.")).toBeVisible();
});

test('dark theme survives a reload', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /^Theme:/ });
  await toggle.click(); // system -> light
  await toggle.click(); // light -> dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the manifest is requested with credentials (Access) and has a stable id', async ({ page, request }) => {
  await page.goto('/');
  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveAttribute('crossorigin', 'use-credentials');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.id).toBe('/');
});
