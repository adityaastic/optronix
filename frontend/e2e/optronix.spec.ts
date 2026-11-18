import { expect, test } from '@playwright/test';

test.describe('OPTRONIX Minimal SaaS Sales & Visit Management E2E Flows', () => {
  test('1. Sales Employee journey + Mobile responsive field workflow: Login -> Collapsible Sidebar -> Schedule -> Confirm -> Mobile Check-In/Pause/Resume/Confirmed Check-Out -> Outcome & Follow-Up -> Reports -> Logout', async ({
    page,
  }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('button', { name: /^Sign in$/i }).first(),
    ).toBeVisible();

    await page.locator('#email').first().fill('aditya.sharma@optronix.com');
    await page.locator('#password').first().fill('Optronix@2026!');
    await page.getByRole('button', { name: /^Sign in$/i }).first().click();

    await expect(page).toHaveURL(/\/dashboard/);

    // Verify collapsible sidebar toggle works cleanly on desktop
    const collapseBtn = page.getByRole('button', { name: /Collapse sidebar/i });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    const expandBtn = page.getByRole('button', { name: /Expand sidebar/i });
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    // Navigate to Schedule Meeting
    await page.goto('/meetings/new');
    await expect(
      page.getByRole('heading', { name: /Schedule meeting/i }),
    ).toBeVisible();

    const uniqueTitle = `E2E Architecture Briefing ${Date.now()}`;
    await page
      .getByPlaceholder('e.g. Q4 Enterprise SLA Review')
      .fill(uniqueTitle);

    await page
      .getByRole('button', { name: /Confirm & Schedule Meeting/i })
      .click();

    // Redirected to Meeting Details (/meetings/[id])
    await expect(page).toHaveURL(/\/meetings\/[a-f0-9]{24}$/);
    await expect(page.getByText(uniqueTitle)).toBeVisible();

    // Register a collateral attachment on Meeting Details
    await page
      .getByPlaceholder(/Document name/i)
      .fill('Enterprise_SLA_Deck.pdf');
    await page.getByRole('button', { name: /^Attach$/i }).click();
    await expect(page.getByText('Enterprise_SLA_Deck.pdf')).toBeVisible();

    // Confirm Slot
    await page.getByRole('button', { name: /Confirm Slot/i }).click();
    await expect(page.getByText('Confirmed').first()).toBeVisible();

    // Switch to Mobile Field Viewport (375x812) for one-handed Check-In / Check-Out test
    await page.setViewportSize({ width: 375, height: 812 });

    await page
      .getByRole('link', { name: /Field Visit Check-In \/ Out/i })
      .click();
    await expect(page).toHaveURL(/\/meetings\/[a-f0-9]{24}\/visit$/);

    // Verify zero horizontal overflow on 375px mobile screen
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);

    // Supply off-site reason if browser mock coordinates are outside site perimeter
    const overrideInput = page.getByPlaceholder(/Explain off-site location/i);
    if (await overrideInput.isVisible()) {
      await overrideInput.fill('E2E verified off-site executive briefing room');
    }

    // Check in
    await page
      .getByRole('button', { name: /Confirm & Check In Now/i })
      .click();
    await expect(page.getByText(/Active visit timer/i)).toBeVisible();

    // Pause visit session and then Resume visit session
    await page.getByRole('button', { name: /Pause Timer/i }).click();
    await page.getByRole('button', { name: /Confirm Pause/i }).click();
    await expect(
      page.getByRole('button', { name: /Resume Visit/i }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Resume Visit/i }).click();
    await expect(
      page.getByRole('button', { name: /Pause Timer/i }),
    ).toBeVisible();

    // Prominent Check Out -> Confirmation Dialog -> Finalize & Record Outcome
    await page.getByRole('button', { name: /^Check Out$/i }).click();
    await expect(
      page.getByText(/Finalize visit check-out\?/i),
    ).toBeVisible();
    await page
      .getByRole('button', { name: /Confirm Check-Out & Record Outcome/i })
      .click();
    await expect(page).toHaveURL(/\/meetings\/[a-f0-9]{24}\/outcome$/);

    // Restore desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // Select "Follow-up required", add deliverable, enter summary, and lock meeting
    await page
      .getByRole('button', { name: /Follow-up required/i })
      .first()
      .click();
    await page
      .getByPlaceholder(/Concise executive summary/i)
      .fill(
        'Customer CTO approved multi-region PoC deployment and commercial timeline.',
      );

    const fupTitle = `E2E Deliverable ${Date.now()}`;
    const delivInput = page.getByPlaceholder(/Send product quotation/i);
    if (!(await delivInput.isVisible())) {
      await page.getByRole('button', { name: /Add Deliverable/i }).click();
    }
    await page
      .getByPlaceholder(/Send product quotation/i)
      .first()
      .fill(fupTitle);

    await page
      .getByRole('button', { name: /Complete & Lock Meeting/i })
      .click();

    await expect(page).toHaveURL(/\/meetings\/[a-f0-9]{24}$/);
    await expect(page.getByText('Completed').first()).toBeVisible();

    // Complete the newly spawned follow-up task on /follow-ups
    await page.goto('/follow-ups');
    await expect(page.getByText(fupTitle)).toBeVisible();
    await page.getByRole('button', { name: /^Complete$/i }).first().click();

    // View personal reports on /reports
    await page.goto('/reports');
    await expect(
      page.getByRole('heading', { name: /^Reports$/i }),
    ).toBeVisible();

    // Sales Employee attempting to access Admin Settings sees access guard
    await page.goto('/admin/settings');
    await expect(
      page.getByRole('heading', { name: /Admin access required/i }),
    ).toBeVisible();

    // Sign Out from sidebar
    await page.getByRole('button', { name: /Sign out/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('2. Sales Manager governance: Login -> Team Activity -> Contextual Menu Reopen Completed Meeting -> Team Reports', async ({
    page,
  }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('#email').first().fill('priya.mehta@optronix.com');
    await page.locator('#password').first().fill('Optronix@2026!');
    await page.getByRole('button', { name: /^Sign in$/i }).first().click();

    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/team-activity');
    await expect(
      page.getByRole('heading', { name: /Team activity/i }),
    ).toBeVisible();

    // Locate a Completed meeting row in Meeting progress and open its contextual ActionMenu
    const completedRow = page
      .locator('tbody tr')
      .filter({ hasText: 'Completed' })
      .first();
    await expect(completedRow).toBeVisible();
    await completedRow.getByRole('button', { name: /Actions for/i }).click();

    await page.getByRole('menuitem', { name: /Reopen meeting/i }).click();

    await expect(
      page.getByRole('button', { name: /Confirm & reopen/i }),
    ).toBeVisible();
    await page
      .getByPlaceholder(/Add context for the assigned employee/i)
      .fill('E2E Manager audit reopen to append signed NDA specification.');
    await page.getByRole('button', { name: /Confirm & reopen/i }).click();

    await expect(
      page.getByText(/reopened and recorded in audit log/i),
    ).toBeVisible();

    // Verify Manager Team Reports
    await page.goto('/reports');
    await expect(page.getByText(/Employee breakdown/i)).toBeVisible();
  });

  test('3. Admin governance + Secure Single-Use Invitation Onboarding: Invite User -> Verify Link -> Set Password -> Activate -> Reject Token Reuse', async ({
    page,
  }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.locator('#email').first().fill('vikramaditya.roy@optronix.com');
    await page.locator('#password').first().fill('Optronix@2026!');
    await page.getByRole('button', { name: /^Sign in$/i }).first().click();

    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/admin/settings');
    await expect(
      page.getByRole('heading', { name: /Admin settings/i }),
    ).toBeVisible();

    // Inspect Roles & permissions tab
    await page.getByRole('tab', { name: /Roles & permissions/i }).click();
    await expect(page.getByText(/enabled permissions/i).first()).toBeVisible();

    // Inspect Audit logs tab and verify SHA-256 chain verified badge
    await page.getByRole('tab', { name: /Audit logs/i }).click();
    await expect(page.getByText(/SHA-256 chain verified/i)).toBeVisible();

    // Switch back to Users tab and invite a new Sales Employee
    await page.getByRole('tab', { name: /^Users/i }).click();
    await page.getByRole('button', { name: /Invite user/i }).click();

    const uniqueEmail = `ananya.e2e.${Date.now()}@optronix.com`;
    await page.locator('#inv-first').fill('Ananya');
    await page.locator('#inv-last').fill('Iyer');
    await page.locator('#inv-email').fill(uniqueEmail);
    await page.locator('#inv-phone').fill('+91 98100 54321');
    await page.locator('#inv-territory').fill('Bengaluru & South');

    await page.getByRole('button', { name: /Send invitation/i }).click();

    await expect(
      page.getByText(/Onboarding invitation link ready/i),
    ).toBeVisible();

    const inviteUrl = await page
      .getByLabel(/Single-use onboarding invitation URL/i)
      .inputValue();
    expect(inviteUrl).toContain('/invite?token=');

    // Sign out Admin so we can onboard as the newly invited employee
    await page.getByRole('button', { name: /Sign out/i }).first().click();
    await expect(page).toHaveURL(/\/login/);

    // Open the single-use invitation link
    await page.goto(inviteUrl, { waitUntil: 'networkidle' });
    await expect(
      page.getByRole('heading', { name: /Accept workspace invitation/i }),
    ).toBeVisible();
    await expect(page.getByText('Ananya Iyer')).toBeVisible();
    await expect(page.getByText('Sales Employee')).toBeVisible();

    // Set initial password and activate account
    await page.locator('#invite-password').fill('Ananya@2026!Secure');
    await page.locator('#invite-confirm-password').fill('Ananya@2026!Secure');
    await page
      .getByRole('button', { name: /Activate account & continue/i })
      .click();

    // Redirected to Sales Employee dashboard as an active authenticated user
    await expect(page).toHaveURL(/\/dashboard/);

    // Sign out and verify the invitation token is strictly single-use (cannot be reused)
    await page.getByRole('button', { name: /Sign out/i }).first().click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto(inviteUrl, { waitUntil: 'networkidle' });
    await expect(
      page
        .getByText(/invalid, expired, or has already been activated/i)
        .first(),
    ).toBeVisible();
  });
});
