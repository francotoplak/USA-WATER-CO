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

## No double-booking

- Once an appointment is booked, every rep's time picker crosses out the times that overlap it, plus 30 minutes of travel time before and after. Change `TRAVEL_MINUTES` in the script to adjust that gap.
- Times that are already busy on the owner's Google Calendar (dentist, family stuff, anything) are crossed out too. Set `BLOCK_CALENDAR_BUSY` to `false` to turn that off.
- If two reps tap Book on the same time at the same moment, the sheet keeps the first one. The second rep gets a message, and their door goes back to Interested so they can pick a new time.

## Updating the script

If you set up the script before this update (November 6, 2026), paste in the latest [`apps-script/Code.gs`](apps-script/Code.gs), then use **Deploy → Manage deployments → Edit → Version: New version → Deploy**. The link stays the same.

## Start day / End day

Signed-in reps get a **Start day** button at the top of the map. Tapping it clocks them in, and tapping it again ends their day. Owners and managers see a **Hours** tab under Stats. For each rep and each day, it shows when they started, their first door, their last door, when they ended, and their total time. Gaps of more than 30 minutes are highlighted. These times are also saved to a **Shifts** tab in the sheet.

## Adding another owner's team (for example, Craig in Arizona)

Each owner gets a separate team with its own Google Sheet, Google Calendar, reps and PIN. Doors from one team never land on another team's sheet or calendar.

1. **Craig does steps 1 to 7 above in his own Google account.** He makes his own sheet, pastes in `Code.gs`, and deploys it. That way, bookings go on his calendar, not yours.
2. In step 4, Craig also changes two lines at the top of the script:
   - `TEAM_NAME` to `'USA Water Co · Arizona'`
   - `TEAM_PIN` to his own PIN
3. Craig sends over his web app link (the one ending in `/exec`).
4. Add both teams to `teams.json` in this repo, with a short code for each:

   ```json
   {
     "teams": {
       "OH": { "name": "USA Water Co", "url": "https://script.google.com/macros/s/…dad's link…/exec" },
       "AZ": { "name": "USA Water Co · Arizona", "url": "https://script.google.com/macros/s/…Craig's link…/exec" }
     }
   }
   ```

5. Reps open **Settings → Team sync**, type their team code (`OH` or `AZ`) and that team's PIN, and they're connected. Nobody has to paste a long link anymore.

**Company view:** owners and managers see a **Company** tab under Stats. It shows every team side by side: doors, bookings, booking rate, upcoming appointments and top reps. To show another team's numbers, enter that team's PIN once on its card. The Company view is read only, so nothing done there changes the other team's doors.
