# WhatsApp Dashboard Setup

## Environment Variables

Create a `.env.local` file in the root directory. Use `env.example` as a template:

```bash
cp env.example .env.local
```

Then fill in your credentials:

```env
# WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token_here
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id_here
WEBHOOK_VERIFY_TOKEN=your_custom_verify_token_12345

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

### How to get WhatsApp Cloud API credentials:

1. **Create Meta Business Account:**
   - Go to [Meta Business Suite](https://business.facebook.com/)
   - Create a new business account or use existing

2. **Set up WhatsApp Business App:**
   - Go to [Meta Developer Console](https://developers.facebook.com/)
   - Create a new app or use existing
   - Add "WhatsApp" product to your app

3. **Get Phone Number ID & Access Token:**
   - In Developer Console > WhatsApp > API Setup
   - Copy the **Phone Number ID**
   - Generate a **Permanent Access Token** (or use System User token)
   - Copy the **Business Account ID**

4. **Create Webhook Verify Token:**
   - Create any random secure string (e.g., `my_secure_token_12345`)
   - You'll use this when configuring the webhook

### How to get Supabase credentials:

1. **Create Supabase Project:**
   - Go to [Supabase](https://supabase.com/)
   - Create a new project

2. **Run Database Migration:**
   - Open SQL Editor in Supabase dashboard
   - Copy and paste the entire `supabase-migration.sql` file
   - Run the migration to create all tables

3. **Get API Credentials:**
   - Go to Project Settings > API
   - Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

## Installation & Running

1. **Install dependencies:**
```bash
npm install
```

2. **Set up Supabase:**
   - Create a new Supabase project
   - Run the `supabase-migration.sql` in SQL Editor
   - Get your credentials from Project Settings > API

3. **Configure environment variables:**
   - Copy `env.example` to `.env.local`
   - Fill in all WhatsApp Cloud API credentials
   - Fill in all Supabase credentials

4. **Start the development server:**
```bash
npm run dev
```

5. **Open the dashboard:**
   - Go to [http://localhost:3000](http://localhost:3000)
   - Login with your Supabase credentials

6. **Configure WhatsApp Webhook:**
   - Deploy to Netlify or use ngrok for local testing
   - In Meta Developer Console > WhatsApp > Configuration
   - Set Callback URL: `https://your-domain.com/api/webhook`
   - Set Verify Token: Same as `WEBHOOK_VERIFY_TOKEN` in `.env.local`
   - Subscribe to `messages` webhook field

## Features

- ✅ **Sidebar with conversations** - Shows all WhatsApp conversations grouped by phone number
- ✅ **Message history** - Full conversation view with timestamps and delivery status
- ✅ **Send replies** - Type and send messages to clients
- ✅ **Auto-refresh** - Updates every 5 seconds (can be toggled on/off)
- ✅ **Manual refresh** - Refresh button to manually update conversations
- ✅ **WhatsApp-like UI** - Clean, modern interface using Tailwind CSS
- ✅ **Message status** - Shows delivery status for each message
- ✅ **Responsive design** - Works on different screen sizes

## API Endpoints

- `GET /api/messages/fetch` - Fetches all WhatsApp messages from Supabase database
- `POST /api/messages/send` - Sends a new WhatsApp message via WhatsApp Cloud API
- `POST /api/webhook` - Receives incoming messages from WhatsApp Cloud API
- `GET /api/webhook` - Webhook verification endpoint for Meta
- `GET /api/check-human?phone=254768322488` - Check if human responded in last 2 hours (for n8n)

## Troubleshooting

### "WhatsApp credentials not configured" error
- Make sure your `.env.local` file exists in the root directory
- Verify all environment variables are set correctly
- Restart the development server after creating/updating `.env.local`

### No messages showing
- Check if webhook is properly configured in Meta Developer Console
- Send a test message to your WhatsApp Business number
- Check Supabase > Table Editor > `messages` table for data
- Check Supabase > Table Editor > `webhook_logs` for webhook events
- Check browser console for any API errors

