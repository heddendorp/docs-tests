import { test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const authFile = path.resolve('.auth/docs-user.json');

setup('prepare documentation auth state', async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  const username = process.env['DOCS_AUTH_USERNAME'];
  const password = process.env['DOCS_AUTH_PASSWORD'];

  if (!username || !password) {
    fs.writeFileSync(
      authFile,
      JSON.stringify({ cookies: [], origins: [] }, null, 2),
    );
    return;
  }

  await page.goto(process.env['DOCS_LOGIN_URL'] ?? '/login');
  await page.getByLabel(/email|username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'));
  await page.context().storageState({ path: authFile });
});
