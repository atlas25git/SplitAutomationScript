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
 * Update the "USER CONFIGURATION" variables right below this comment block.
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

// ==========================================
// USER CONFIGURATION
// ==========================================
const SPREADSHEET_ID = "Enter your spreadsheet id";
const SHEET_NAME = "Ledger"; // Ensure this matches your sheet tab exactly
const USER_EMAIL = "Enter your email id";
const GROUP_ID = "Enter a dummy group id including a valid split account";
const BILLING_CYCLE_START_DAY = 16; 
const TIMEZONE = "GMT+5:30"; // Update if not in India

// ==========================================
// SYSTEM CONSTANTS
// ==========================================
const PROCESSED_LABEL = 'Splitwise-Processed';
const FAILED_LABEL = 'Splitwise-Failed';
const ID_SHEET_NAME = "Processed_IDs";
const EXCLUDED_TERMS = ['CREDIT CARD PAYMENT', 'NEFT', 'RTGS', 'MUTUAL FUND', 'ZERODHA', 'GROWW', 'SIP', 'CASH WITHDRAWAL', 'AUTOPAY'];

// Helper function to safely fetch properties
function getProp(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// ==========================================
// ONE-TIME SETUP
// ==========================================
function setupMySplitwiseID() {
  const apiKey = getProp('SPLITWISE_API_KEY');
  if (!apiKey) throw new Error("SPLITWISE_API_KEY is missing from Script Properties.");

  const url = "https://secure.splitwise.com/api/v3.0/get_current_user";
  const options = {
    "method": "get",
    "headers": { "Authorization": `Bearer ${apiKey}` }
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());
  const myUserId = result.user.id.toString();

  PropertiesService.getScriptProperties().setProperty('YOUR_USER_ID', myUserId);
  Logger.log(`✅ Success! Your Splitwise ID is ${myUserId}. Saved to environment variables.`);
}

// ==========================================
// CORE LOGIC: SCAN & PROCESS HDFC ALERTS
// ==========================================
function processAllHDFCAlerts() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const idSheet = ss.getSheetByName(ID_SHEET_NAME) || ss.insertSheet(ID_SHEET_NAME);
  const processedIDs = idSheet.getDataRange().getValues().flat();

  let processedLabel = GmailApp.getUserLabelByName(PROCESSED_LABEL) || GmailApp.createLabel(PROCESSED_LABEL);

  const searchQuery = `(from:alerts@hdfcbank.net OR from:instaalerts@hdfcbank.net OR from:alerts@hdfcbank.bank.in) ("transaction alert" OR "debited" OR "sent to" OR "UPI txn") newer_than:2d`;
  const threads = GmailApp.search(searchQuery);

  if (threads.length === 0) return Logger.log("No HDFC alerts found.");

  threads.forEach(thread => {
    const messages = thread.getMessages();
    let threadUpdated = false;

    messages.forEach(message => {
      const msgId = message.getId();
      if (processedIDs.indexOf(msgId) > -1) return;

      const body = message.getPlainBody().replace(/\*/g, '').replace(/\s+/g, ' ');
      const msgDate = message.getDate();
      const transactionRegex = /(?:Rs\.?|INR)\s*([\d,]+\.?\d*)\s+(?:has been|is)\s+debited.+?(?:to|towards)\s+(.+?)\s+(?:on|at|date|ref|Your UPI|If you)/gi;

      let match;
      while ((match = transactionRegex.exec(body)) !== null) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        let rawMerchant = match[2].trim();
        let cleanMerchant = rawMerchant.replace(/[a-z0-9\.\-_]+@[a-z0-9\.]+/gi, '').replace(/VPA\s+/gi, '').replace(/[0-9]{5,}/g, '').trim().toUpperCase();
        if (cleanMerchant === "" || cleanMerchant.length < 2) cleanMerchant = rawMerchant.toUpperCase();

        if (!EXCLUDED_TERMS.some(term => cleanMerchant.includes(term))) {
          const splitwiseId = pushToSplitwise(cleanMerchant, amount, msgDate);
          if (splitwiseId || splitwiseId === null) {
            logToSheet(msgDate, cleanMerchant, amount, splitwiseId);
            idSheet.appendRow([msgId]);
            threadUpdated = true;
          }
        } else {
          idSheet.appendRow([msgId]);
          threadUpdated = true;
        }
      }
    });
    if (threadUpdated) thread.addLabel(processedLabel);
  });
}

