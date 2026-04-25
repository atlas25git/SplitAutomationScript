/**
 * ==============================================================================
 * 🚀 V2.0 FIRE RECONCILIATION ENGINE - SETUP INSTRUCTIONS
 * ==============================================================================
 * Follow these exact steps to deploy this script in your Google Workspace:
 * * STEP 1: PREPARE THE SPREADSHEET
 * ------------------------------------------------------------------------------
 * 1. Create a new Google Sheet.
 * 2. Rename 'Sheet1' to your desired ledger name (e.g., "Ledger").
 * 3. Create the following 8 column headers in Row 1:
 * [Date | Time | Merchant | Gross | Month | SW_ID | Personal Burn | Friends Owe]
 * 4. Copy the long URL ID of the spreadsheet (the string between /d/ and /edit).
 * * STEP 2: UPDATE SCRIPT VARIABLES
 * ------------------------------------------------------------------------------
 * Update the following constants in the script below:
 * - SPREADSHEET_ID: Paste your sheet ID here.
 * - SHEET_NAME: Paste the exact name of your main tab (e.g., "Ledger").
 * - BILLING_CYCLE_START_DAY: Your credit card statement date (e.g., 16).
 * - GROUP_ID: Create a dummy group in Splitwise, copy its ID from the URL.
 * - In the `sendDailySpendSummary()` function (near the bottom), replace 
 * "Enter your email id" with your actual email address.
 * * STEP 3: CONFIGURE ENVIRONMENT VARIABLES (SPLITWISE API)
 * ------------------------------------------------------------------------------
 * 1. Go to Splitwise -> Your Account -> Advanced features -> Register an Application.
 * 2. Get your API Key.
 * 3. In the Apps Script editor, click the 'Gear' icon (Project Settings) on the left.
 * 4. Scroll down to 'Script Properties' and click 'Add script property'.
 * 5. Property = SPLITWISE_API_KEY | Value = <Your_Splitwise_API_Key>
 * * STEP 4: AUTHENTICATE AND DEPLOY
 * ------------------------------------------------------------------------------
 * 1. Select the `setupMySplitwiseID` function from the top dropdown and hit 'Run'.
 * (Review and accept the Google account permissions).
 * Check the Execution Log to ensure it successfully grabbed your User ID.
 * 2. Select the `createFinalTriggers` function from the dropdown and hit 'Run'.
 * * ✅ DONE! The Daemon will now run automatically every night.
 * ==============================================================================
 */
