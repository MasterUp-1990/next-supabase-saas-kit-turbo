import { Page, expect, test } from '@playwright/test';

import { InvitationsPageObject } from '../invitations/invitations.po';
import {
  getAccountIdByName,
  getAccountImageStatus,
  getAccountById,
  getInvitationAccountId,
  seedAccountImage,
} from '../utils/account-image';
import { HOME_LANDING_URL, TeamAccountsPageObject } from './team-accounts.po';

// Helper function to set up a team with a member
async function setupTeamWithMember(page: Page, memberRole = 'member') {
  // Setup invitations page object
  const invitations = new InvitationsPageObject(page);
  const teamAccounts = invitations.teamAccounts;

  // Setup team with owner
  const { email: ownerEmail, slug } = await invitations.setup();

  // Navigate to members page
  await invitations.navigateToMembers();

  // Create a new member email and invite them with the specified role
  const memberEmail = invitations.auth.createRandomEmail();

  const invites = [
    {
      email: memberEmail,
      role: memberRole,
    },
  ];

  await invitations.openInviteForm();
  await invitations.inviteMembers(invites);

  // Verify the invitation was sent
  await expect(invitations.getInvitations()).toHaveCount(1);

  // Sign out the current user
  await page.context().clearCookies();

  // Sign up with the new member email and accept the invitation
  await invitations.auth.visitConfirmEmailLink(memberEmail);

  await invitations.acceptInvitation();

  await invitations.teamAccounts.openAccountsSelector();

  await expect(invitations.teamAccounts.getTeams()).toHaveCount(1);

  // Sign out and sign back in as the original owner
  await page.context().clearCookies();

  await page.goto('/auth/sign-in');

  await invitations.auth.loginAsUser({
    email: ownerEmail,
    next: '/home',
  });

  // Navigate to the team members page
  await page.goto(`/home/${slug}/members`);

  return { invitations, teamAccounts, ownerEmail, memberEmail, slug };
}

test.describe('Team Accounts', () => {
  test.beforeEach(async ({ page }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    await teamAccounts.setup();
  });

  test('user can update their team name', async ({ page }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    const newTeamName = `Updated-Team-${(Math.random() * 100000000).toFixed(0)}`;

    await teamAccounts.goToSettings();

    // Update just the name (slug stays the same for Latin names)
    await teamAccounts.updateTeamName(newTeamName);

    await page.waitForTimeout(500);

    await teamAccounts.openAccountsSelector();

    await expect(teamAccounts.getTeamFromSelector(newTeamName)).toBeVisible();
  });

  test('cannot create a Team account using reserved names', async ({
    page,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    await teamAccounts.createTeam();

    await teamAccounts.openAccountsSelector();
    await page.click('[data-test="create-team-trigger"]');

    await teamAccounts.tryCreateTeam('billing');

    await expect(
      page.getByText('This name is reserved. Please choose a different one.'),
    ).toBeVisible();

    await teamAccounts.tryCreateTeam('settings');

    await expect(
      page.getByText('This name is reserved. Please choose a different one.'),
    ).toBeVisible();

    function expectError() {
      return expect(
        page.getByText(
          'This name cannot contain special characters. Please choose a different one.',
        ),
      ).toBeVisible();
    }

    await teamAccounts.tryCreateTeam('Test-Name#');
    await expectError();

    await teamAccounts.tryCreateTeam('Test,Name');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name/');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name\\');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name:');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name;');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name=');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name>');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name<');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name?');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name@');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name^');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name&');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name*');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name(');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name)');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name+');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name%');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name$');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name[');
    await expectError();

    await teamAccounts.tryCreateTeam('Test Name]');
    await expectError();
  });

  test('can create a Team account with non-Latin name when providing a slug', async ({
    page,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    await teamAccounts.createTeam();

    const random = (Math.random() * 100000000).toFixed(0);
    const slug = `korean-team-${random}`;

    // Create team with Korean name
    await teamAccounts.createTeamWithNonLatinName('한국 팀', slug);

    // Verify we're on the team page
    await expect(page).toHaveURL(`/home/${slug}`);

    // Verify team appears in selector
    await teamAccounts.openAccountsSelector();
    await expect(teamAccounts.getTeamFromSelector('한국 팀')).toBeVisible();
  });

  test('slug validation shows error for invalid characters', async ({
    page,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    await teamAccounts.createTeam();

    // Use non-Latin name to trigger the slug field visibility
    await teamAccounts.openAccountsSelector();
    await page.click('[data-test="create-team-trigger"]');

    await page.fill(
      '[data-test="create-team-form"]:visible [data-test="team-name-input"]',
      'テストチーム',
    );

    // Wait for slug field to appear (triggered by non-Latin name)
    await expect(teamAccounts.getSlugField()).toBeVisible();

    // Test invalid slug with uppercase
    await page.fill(
      '[data-test="create-team-form"]:visible [data-test="team-slug-input"]',
      'Invalid-Slug',
    );

    await page.click(
      '[data-test="create-team-form"]:visible button:last-child',
    );

    await expect(
      page.getByText(
        'Only English letters (a-z), numbers (0-9), and hyphens (-) are allowed',
        { exact: true },
      ),
    ).toBeVisible();

    // Test invalid slug with non-Latin characters
    await page.fill(
      '[data-test="create-team-form"]:visible [data-test="team-slug-input"]',
      'тест-slug',
    );

    await page.click(
      '[data-test="create-team-form"]:visible button:last-child',
    );

    await expect(
      page.getByText(
        'Only English letters (a-z), numbers (0-9), and hyphens (-) are allowed',
        { exact: true },
      ),
    ).toBeVisible();
  });
});