function pushToSplitwise(merchant, amount, date) {
  const url = "https://secure.splitwise.com/api/v3.0/create_expense";
  const formattedTime = Utilities.formatDate(date, TIMEZONE, "HH:mm");
  const formattedDate = Utilities.formatDate(date, TIMEZONE, "dd MMM");
  const apiKey = getProp('SPLITWISE_API_KEY');

  const payload = {
    "cost": amount.toString(),
    "description": `${formattedTime} | ${formattedDate} - ${merchant}`,
    "currency_code": "INR", "group_id": GROUP_ID, "split_equally": true
  };

  const options = {
    "method": "post",
    "headers": { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    if (result.expenses && result.expenses.length > 0) return result.expenses[0].id;
  } catch (e) { Logger.log("SW Push Error: " + e.message); }
  return null;
}

function logToSheet(date, merchant, amount, splitwiseId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

    const dateFormatted = Utilities.formatDate(date, TIMEZONE, "yyyy-MM-dd");
    const timeFormatted = Utilities.formatDate(date, TIMEZONE, "HH:mm");
    const monthFormatted = Utilities.formatDate(date, TIMEZONE, "yyyy-MMM");

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const lastFewRows = sheet.getRange(Math.max(1, lastRow - 20), 1, 21, 4).getValues();
      const isDuplicate = lastFewRows.some(row =>
        Utilities.formatDate(new Date(row[0]), TIMEZONE, "yyyy-MM-dd") === dateFormatted &&
        row[1].toString() === timeFormatted && row[2] === merchant && parseFloat(row[3]) === amount
      );
      if (isDuplicate) return Logger.log(`[SKIP]: Duplicate ${merchant}`);
    }

    sheet.appendRow([dateFormatted, timeFormatted, merchant, amount, monthFormatted, splitwiseId || "", amount, 0]);
  } catch (e) { Logger.log("Sheet Error: " + e.message); }
}

// ==========================================
// INCOMING SPLITWISE INGESTION
// ==========================================
function processIncomingSplitwise() {
  const apiKey = getProp('SPLITWISE_API_KEY');
  const myUserId = getProp('YOUR_USER_ID');

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();

  let existingIds = new Set();
  if (lastRow > 1) {
    const idData = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
    idData.forEach(row => { if (row[0]) existingIds.add(row[0].toString()); });
  }

  const today = new Date();
  const pastDate = new Date();
  pastDate.setDate(today.getDate() - 7);

  const url = `https://secure.splitwise.com/api/v3.0/get_expenses?dated_after=${pastDate.toISOString()}&limit=50`;
  const options = { "method": "GET", "headers": { "Authorization": "Bearer " + apiKey } };
  
  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());
  const expenses = data.expenses;

  if (!expenses || expenses.length === 0) return;

  let updatesMade = false;

  expenses.forEach(expense => {
    const expenseId = expense.id.toString();
    if (existingIds.has(expenseId) || expense.deleted_at !== null) return;

    const myShare = expense.users.find(u => u.user_id.toString() === myUserId);
    if (!myShare) return;

    const paidAmount = parseFloat(myShare.paid_share);
    const owedAmount = parseFloat(myShare.owed_share);

    if (paidAmount === 0 && owedAmount > 0) {
      const friendName = expense.created_by.first_name;
      const rawDescription = expense.description;
      const scriptFormatRegex = /^(\d{2}:\d{2})\s+\|\s+(\d{2}\s+[a-zA-Z]{3})\s+-\s+(.+)$/;
      const match = rawDescription.match(scriptFormatRegex);

      let dFormatted, tFormatted, mFormatted, cleanDescription;

      if (match) {
        const extractedTime = match[1];
        const extractedDate = match[2];
        const extractedMerchant = match[3];
        const currentYear = new Date().getFullYear();
        const parsedDateObj = new Date(`${extractedDate} ${currentYear} ${extractedTime}`);

        dFormatted = Utilities.formatDate(parsedDateObj, TIMEZONE, "yyyy-MM-dd");
        tFormatted = extractedTime;
        mFormatted = Utilities.formatDate(parsedDateObj, TIMEZONE, "yyyy-MMM");
        cleanDescription = `SW Owed to ${friendName}: ${extractedMerchant}`;
      } else {
        const dateObj = new Date(expense.date);
        dFormatted = Utilities.formatDate(dateObj, TIMEZONE, "yyyy-MM-dd");
        tFormatted = Utilities.formatDate(dateObj, TIMEZONE, "HH:mm");
        mFormatted = Utilities.formatDate(dateObj, TIMEZONE, "yyyy-MMM");
        cleanDescription = `SW Owed to ${friendName}: ${rawDescription}`;
      }

      sheet.appendRow([dFormatted, tFormatted, cleanDescription, owedAmount, mFormatted, expenseId, owedAmount, 0]);
      Logger.log(`✅ APPENDED: New debt of ₹${owedAmount} for '${cleanDescription}'.`);
      updatesMade = true;
    }
  });

  if (updatesMade) Logger.log("✨ Ledger successfully updated with new incoming Splitwise debts.");
}

