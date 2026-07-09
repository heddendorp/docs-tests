# Concept

Documentation tests combine three things that are usually separate:

- a regression test
- a guided product walkthrough
- screenshot evidence

The result is an executable guide. When the product changes, the guide either
regenerates from the new behavior or fails where the old guide is no longer
true.

## Why This Exists

Traditional product docs drift because screenshots and prose are maintained
manually. Traditional e2e tests verify behavior but rarely explain that behavior
to users.

This project connects both:

- Playwright drives the product like a user.
- Assertions protect the behavior.
- Attachments capture the explanation and visual evidence.
- A reporter writes the final Markdown.

## Authoring Pattern

```ts
test("Create a project", async ({ page }, testInfo) => {
  await page.goto("/projects");

  await attachMarkdown(
    testInfo,
    `
# Create a project

Use the project list to create a new project.
`,
  );

  await page.getByRole("button", { name: "New project" }).click();
  await expect(page.getByRole("heading", { name: "New project" })).toBeVisible();
  await takeDocScreenshot(testInfo, page, page.getByRole("dialog"), "New project form");
});
```

The Markdown should explain what the user needs to know. The assertions should
prove the text is still accurate.

## What to Port First

Start with three guides:

1. A getting-started flow that proves the app opens and shows the main surface.
2. A core happy path that demonstrates the main product value.
3. An admin/settings flow that documents configuration or permissions.

Once those are stable, add recovery, unavailable, and permission-denied states.

## Improvement Roadmap

Short term:

- add app-specific fixtures for deterministic data
- add a publish command for the target documentation app
- establish a drift check for committed generated output

Medium term:

- add accessibility scans to docs flows
- add aria snapshots for key screens
- split draft and publish output modes in CI

Long term:

- generate a navigation tree from the manifest
- create persona/permission filtered documentation views
- attach product requirement IDs or support article IDs as annotations