test.describe('Team Account Deletion', () => {
  test('user can delete their team account', async ({ page }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    const params = teamAccounts.createTeamName();

    const { email } = await teamAccounts.setup(params);

    const teamId = await getAccountIdByName(params.teamName);

    await seedAccountImage(teamId);

    expect(await getAccountImageStatus(teamId)).toBe(200);

    await teamAccounts.goToSettings();

    await teamAccounts.deleteAccount(email);

    // the logo is removed from the public bucket
    await expect.poll(() => getAccountImageStatus(teamId)).not.toBe(200);
    await teamAccounts.openAccountsSelector();

    await expect(
      teamAccounts.getTeamFromSelector(params.teamName),
    ).not.toBeVisible();
  });
});

test.describe('Team Member Role Management', () => {
  test("owner can update a team member's role", async ({ page }) => {
    // Setup team with a regular member
    const { teamAccounts, memberEmail } = await setupTeamWithMember(page);

    // Get the current role badge text
    const memberRow = page.getByRole('row', { name: memberEmail });

    const initialRoleBadge = memberRow.locator(
      '[data-test="member-role-badge"]',
    );

    await expect(initialRoleBadge).toHaveText('Member');

    // Update the member's role to admin
    await teamAccounts.updateMemberRole(memberEmail, 'owner');

    await expect(
      page
        .getByRole('row', { name: memberEmail })
        .locator('[data-test="member-role-badge"]'),
    ).toHaveText('Owner');
  });
});

test.describe('Team Ownership Transfer', () => {
  test('owner can transfer ownership to another team member', async ({
    page,
  }) => {
    // Setup team with an owner member (required for ownership transfer)
    const { teamAccounts, ownerEmail, memberEmail } = await setupTeamWithMember(
      page,
      'owner',
    );

    // Transfer ownership to the member
    await teamAccounts.transferOwnership(memberEmail, ownerEmail);

    // Verify the transfer was successful by checking if the primary owner badge
    // is now on the new owner's row. This positive assertion auto-retries and so
    // also acts as the barrier that waits for the post-transfer reload to render
    // before the negative assertion below runs.
    const memberRow = page.getByRole('row', { name: memberEmail });

    // Check for the primary owner badge on the member's row
    await expect(memberRow.locator('text=Primary Owner')).toBeVisible();

    // The original owner should no longer have the primary owner badge
    const ownerRow = page.getByRole('row', { name: ownerEmail });
    await expect(ownerRow.locator('text=Primary Owner')).not.toBeVisible();
  });
});