// ==========================================
// RECONCILIATION DAEMON
// ==========================================
function syncSplitwiseLedger() {
  const apiKey = getProp('SPLITWISE_API_KEY');
  const myUserId = getProp('YOUR_USER_ID');
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return Logger.log("Not enough rows to process.");

  const numRowsToCheck = Math.min(30, lastRow - 1);
  const startRow = lastRow - numRowsToCheck + 1;
  const range = sheet.getRange(startRow, 1, numRowsToCheck, 8);
  const data = range.getValues();
  let updatesMade = false;

  for (let i = 0; i < data.length; i++) {
    const merchant = data[i][2].toString();
    const grossAmount = parseFloat(data[i][3]);
    const splitwiseId = data[i][5];

    if (!splitwiseId || splitwiseId === "DELETED") continue;

    Utilities.sleep(500); // Rate Limit Protection

    const isIncomingDebt = merchant.startsWith("SW Owed");
    const url = `https://secure.splitwise.com/api/v3.0/get_expense/${splitwiseId}`;
    const options = { "method": "get", "headers": { "Authorization": `Bearer ${apiKey}` }, "muteHttpExceptions": true };
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    let result = {};

    if (responseCode === 200) result = JSON.parse(response.getContentText());

    if (responseCode === 404 || (result.expense && result.expense.deleted_at !== null)) {
      if (isIncomingDebt) {
        data[i][3] = 0; data[i][6] = 0; data[i][7] = 0; data[i][2] = "[SETTLED] " + merchant;
      } else {
        data[i][6] = grossAmount; data[i][7] = 0;
      }
      data[i][5] = "DELETED";
      updatesMade = true;
      continue;
    }

    if (result.expense && result.expense.users) {
      const myData = result.expense.users.find(u => u.user_id.toString() === myUserId);

      if (myData) {
        const myOwedShare = parseFloat(myData.owed_share);

        if (isIncomingDebt) {
          if (data[i][3] !== myOwedShare || data[i][6] !== myOwedShare) {
            data[i][3] = myOwedShare; data[i][6] = myOwedShare; data[i][7] = 0;
            updatesMade = true;
          }
        } else {
          const swTotalCost = parseFloat(result.expense.cost);
          const actualFriendsOwe = swTotalCost - myOwedShare;
          const truePersonalBurn = grossAmount - actualFriendsOwe;

          if (data[i][6] !== truePersonalBurn || data[i][7] !== actualFriendsOwe) {
            data[i][6] = truePersonalBurn; data[i][7] = actualFriendsOwe;
            updatesMade = true;
          }
        }
      }
    }
  }

  if (updatesMade) range.setValues(data);
  Logger.log("✅ [COMPLETE] Reconciliation checks finished.");
}

