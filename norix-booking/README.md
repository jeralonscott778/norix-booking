# Norix Booking

Reservations for businesses in Ghana. Next.js 15 + TypeScript + Tailwind, Supabase for the database and staff logins, hosted on Vercel.

## Pages

| Page | Who it's for |
| --- | --- |
| `/kozo` | Guests book a table (works on its own or embedded in the Framer site) |
| `/kozo?embed=1` | Same, without the page heading, for embedding |
| `/kozo/3d` | Guests look around the room in 3D and book an exact table |
| `/kozo/host` | Staff sign in to see and manage reservations live |

Every business is a row in the `businesses` table. A new client = a new slug (for example `/serene-spa`), no new code.

## Deploy to Vercel (first time)

1. Create an empty repository on GitHub called `norix-booking`.
2. In this folder run:
   ```bash
   git add -A
   git commit -m "Norix Booking"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/norix-booking.git
   git push -u origin main
   ```
3. On vercel.com: **Add New → Project → Import** `norix-booking`.
4. Before clicking Deploy, open **Environment Variables** and add the two values from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Click **Deploy**.

## Staff login for the host screen

1. Supabase dashboard → project **norix-booking** → **Authentication → Users → Add user → Create new user**.
2. Use an email that is on the staff list (Jordan's is already added for Kozo) and set a password. Tick **Auto confirm user**.
3. Open `/kozo/host` and sign in.

To add more staff, insert a row into `business_staff` with the business and their email, then create their user as above.

## Put it on the Framer site

1. In Framer, insert an **Embed** component and choose **URL**.
2. Paste `https://YOUR-VERCEL-URL/kozo?embed=1`.
3. Width: fill. Height: about 900 px on desktop, about 1700 px on the phone breakpoint.
4. Optional: add a "See the room in 3D" button that links to `https://YOUR-VERCEL-URL/kozo/3d`.

## Confirmations (WhatsApp, SMS, email)

The Supabase Edge Function `notify` sends them after each booking. It reads these secrets (Supabase → Edge Functions → Secrets):

| Secret | What it is |
| --- | --- |
| `RESEND_API_KEY`, `RESEND_FROM` | Email via resend.com |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | WhatsApp Cloud API (Meta for Developers) |
| `WHATSAPP_TEMPLATE` (optional) | Approved template name, used when a plain message isn't allowed |
| `ARKESEL_API_KEY`, `SMS_SENDER` | SMS via arkesel.com |
| `OWNER_WHATSAPP` (optional) | Restaurant's number, gets an alert for every booking |

Any channel without its keys is skipped; bookings still work.

## Local development

```bash
npm install
npm run dev
```
Open http://localhost:3000/kozo
