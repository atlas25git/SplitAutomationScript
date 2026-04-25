# 🔥 V2.0 FIRE Reconciliation Engine

An automated Google Apps Script that acts as a financial bridge between **HDFC Bank email alerts**, **Splitwise**, and **Google Sheets**. 

Designed for individuals pursuing FIRE (Financial Independence, Retire Early) or those who simply want granular tracking of their expenses, this engine calculates your **True Personal Burn** by automatically logging bank outflows, managing split expenses with friends, and reconciling settlements—all without manual data entry.

## ✨ Features

* 🏦 **Automated Bank Ingestion:** Scans Gmail for HDFC transaction alerts, parses the merchant and amount using regex, and ignores excluded terms (SIPs, Credit Card payments, etc.).
* 🤝 **Zero-Touch Splitwise Integration:** Automatically pushes valid HDFC transactions to a default Splitwise group, splitting them equally.
* 📥 **Reverse Syncing:** Pulls incoming debts (expenses friends added that you owe money for) from Splitwise and logs them to your ledger.
* 🔄 **Smart Reconciliation:** A daemon checks past transactions to see if a Splitwise expense was edited (e.g., a friend changed the split ratio) or deleted/settled, updating your Google Sheet automatically.
* 📊 **Daily Email Reports:** Sends a clean HTML email every morning at 8:00 AM summarizing yesterday's burn and the current credit card billing cycle.

## 🏗️ How the Pipeline Works

The script sets up automated time-based triggers (cron jobs) to run while you sleep:

1. **`1:00 AM` - HDFC Ingestion:** Scans the last 2 days of emails for HDFC alerts, pushes to Splitwise, and logs to Google Sheets.
2. **`3:00 AM` - Splitwise Ingestion:** Scans Splitwise for expenses added by friends where you owe money, logging new debts to the sheet.
3. **`5:00 AM` - Ledger Reconciliation:** Checks the last 30 rows in the sheet against the live Splitwise API. If a bill was settled, deleted, or the split amount changed, it corrects the Google Sheet math.
4. **`8:00 AM` - Daily Report:** Calculates your True Burn vs Gross Bank Outflow and emails you a summary.
5. **`Sunday 10:00 AM` - Database Cleanup:** Purges old processed email IDs to keep the script running fast.

---

## 🛠️ Prerequisites

1. An **HDFC Bank** account with email transaction alerts enabled (`alerts@hdfcbank.net`).
2. A **Google Account** (Gmail & Google Sheets).
3. A **Splitwise Account**.

---

## 🚀 Setup Instructions

### Step 1: Prepare the Google Sheet
1. Create a new Google Sheet.
2. Rename `Sheet1` to exactly `Ledger` (or update the `SHEET_NAME` variable in the script).
3. Create the following exact 8 column headers in Row 1:

| Date | Time | Merchant | Gross | Month | SW_ID | Personal Burn | Friends Owe |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| *(Auto)* | *(Auto)* | *(Auto)* | *(Auto)* | *(Auto)* | *(Auto)* | *(Auto)* | *(Auto)* |

4. Copy the long ID of the spreadsheet from the URL (the string between `/d/` and `/edit`).

### Step 2: Get your Splitwise API & Group ID
1. Log in to Splitwise on the web.
2. Go to **Your Account** -> **Advanced features** -> **Register an Application**.
3. Register a dummy app and copy your **API Key**.
4. Create a new dummy group in Splitwise (e.g., "Auto-Split Group") and invite a friend/partner. Click on the group and copy the **Group ID** from the URL (e.g., `https://secure.splitwise.com/groups/12345678` -> ID is `12345678`).

### Step 3: Configure Apps Script
1. Open your Google Sheet, click **Extensions** -> **Apps Script**.
2. Delete any code there and paste the entire code provided in the section below.
3. Under the `USER CONFIGURATION` section at the top, update the variables:
   ```javascript
   const SPREADSHEET_ID = "your_copied_sheet_id";
   const SHEET_NAME = "Ledger"; 
   const USER_EMAIL = "your_email@gmail.com";
   const GROUP_ID = "your_splitwise_group_id";
   const BILLING_CYCLE_START_DAY = 16; // Your CC statement date
   const TIMEZONE = "GMT+5:30"; // Update if you are not in India