// ==========================================
// EMAIL REPORTING
// ==========================================
function sendDailySpendSummary() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

  const yesterdayStr = Utilities.formatDate(yesterday, TIMEZONE, "yyyy-MM-dd");
  const displayDate = Utilities.formatDate(yesterday, TIMEZONE, "dd MMM yyyy");

  let cycleStart = new Date(today.getFullYear(), today.getMonth(), BILLING_CYCLE_START_DAY);
  if (today.getDate() < BILLING_CYCLE_START_DAY) cycleStart.setMonth(cycleStart.getMonth() - 1);

  let yGross = 0, yBurn = 0, yOwedToMe = 0, yIOweThem = 0;
  let cGross = 0, cBurn = 0, cOwedToMe = 0, cIOweThem = 0;

  for (let i = 1; i < data.length; i++) {
    const rowDate = new Date(data[i][0]);
    const merchant = (data[i][2] || "").toString();
    const grossAmount = parseFloat(data[i][3]) || 0;

    const personalBurn = (data[i][6] !== "" && data[i][6] !== undefined) ? parseFloat(data[i][6]) : grossAmount;
    const friendsOwe = (data[i][7] !== "" && data[i][7] !== undefined) ? parseFloat(data[i][7]) : 0;

    const isIncomingDebt = merchant.includes("SW Owed");
    const hdfcBankOutflow = isIncomingDebt ? 0 : grossAmount;
    const incomingDebtAmount = isIncomingDebt ? grossAmount : 0;

    const rowDateStr = Utilities.formatDate(rowDate, TIMEZONE, "yyyy-MM-dd");

    if (rowDateStr === yesterdayStr) {
      yGross += hdfcBankOutflow; yBurn += personalBurn; yOwedToMe += friendsOwe; yIOweThem += incomingDebtAmount;
    }

    if (rowDate >= cycleStart && rowDate <= today) {
      cGross += hdfcBankOutflow; cBurn += personalBurn; cOwedToMe += friendsOwe; cIOweThem += incomingDebtAmount;
    }
  }

  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2 style="color: #2c3e50;">Daily Financial Summary</h2>
      <h3 style="color: #34495e; border-bottom: 2px solid #eee; padding-bottom: 5px;">Yesterday's Breakdown (${displayDate})</h3>
      <ul style="font-size: 16px; list-style-type: none; padding-left: 0;">
        <li style="margin-bottom: 5px;">🏦 <b>HDFC Bank Outflow:</b> ₹${yGross.toFixed(2)}</li>
        <li style="margin-bottom: 5px; color: #e74c3c;">🔥 <b>True Personal Burn:</b> ₹${yBurn.toFixed(2)}</li>
        <li style="margin-bottom: 5px; color: #27ae60;">📈 <b>Friends Owe You:</b> ₹${yOwedToMe.toFixed(2)}</li>
        <li style="margin-bottom: 5px; color: #d35400;">📉 <b>You Owe Friends (New Debt):</b> ₹${yIOweThem.toFixed(2)}</li>
      </ul>
      <h3 style="color: #34495e; border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 25px;">Cycle to Date (Since ${Utilities.formatDate(cycleStart, TIMEZONE, "dd MMM")})</h3>
      <ul style="font-size: 16px; list-style-type: none; padding-left: 0;">
        <li style="margin-bottom: 5px;">🏦 <b>Total Bank Outflow:</b> ₹${cGross.toFixed(2)}</li>
        <li style="margin-bottom: 5px; color: #e74c3c;">🔥 <b>Total Personal Burn:</b> ₹${cBurn.toFixed(2)}</li>
        <li style="margin-bottom: 5px; color: #27ae60;">📈 <b>Total Owed to You:</b> ₹${cOwedToMe.toFixed(2)}</li>
        <li style="margin-bottom: 5px; color: #d35400;">📉 <b>Total You Owe Friends:</b> ₹${cIOweThem.toFixed(2)}</li>
      </ul>
    </div>
  `;

  MailApp.sendEmail({
    to: USER_EMAIL,
    subject: `[${displayDate}] 💰 Burn: ₹${yBurn.toFixed(2)} | HDFC Outflow: ₹${yGross.toFixed(2)}`,
    htmlBody: body
  });
}

// ==========================================
// MAINTENANCE & TRIGGERS
// ==========================================
function createFinalTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));

  // Spaced out triggers to prevent overlap/race conditions
  ScriptApp.newTrigger('processAllHDFCAlerts').timeBased().everyDays(1).atHour(1).create();
  ScriptApp.newTrigger('processIncomingSplitwise').timeBased().everyDays(1).atHour(3).create();
  ScriptApp.newTrigger('syncSplitwiseLedger').timeBased().everyDays(1).atHour(5).create();
  ScriptApp.newTrigger('sendDailySpendSummary').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('purgeOldProcessedIDs').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(10).create();

  Logger.log('✅ Pipeline Deployed: HDFC (1AM) -> SW In (3AM) -> Reconcile (5AM) -> Email (8AM).');
}

function purgeOldProcessedIDs() {
  const idSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ID_SHEET_NAME);
  if (!idSheet) return;
  const lastRow = idSheet.getLastRow();
  if (lastRow > 500) { idSheet.deleteRows(1, lastRow - 500); }
}
