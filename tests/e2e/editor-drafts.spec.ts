import { expect, test, type Dialog, type Page } from '@playwright/test';

const headers = { Origin: 'http://localhost:4310' };
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email', { exact: true }).fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}
async function workflow(page: Page, id = 'draft-workflow') {
  const response = await page.request.post('/api/workflows', {
    headers,
    data: {
      workflowId: id,
      name: `Draft workflow ${id}`,
      steps: [
        {
          stepId: 'welcome',
          name: 'Welcome email',
          type: 'email',
          controlValues: { subject: 'Hello', body: '<p>Saved email</p>' },
        },
        {
          stepId: 'inbox',
          name: 'Inbox follow-up',
          type: 'in_app',
          controlValues: { body: 'Saved Inbox' },
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
}
async function layout(page: Page) {
  expect(
    (
      await page.request.post('/api/layouts', {
        headers,
        data: {
          identifier: 'draft-layout',
          name: 'Draft layout',
          html: '<main>{{{body}}}</main>',
          translations: false,
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/layouts/draft-layout');
  await expect(page.getByLabel('Layout HTML', { exact: true })).toHaveValue(
    '<main>{{{body}}}</main>',
  );
}
async function template(page: Page, identifier: string) {
  const response = await page.request.post('/api/templates', {
    headers,
    data: {
      name: identifier,
      identifier,
      content: { subject: `Original ${identifier}`, html: '<p>Original template</p>' },
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { id: string };
}
async function replaceMonaco(page: Page, text: string) {
  const editor = page.getByRole('textbox', { name: 'Editor content', exact: true });
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(text);
}
function nextDialog(page: Page, action: (dialog: Dialog) => Promise<void>) {
  const handle = async (dialog: Dialog) => {
    try {
      await action(dialog);
    } finally {
      page.off('dialog', handle);
    }
  };
  // Keep the listener registered until the protocol command has handled the
  // dialog; removing the final listener first can race automatic dismissal.
  page.on('dialog', handle);
}
function acceptNextDialog(page: Page) {
  nextDialog(page, async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('layout drafts survive failed saves and guarded navigation, restore through history and discard explicitly', async ({
  page,
}) => {
  await login(page);
  await layout(page);
  const content = '<main>Private unsaved layout {{{body}}}</main>';
  await page.getByLabel('Layout HTML', { exact: true }).fill(content);
  await page.route('**/api/layouts/draft-layout', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, json: { message: 'Layout save unavailable' } })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Save layout version' }).click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText('Layout save unavailable');
  await expect(page.getByLabel('Layout HTML', { exact: true })).toHaveValue(content);
  nextDialog(page, (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Emails', exact: true }).click();
  await expect(page).toHaveURL(/\/layouts\/draft-layout$/);
  acceptNextDialog(page);
  await page.getByRole('link', { name: 'Emails', exact: true }).click();
  await expect(page).toHaveURL(/\/emails$/);
  await page.goBack();
  await expect(page.getByLabel('Layout HTML', { exact: true })).toHaveValue(content);
  expect(
    await page.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].some((value) =>
        value.includes('Private unsaved layout'),
      ),
    ),
  ).toBe(false);
  acceptNextDialog(page);
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByLabel('Layout HTML', { exact: true })).toHaveValue(
    '<main>{{{body}}}</main>',
  );
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);
});

test('locale typing is inert, explicit switches preserve raw invalid JSON by workflow and locale', async ({
  page,
}) => {
  await login(page);
  await workflow(page);
  await workflow(page, 'other-workflow');
  await page.goto('/translations');
  await page.getByLabel('Translation workflow', { exact: true }).selectOption('draft-workflow');
  const json = page.getByRole('textbox', { name: 'Dictionary JSON', exact: true });
  await json.fill('{"unfinished":');
  await page.getByLabel('Locale', { exact: true }).fill('fr_FR');
  await expect(json).toHaveValue('{"unfinished":');
  await expect(page.getByText('Active locale:', { exact: false })).toContainText('en_US');
  nextDialog(page, (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Load locale', exact: true }).click();
  await expect(json).toHaveValue('{"unfinished":');
  acceptNextDialog(page);
  await page.getByRole('button', { name: 'Load locale', exact: true }).click();
  await expect(json).toHaveValue('{}');
  await json.fill('{"greeting":"Bonjour"}');
  await page.getByLabel('Locale', { exact: true }).fill('en_US');
  acceptNextDialog(page);
  await page.getByRole('button', { name: 'Load locale', exact: true }).click();
  await expect(json).toHaveValue('{"unfinished":');
  await page.getByRole('button', { name: 'Save dictionary version', exact: true }).click();
  await expect(page.locator('.error-box[role="alert"]')).toBeVisible();
  await expect(json).toHaveValue('{"unfinished":');
  acceptNextDialog(page);
  await page.getByLabel('Translation workflow', { exact: true }).selectOption('other-workflow');
  await expect(json).toHaveValue('{}');
  await page.getByLabel('Translation workflow', { exact: true }).selectOption('draft-workflow');
  await expect(json).toHaveValue('{"unfinished":');
  await json.fill('{"greeting":"Hello"}');
  await page.getByRole('button', { name: 'Save dictionary version', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);
  await expect(json).toHaveValue(/Hello/);
});

test('templates retain raw JSON and field edits across version selection and failed save', async ({
  page,
}) => {
  await login(page);
  const created = await page.request.post('/api/templates', {
    headers,
    data: {
      name: 'Draft template',
      identifier: 'draft-template',
      content: { subject: 'Saved subject', html: '<p>Saved template</p>' },
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  await page.goto(`/templates/${id}`);
  await page.getByLabel('Subject', { exact: true }).fill('Unsaved template subject');
  await page.getByLabel('Variable fallbacks (JSON)', { exact: true }).fill('{"unfinished":');
  acceptNextDialog(page);
  await page.getByLabel('Template version', { exact: true }).selectOption('1');
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('Saved subject');
  await page.getByLabel('Template version', { exact: true }).selectOption('');
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('Unsaved template subject');
  await expect(page.getByLabel('Variable fallbacks (JSON)', { exact: true })).toHaveValue(
    '{"unfinished":',
  );
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect(page.locator('.error-box[role="alert"]')).toBeVisible();
  await page.getByLabel('Variable fallbacks (JSON)', { exact: true }).fill('{}');
  await page.route(`**/api/templates/${id}/versions`, (route) =>
    route.fulfill({ status: 503, json: { message: 'Template save unavailable' } }),
  );
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText('Template save unavailable');
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('Unsaved template subject');
});

test('workflow raw JSON survives tabs, steps and history and still prevents saving hidden invalid content', async ({
  page,
}) => {
  await login(page);
  await workflow(page);
  await page.goto('/workflows/draft-workflow');
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await replaceMonaco(page, '{"unfinished":');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Configure', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /STEP 2.*Inbox follow-up/ }).click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('Saved Inbox');
  await page.getByRole('button', { name: /STEP 1.*Welcome email/ }).click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('unfinished');
  acceptNextDialog(page);
  await page.getByRole('link', { name: 'Back to workflows', exact: true }).click();
  await expect(page).toHaveURL(/\/workflows$/);
  await page.goBack();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('unfinished');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await replaceMonaco(page, '{"subject":"New subject","body":"<p>Valid draft</p>"}');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Revision 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);
});

test('failed environment switch preserves draft and a successful switch clears it', async ({
  page,
}) => {
  await login(page);
  await layout(page);
  await page
    .getByLabel('Layout HTML', { exact: true })
    .fill('<main>Keep after switch failure {{{body}}}</main>');
  let fail = true;
  await page.route('**/api/session/switch', (route) =>
    fail
      ? route.fulfill({ status: 503, json: { message: 'Workspace switch unavailable' } })
      : route.continue(),
  );
  acceptNextDialog(page);
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: 'Production' });
  await expect(page.locator('.error-box[role="alert"]')).toContainText(
    'Workspace switch unavailable',
  );
  await expect(page.getByLabel('Layout HTML', { exact: true })).toHaveValue(
    /Keep after switch failure/,
  );
  fail = false;
  acceptNextDialog(page);
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: 'Production' });
  await expect(page).toHaveURL(/\/layouts$/);
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: 'Development' });
  await page.getByRole('link', { name: 'Draft layout', exact: true }).click();
  await expect(page.getByLabel('Layout HTML', { exact: true })).toHaveValue(
    '<main>{{{body}}}</main>',
  );
});

test('re-entering an editor keeps controls locked until its pending save finishes', async ({
  page,
}) => {
  await login(page);
  await layout(page);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route('**/api/layouts/draft-layout', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    started = true;
    await delayed;
    return route.continue();
  });
  await page.getByLabel('Layout HTML', { exact: true }).fill('<main>Submitted {{{body}}}</main>');
  await page.getByRole('button', { name: 'Save layout version' }).click();
  await expect.poll(() => started).toBe(true);
  acceptNextDialog(page);
  await page.getByRole('link', { name: 'Emails', exact: true }).click();
  await expect(page).toHaveURL(/\/emails$/);
  await page.goBack();
  const html = page.getByLabel('Layout HTML', { exact: true });
  await expect(html).toBeDisabled();
  release();
  await expect(page.getByText('Version 2 · draft-layout', { exact: true })).toBeVisible();
  await expect(html).toHaveValue('<main>Submitted {{{body}}}</main>');
  await expect(html).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);
});

test('accepted layout saves stay visible if the follow-up read fails', async ({ page }) => {
  await login(page);
  await layout(page);
  let written = false;
  await page.route('**/api/layouts/draft-layout', async (route) => {
    if (route.request().method() === 'PUT') {
      const response = await route.fetch();
      written = true;
      return route.fulfill({ response });
    }
    if (written)
      return route.fulfill({ status: 503, json: { message: 'Version refresh unavailable' } });
    return route.continue();
  });
  await page
    .getByLabel('Layout HTML', { exact: true })
    .fill('<article>Accepted changes {{{body}}}</article>');
  await page.getByRole('button', { name: 'Save layout version', exact: true }).click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText(
    'Version refresh unavailable',
  );
  await expect(page.getByLabel('Layout HTML', { exact: true })).toHaveValue(
    '<article>Accepted changes {{{body}}}</article>',
  );
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);
});

test('duplicate step identifiers cannot overwrite another step’s invalid JSON draft', async ({
  page,
}) => {
  await login(page);
  await workflow(page);
  await page.goto('/workflows/draft-workflow');
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await replaceMonaco(page, '{"firstDraft":');
  await page.getByRole('button', { name: /STEP 2.*Inbox follow-up/ }).click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await replaceMonaco(page, '{"secondDraft":');
  await page.getByRole('button', { name: /STEP 1.*Welcome email/ }).click();
  await page.getByLabel('Step identifier', { exact: true }).fill('inbox');
  await expect(page.getByLabel('Step identifier', { exact: true })).toHaveValue('welcome');
  await expect(page.locator('.error-box[role="alert"]')).toContainText('unique identifier');
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('firstDraft');
  await page.getByRole('button', { name: /STEP 2.*Inbox follow-up/ }).click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('secondDraft');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
});

test('clearing and retyping a step identifier preserves its unfinished JSON', async ({ page }) => {
  await login(page);
  await workflow(page);
  await page.goto('/workflows/draft-workflow');
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await replaceMonaco(page, '{"renamedDraft":');
  await page.getByRole('tab', { name: 'Configure', exact: true }).click();
  await page.getByLabel('Step identifier', { exact: true }).fill('');
  await expect(page.getByLabel('Step identifier', { exact: true })).toHaveValue('');
  await page.getByLabel('Step identifier', { exact: true }).fill('renamed-step');
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('renamedDraft');
  await page.getByRole('button', { name: /STEP 2.*Inbox follow-up/ }).click();
  await page.getByRole('button', { name: /STEP 1.*Welcome email/ }).click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('renamedDraft');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
});

test('workspace changes warn about drafts retained on a different page', async ({ page }) => {
  await login(page);
  await layout(page);
  await page
    .getByLabel('Layout HTML', { exact: true })
    .fill('<main>Retained draft {{{body}}}</main>');
  acceptNextDialog(page);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  nextDialog(page, async (dialog) => {
    expect(dialog.message()).toContain('drafts kept on other pages');
    await dialog.dismiss();
  });
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: 'Production' });
  await expect(
    page.getByLabel('Environment', { exact: true }).locator('option:checked'),
  ).toHaveText('Development');
  await page.goBack();
  await expect(page.getByLabel('Layout HTML', { exact: true })).toHaveValue(
    '<main>Retained draft {{{body}}}</main>',
  );
});

test('an accepted draft fallback retires when refreshed server content is observed', async ({
  page,
}) => {
  await login(page);
  await layout(page);
  const original = '<main>{{{body}}}</main>';
  const accepted = '<main>Accepted version two {{{body}}}</main>';
  await page.getByLabel('Layout HTML', { exact: true }).fill(accepted);
  await page.getByRole('button', { name: 'Save layout version', exact: true }).click();
  await expect(page.getByText('Version 2 · draft-layout', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Layout HTML', { exact: true })).toHaveValue(accepted);

  // Another editor legitimately restores the earlier content in a new version.
  const restored = await page.request.put('/api/layouts/draft-layout', {
    headers,
    data: {
      identifier: 'draft-layout',
      name: 'Draft layout',
      html: original,
      translations: false,
    },
  });
  expect(restored.ok()).toBe(true);
  // Query data stays fresh for ten seconds. Advance that clock so returning to
  // the editor actually reads the other editor's new server revision.
  await page.clock.install();
  await page.clock.fastForward(11_000);
  await page.getByRole('link', { name: 'Emails', exact: true }).click();
  await expect(page).toHaveURL(/\/emails$/);
  await page.goBack();
  await expect(page.getByText('Version 3 · draft-layout', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Layout HTML', { exact: true })).toHaveValue(original);
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);
});

test('a delayed template save cannot change the version URL of another editor', async ({
  page,
}) => {
  await login(page);
  const first = await template(page, 'first-template');
  const second = await template(page, 'second-template');
  await page.goto(`/templates/${first.id}`);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route(`**/api/templates/${first.id}/versions`, async (route) => {
    started = true;
    await delayed;
    return route.continue();
  });
  await page.getByLabel('Subject', { exact: true }).fill('Accepted first template');
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  acceptNextDialog(page);
  await page.locator('a.back-link').click();
  await page.getByRole('link', { name: 'second-template', exact: false }).click();
  await page.getByLabel('Template version', { exact: true }).selectOption('1');
  await expect(page).toHaveURL(new RegExp(`/templates/${second.id}\\?version=1$`));
  const refreshed = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().endsWith(`/api/templates/${second.id}?version=1`),
  );
  release();
  await (await refreshed).finished();
  // Let the invalidation promise and its save continuation finish rendering.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page).toHaveURL(new RegExp(`/templates/${second.id}\\?version=1$`));
  await expect(page.getByLabel('Template version', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('Original second-template');
});

test('saving from an immutable template version never replaces that historical content', async ({
  page,
}) => {
  await login(page);
  const { id } = await template(page, 'historical-template');
  const original = await (await page.request.get(`/api/templates/${id}`)).json();
  // The fixture keeps only latest content; this route models the API's immutable
  // historical-version response while all saves and latest reads stay real.
  await page.route(`**/api/templates/${id}?version=1`, (route) =>
    route.fulfill({ json: original }),
  );
  await page.goto(`/templates/${id}`);
  await page.getByLabel('Template version', { exact: true }).selectOption('1');
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
    'Original historical-template',
  );
  await page.getByLabel('Subject', { exact: true }).fill('Accepted new version');
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect(page.getByLabel('Template version', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('Accepted new version');
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);
  await page.getByLabel('Template version', { exact: true }).selectOption('1');
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
    'Original historical-template',
  );
  await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);
});