test.describe('Team Account Name', () => {
  // A settings form captures the team's slug when it renders. Renaming a team
  // regenerates its slug, so by submit time that slug can belong to another
  // team the same user owns.
  test('a stale settings form renames its own team, not the team that took its slug', async ({
    page,
    context,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    const teamA = teamAccounts.createTeamName();
    const teamB = teamAccounts.createTeamName();

    await teamAccounts.setup(teamA);
    await teamAccounts.createTeam(teamB);

    const teamAId = await getAccountIdByName(teamA.teamName);
    const teamBId = await getAccountIdByName(teamB.teamName);

    // Open team A's settings in a second tab and leave it there.
    const stalePage = await context.newPage();
    const staleTeamAccounts = new TeamAccountsPageObject(stalePage);

    await stalePage.goto(`/home/${teamA.slug}/settings`);

    await expect(
      stalePage.locator('[data-test="update-team-account-name-form"]:visible'),
    ).toBeVisible();

    // Rename team A, freeing its slug, then rename team B so it takes it.
    const renamedA = `Renamed-A-${(Math.random() * 100000000).toFixed(0)}`;

    await page.goto(`/home/${teamA.slug}/settings`);
    await teamAccounts.updateTeamName(renamedA);

    await expect
      .poll(async () => (await getAccountById(teamAId)).name)
      .toBe(renamedA);

    await page.goto(`/home/${teamB.slug}/settings`);
    await teamAccounts.updateTeamName(teamA.teamName);

    // Precondition: team B now holds the slug the stale form rendered with.
    await expect
      .poll(() => getAccountById(teamBId))
      .toEqual({ name: teamA.teamName, slug: teamA.slug });

    // Submit the form that was rendered for team A.
    const finalName = `Final-A-${(Math.random() * 100000000).toFixed(0)}`;

    await staleTeamAccounts.updateTeamName(finalName);

    await expect
      .poll(async () => (await getAccountById(teamAId)).name)
      .toBe(finalName);

    expect(await getAccountById(teamBId)).toEqual({
      name: teamA.teamName,
      slug: teamA.slug,
    });
  });

  test('a stale invite form invites into its own team, not the team that took its slug', async ({
    page,
    context,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    const teamA = teamAccounts.createTeamName();
    const teamB = teamAccounts.createTeamName();

    await teamAccounts.setup(teamA);
    await teamAccounts.createTeam(teamB);

    const teamAId = await getAccountIdByName(teamA.teamName);
    const teamBId = await getAccountIdByName(teamB.teamName);

    // Open team A's invite form in a second tab and leave it there.
    const stalePage = await context.newPage();
    const staleInvitations = new InvitationsPageObject(stalePage);

    await stalePage.goto(`/home/${teamA.slug}/members`);
    await staleInvitations.openInviteForm();

    // Move team A's slug to team B.
    await page.goto(`/home/${teamA.slug}/settings`);
    await teamAccounts.updateTeamName(
      `Renamed-A-${(Math.random() * 100000000).toFixed(0)}`,
    );

    await expect
      .poll(async () => (await getAccountById(teamAId)).slug)
      .not.toBe(teamA.slug);

    await page.goto(`/home/${teamB.slug}/settings`);
    await teamAccounts.updateTeamName(teamA.teamName);

    await expect
      .poll(async () => (await getAccountById(teamBId)).slug)
      .toBe(teamA.slug);

    const email = staleInvitations.auth.createRandomEmail();

    await staleInvitations.inviteMembers([{ email, role: 'member' }]);

    await expect.poll(() => getInvitationAccountId(email)).toBe(teamAId);
  });

  test('renaming to a non-Latin name keeps the custom slug', async ({
    page,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    const team = teamAccounts.createTeamName();

    await teamAccounts.setup(team);

    const teamId = await getAccountIdByName(team.teamName);
    const slug = `japan-${(Math.random() * 100000000).toFixed(0)}`;

    await page.goto(`/home/${team.slug}/settings`);
    await teamAccounts.updateTeamNameWithSlug('日本語チーム', slug);

    await expect
      .poll(() => getAccountById(teamId))
      .toEqual({ name: '日本語チーム', slug });

    await expect(page).toHaveURL(`/home/${slug}/settings`);
  });

  test('a taken custom slug is rejected and the team keeps a working slug', async ({
    page,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    const teamA = teamAccounts.createTeamName();
    const teamB = teamAccounts.createTeamName();

    await teamAccounts.setup(teamA);
    await teamAccounts.createTeam(teamB);

    const teamBId = await getAccountIdByName(teamB.teamName);

    await page.goto(`/home/${teamB.slug}/settings`);
    await teamAccounts.updateTeamNameWithSlug('日本語チーム', teamA.slug);

    await expect(
      page.getByText(
        'This URL is already taken. Please choose a different one.',
      ),
    ).toBeVisible();

    // Rejected before anything was written.
    expect(await getAccountById(teamBId)).toEqual({
      name: teamB.teamName,
      slug: teamB.slug,
    });
  });

  test('a rename that slugifies to the current slug keeps it', async ({
    page,
  }) => {
    const teamAccounts = new TeamAccountsPageObject(page);
    const team = teamAccounts.createTeamName();

    await teamAccounts.setup(team);

    const teamId = await getAccountIdByName(team.teamName);
    // "Team-Name-123" -> "TEAM NAME 123": differs in case and punctuation,
    // but still slugifies to "team-name-123".
    const upperName = team.teamName.toUpperCase().replaceAll('-', ' ');

    await page.goto(`/home/${team.slug}/settings`);
    await teamAccounts.updateTeamName(upperName);

    await expect
      .poll(() => getAccountById(teamId))
      .toEqual({ name: upperName, slug: team.slug });
  });
});

test.describe('Team Account Security', () => {
  test('unauthorized user cannot access team account', async ({
    page,
    browser,
  }) => {
    // 1. Create a team account with User A
    const teamAccounts = new TeamAccountsPageObject(page);
    const params = teamAccounts.createTeamName();

    // Setup User A and create team
    await teamAccounts.setup(params);

    // Store team slug for later use
    const teamSlug = params.slug;

    // 2. Sign out User A
    await page.context().clearCookies();

    // 3. Create a new context for User B (to have clean cookies/session)
    const userBContext = await browser.newContext();
    const userBPage = await userBContext.newPage();
    const userBTeamAccounts = new TeamAccountsPageObject(userBPage);

    // Sign up with User B
    await userBPage.goto('/auth/sign-up');
    const emailB = userBTeamAccounts.auth.createRandomEmail();

    await userBTeamAccounts.auth.signUp({
      email: emailB,
      password: 'password',
      repeatPassword: 'password',
    });

    await userBTeamAccounts.auth.visitConfirmEmailLink(emailB);

    // 4. Attempt to access the team page with User B
    await userBPage.goto(`/home/${teamSlug}`);

    // Check that we're not on the team page anymore (should redirect)
    await expect(userBPage).toHaveURL(HOME_LANDING_URL);
  });
});