### Webhook not receiving messages

#### 1. **Webhook URL must be HTTPS**
- For production: Deploy to Netlify (automatic HTTPS)
- For local development: Use ngrok `ngrok http 3000`
- Update webhook URL in Meta Developer Console

#### 2. **Verify webhook is configured correctly**
- Go to Meta Developer Console > WhatsApp > Configuration
- Callback URL: `https://your-domain.com/api/webhook`
- Verify Token: Must match `WEBHOOK_VERIFY_TOKEN` in `.env.local`
- Subscribe to `messages` field

#### 3. **Check webhook logs**
- Go to Supabase > Table Editor > `webhook_logs`
- Check if webhooks are being received
- Look for any error messages

### Can't send messages

#### 1. **24-hour messaging window**
- You can only send messages within 24 hours of customer's last message
- Outside this window, you must use approved message templates

#### 2. **Phone number format**
- Use international format without + (e.g., `254768322488`)
- Dashboard handles formatting automatically

#### 3. **Access token expired**
- Generate a new permanent access token from Meta Developer Console
- Or use System User token for long-term access

#### 4. **Check Meta API errors**
- Check browser console for detailed error messages
- Common errors:
  - **Invalid access token**: Regenerate token
  - **Message undeliverable**: Check phone number format
  - **Template required**: Outside 24-hour window

### Database issues

#### 1. **Messages not storing**
- Verify Supabase migration ran successfully
- Check `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Check Supabase logs for errors

#### 2. **RLS (Row Level Security) errors**
- Make sure you're using `SUPABASE_SERVICE_ROLE_KEY` for server-side operations
- Check RLS policies in Supabase > Authentication > Policies

## n8n Integration

Your n8n workflow should call the check-human endpoint:

```
GET https://your-domain.com/api/check-human?phone=254768322488
```

**Response format:**
```json
{
  "phoneNumber": "254768322488",
  "humanActive": true,
  "lastHumanResponseTime": "2026-02-07T08:30:00.000Z",
  "hoursRemaining": 1.5,
  "message": "Human is active - AI should wait 1.5 more hours"
}
```

**Logic:**
- If `humanActive: true` → AI should NOT respond
- If `humanActive: false` → AI can respond
- Human is considered active for 2 hours after their last manual response

## Deployment to Netlify

1. **Push code to GitHub**
2. **Connect to Netlify:**
   - Go to [Netlify](https://netlify.com/)
   - Click "Add new site" > "Import an existing project"
   - Connect your GitHub repository

3. **Configure build settings:**
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Framework: Next.js

4. **Add environment variables:**
   - Go to Site Settings > Environment Variables
   - Add all variables from `.env.local`

5. **Deploy and get URL:**
   - Deploy the site
   - Copy your Netlify URL (e.g., `https://your-app.netlify.app`)

6. **Update WhatsApp webhook:**
   - Go to Meta Developer Console > WhatsApp > Configuration
   - Update Callback URL to: `https://your-app.netlify.app/api/webhook`
   - Verify and save

## Features

- ✅ **WhatsApp Cloud API Integration** - Official Meta WhatsApp Business API
- ✅ **Real-time webhooks** - Instant message delivery via webhooks
- ✅ **Supabase database** - All messages stored in PostgreSQL
- ✅ **Human/AI coordination** - 2-hour human response window
- ✅ **n8n integration** - Check-human endpoint for AI agent control
- ✅ **Message history** - Full conversation view with timestamps
- ✅ **Auto-refresh** - Updates every 5 seconds
- ✅ **Analytics** - Track AI vs human responses
- ✅ **Authentication** - Supabase auth for secure access
- ✅ **Responsive design** - Works on all screen sizes

## Next Steps

1. **Message templates** - Add support for WhatsApp message templates (for >24h window)
2. **Media support** - Handle images, documents, videos in UI
3. **Read receipts** - Mark messages as read
4. **Typing indicators** - Show when agent is typing
5. **Contact management** - Store customer information
6. **Team features** - Multiple agents, assignment, etc.

