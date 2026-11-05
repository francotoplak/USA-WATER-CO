# Team sync setup (about 5 minutes)

This connects every tablet to one Google Sheet. Doors logged on any tablet show up on all the others within about 15 seconds. Booked appointments also go straight onto the owner's Google Calendar.

Do these steps **signed in to the owner's Google account** (the calendar that should get the appointments).

1. Go to [sheets.new](https://sheets.new) to make a new Google Sheet. Name it something like **USA Water Co Doors**.
2. In the sheet, open **Extensions → Apps Script**.
3. Delete everything in the code box. Paste in the contents of [`apps-script/Code.gs`](apps-script/Code.gs).
4. At the top of the code, change `TEAM_PIN` to a PIN of your choice. Every rep will type this PIN, so don't use a bank PIN. Click the save icon.
5. In the function menu at the top, pick **setup** and click **Run**. Google asks for permission. Click **Review permissions**, choose the account, then **Advanced → Go to project (unsafe)** → **Allow**. This screen appears because you wrote the script yourself; it's safe.
6. Click **Deploy → New deployment**. Click the gear icon, choose **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
7. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
8. On each tablet, open Door Log, go to **Settings → Team sync**, and paste the link and the PIN. The dot next to "Door Log" turns green when it's connected.

Any doors already on a tablet are uploaded when you connect it.

## Good to know

- The **Doors** tab in the sheet has one row per house. The owner can read it, filter it, or download it. Don't edit or reorder the hidden columns; the app uses them.
- To turn off automatic calendar events, change `ADD_TO_CALENDAR` to `false`, then **Deploy → Manage deployments → Edit → Version: New version → Deploy**.
- If you change the code later, always deploy a **new version** of the same deployment so the link stays the same.
- Tablets keep working with no signal. Changes wait on the tablet and sync when it's back online (the dot turns orange while changes are waiting).

## Team sign-in and territories

- In **Settings → Team**, add the owner first, then each rep with their own 4-digit PIN. Once a team exists, every tablet asks "Who's knocking today?" and each rep signs in with their PIN. Doors, bookings and the leaderboard are then credited to the right person.
- Only an owner/manager can add reps or draw territories (**Settings → Territories → Draw a new territory**, then tap the corners of the area on the map).
- Rep PINs are a convenience to keep people from logging under someone else's name. They're not bank-grade security.
- The sheet gets **Team** and **Territories** tabs next to **Doors**.

## Updating the script

If you set up the script before November 6, 2026, paste in the latest [`apps-script/Code.gs`](apps-script/Code.gs), then use **Deploy → Manage deployments → Edit → Version: New version → Deploy**. The link stays the same.
