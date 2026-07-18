# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke/team-task-board.spec.ts >> team task board main flow
- Location: smoke/team-task-board.spec.ts:29:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Smoke task 1781260497660')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Smoke task 1781260497660')

```

```yaml
- main:
  - paragraph: Team Task Board
  - heading "Product Team Tasks" [level=1]
  - paragraph: Track task status and ownership with SQLite-backed persistence.
  - heading "Create task" [level=2]
  - text: Title
  - textbox "Title": Smoke task 1781260497660
  - text: Description
  - textbox "Description":
    - /placeholder: Describe the work
    - text: Created by productivity benchmark smoke test.
  - button "Create task"
  - heading "Tasks" [level=2]
  - text: Status filter
  - combobox "Status filter":
    - option "all" [selected]
    - option "todo"
    - option "in progress"
    - option "done"
  - article:
    - heading "Draft onboarding checklist" [level=3]
    - paragraph: Seed task for draft onboarding checklist.
  - complementary:
    - paragraph: Task detail
    - heading "Draft onboarding checklist" [level=2]
    - paragraph: Seed task for draft onboarding checklist.
    - text: Status
    - combobox "Status":
      - option "todo" [selected]
      - option "in progress"
      - option "done"
    - text: Assignee
    - combobox "Assignee":
      - option "Mina Kim" [selected]
      - option "Joon Park"
      - option "Alex Lee"
```

# Test source

```ts
  1  | import { expect, type Locator, type Page, test } from "@playwright/test";
  2  | 
  3  | const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
  4  | 
  5  | const byTestIdOrLabel = (page: Page, testId: string, label: RegExp): Locator =>
  6  |   page.getByTestId(testId).or(page.getByLabel(label)).or(page.getByPlaceholder(label));
  7  | 
  8  | const firstExisting = async (...locators: Locator[]): Promise<Locator> => {
  9  |   for (const locator of locators) {
  10 |     if ((await locator.count()) > 0) return locator.first();
  11 |   }
  12 |   return locators[0].first();
  13 | };
  14 | 
  15 | const selectOptionLike = async (page: Page, control: Locator, preferred: RegExp, fallback: string) => {
  16 |   const tag = await control.evaluate((node) => node.tagName.toLowerCase()).catch(() => "");
  17 |   if (tag === "select") {
  18 |     const options = await control.locator("option").allTextContents();
  19 |     const match = options.find((option) => preferred.test(option));
  20 |     await control.selectOption({ label: match ?? options.at(-1) ?? fallback });
  21 |     return;
  22 |   }
  23 |   await control.click();
  24 |   const option = page.getByRole("option", { name: preferred }).or(page.getByText(preferred));
  25 |   if ((await option.count()) > 0) await option.first().click();
  26 |   else await page.keyboard.press("ArrowDown").then(() => page.keyboard.press("Enter"));
  27 | };
  28 | 
  29 | test("team task board main flow", async ({ page }) => {
  30 |   await test.step("open task list", async () => {
  31 |     await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  32 |     if (
  33 |       await page
  34 |         .getByText(/task/i)
  35 |         .count()
  36 |         .then((count) => count === 0)
  37 |     ) {
  38 |       await page.goto(`${baseUrl}/tasks`, { waitUntil: "domcontentloaded" });
  39 |     }
  40 | 
  41 |     const taskList = page
  42 |       .getByTestId("task-list")
  43 |       .or(page.getByRole("list"))
  44 |       .or(page.getByText(/Draft onboarding/i));
  45 |     await expect(taskList.first()).toBeVisible();
  46 |   });
  47 | 
  48 |   const title = `Smoke task ${Date.now()}`;
  49 |   await test.step("create and assign task", async () => {
  50 |     await byTestIdOrLabel(page, "new-task-title", /title|task/i).fill(title);
  51 |     const description = byTestIdOrLabel(page, "new-task-description", /description/i);
  52 |     if ((await description.count()) > 0) await description.first().fill("Created by productivity benchmark smoke test.");
  53 | 
  54 |     const assignee = byTestIdOrLabel(page, "assignee-select", /assignee|user/i);
  55 |     if ((await assignee.count()) > 0) await selectOptionLike(page, assignee.first(), /Mina|Joon|Alex/i, "Mina Kim");
  56 | 
  57 |     await firstExisting(
  58 |       page.getByTestId("create-task"),
  59 |       page.getByRole("button", { name: /create|add|save/i }),
  60 |       page.getByText(/create|add|save/i),
  61 |     ).then((button) => button.click());
> 62 |     await expect(page.getByText(title)).toBeVisible();
     |                                         ^ Error: expect(locator).toBeVisible() failed
  63 |   });
  64 | 
  65 |   await test.step("change status and filter", async () => {
  66 |     const createdRow = page
  67 |       .getByText(title)
  68 |       .locator("xpath=ancestor::*[self::li or self::tr or self::article or self::div][1]");
  69 |     const statusControl = createdRow
  70 |       .getByTestId("task-status")
  71 |       .or(createdRow.getByLabel(/status/i))
  72 |       .or(page.getByTestId("task-status"))
  73 |       .or(page.getByLabel(/status/i));
  74 |     await selectOptionLike(page, statusControl.first(), /done|complete|in progress/i, "done");
  75 | 
  76 |     const filter = byTestIdOrLabel(page, "status-filter", /filter|status/i);
  77 |     if ((await filter.count()) > 0) await selectOptionLike(page, filter.first(), /done|all/i, "done");
  78 |     await expect(page.getByText(title)).toBeVisible();
  79 |   });
  80 | 
  81 |   await test.step("show detail and persist after reload", async () => {
  82 |     await page.getByText(title).first().click();
  83 |     const detail = page.getByTestId("task-detail").or(page.getByText(/Created by productivity benchmark smoke test/i));
  84 |     await expect(detail.first()).toBeVisible();
  85 | 
  86 |     await page.reload();
  87 |     await expect(page.getByText(title)).toBeVisible();
  88 |   });
  89 | });
  90 | 
```