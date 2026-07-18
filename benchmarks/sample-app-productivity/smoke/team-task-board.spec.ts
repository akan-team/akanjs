import { expect, type Locator, type Page, test } from "@playwright/test";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";

const byTestIdOrLabel = (page: Page, testId: string, label: RegExp): Locator =>
  page.getByTestId(testId).or(page.getByLabel(label)).or(page.getByPlaceholder(label));

const firstExisting = async (...locators: Locator[]): Promise<Locator> => {
  for (const locator of locators) {
    if ((await locator.count()) > 0) return locator.first();
  }
  return locators[0].first();
};

const selectOptionLike = async (page: Page, control: Locator, preferred: RegExp, fallback: string) => {
  const tag = await control.evaluate((node) => node.tagName.toLowerCase()).catch(() => "");
  if (tag === "select") {
    const options = await control.locator("option").allTextContents();
    const match = options.find((option) => preferred.test(option));
    await control.selectOption({ label: match ?? options.at(-1) ?? fallback });
    return;
  }
  await control.click();
  const option = page.getByRole("option", { name: preferred }).or(page.getByText(preferred));
  if ((await option.count()) > 0) await option.first().click();
  else await page.keyboard.press("ArrowDown").then(() => page.keyboard.press("Enter"));
};

test("team task board main flow", async ({ page }) => {
  await test.step("open task list", async () => {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    if (
      await page
        .getByText(/task/i)
        .count()
        .then((count) => count === 0)
    ) {
      await page.goto(`${baseUrl}/tasks`, { waitUntil: "domcontentloaded" });
    }

    const taskList = page
      .getByTestId("task-list")
      .or(page.getByRole("list"))
      .or(page.getByText(/Draft onboarding/i));
    await expect(taskList.first()).toBeVisible();
  });

  const title = `Smoke task ${Date.now()}`;
  await test.step("create and assign task", async () => {
    await byTestIdOrLabel(page, "new-task-title", /title|task/i).fill(title);
    const description = byTestIdOrLabel(page, "new-task-description", /description/i);
    if ((await description.count()) > 0)
      await description.first().fill("Created by productivity benchmark smoke test.");

    const assignee = byTestIdOrLabel(page, "assignee-select", /assignee|user/i);
    if ((await assignee.count()) > 0) await selectOptionLike(page, assignee.first(), /Mina|Joon|Alex/i, "Mina Kim");

    await firstExisting(
      page.getByTestId("create-task"),
      page.getByRole("button", { name: /create|add|save/i }),
      page.getByText(/create|add|save/i),
    ).then((button) => button.click());
    await expect(page.getByText(title)).toBeVisible();
  });

  await test.step("change status and filter", async () => {
    const createdRow = page
      .getByText(title)
      .locator("xpath=ancestor::*[self::li or self::tr or self::article or self::div][1]");
    const statusControl = createdRow
      .getByTestId("task-status")
      .or(createdRow.getByLabel(/status/i))
      .or(page.getByTestId("task-status"))
      .or(page.getByLabel(/status/i));
    await selectOptionLike(page, statusControl.first(), /done|complete|in progress/i, "done");

    const filter = byTestIdOrLabel(page, "status-filter", /filter|status/i);
    if ((await filter.count()) > 0) await selectOptionLike(page, filter.first(), /done|all/i, "done");
    await expect(page.getByText(title)).toBeVisible();
  });

  await test.step("show detail and persist after reload", async () => {
    await page.getByText(title).first().click();
    const detail = page.getByTestId("task-detail").or(page.getByText(/Created by productivity benchmark smoke test/i));
    await expect(detail.first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(title)).toBeVisible();
  });
});
